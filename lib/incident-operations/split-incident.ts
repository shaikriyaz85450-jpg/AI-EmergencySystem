import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  InformationOrigin,
  ReportRecord,
  UrgencyLevel,
} from "@/types/database";
import { recalculateIncidentFromReports } from "./recalculate-incident";
import { validateSplitOperation } from "./validate-operation";

export interface SplitIncidentResult {
  success: boolean;
  sourceIncident: IncidentRecord;
  newIncident: IncidentRecord;
  movedReportIds: string[];
  summary: string;
}

async function generateNextSequentialIncidentCode(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("incidents")
    .select("incident_code");

  let maxNum = 0;
  for (const row of (data ?? []) as { incident_code: string }[]) {
    const match = row.incident_code.match(/^INC-2026-(\d+)$/);
    if (match && match[1]) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }

  return `INC-2026-${String(maxNum + 1).padStart(3, "0")}`;
}

/**
 * Operator workflow to split selected reports out of an existing incident into a brand-new incident.
 *
 * Rules enforced:
 * - Validates that all selected reports belong to `incidentId` and that at least 1 report remains in the source incident.
 * - Derives the new incident strictly from the selected reports' extracted fields without inventing unsupported data.
 * - Moves selected reports to the new incident (`correlation_status = 'operator_assigned'`).
 * - Recalculates both source and new incidents (never summing people counts).
 * - Creates append-only `operator_split` entries in `public.incident_updates` on both incidents.
 */
export async function splitIncidentReports(params: {
  incidentId: string;
  reportIds: string[];
}): Promise<SplitIncidentResult> {
  const supabase = createSupabaseServerClient();
  const uniqueReportIds = Array.from(new Set(params.reportIds));

  const [
    { data: sourceData, error: srcErr },
    { data: reportsData, error: repErr },
  ] = await Promise.all([
    supabase
      .from("incidents")
      .select("*")
      .eq("id", params.incidentId)
      .maybeSingle(),
    supabase
      .from("reports")
      .select("*")
      .eq("incident_id", params.incidentId)
      .order("reported_at", { ascending: true }),
  ]);

  if (srcErr)
    throw new Error(`Failed to load source incident: ${srcErr.message}`);
  if (repErr)
    throw new Error(`Failed to load incident reports: ${repErr.message}`);

  const sourceIncident = (sourceData as IncidentRecord | null) ?? null;
  const allIncidentReports = (reportsData ?? []) as ReportRecord[];

  const validation = validateSplitOperation(
    sourceIncident,
    allIncidentReports,
    uniqueReportIds
  );

  if (!validation.valid || !sourceIncident) {
    throw new Error(validation.error ?? "Invalid split operation.");
  }

  const selectedReports = allIncidentReports.filter((r) =>
    uniqueReportIds.includes(r.id)
  );

  // Derive initial fields for the new incident from the primary selected report
  const primaryVerified =
    selectedReports.find((r) => r.classification === "real_emergency") ??
    selectedReports[0];

  const newIncidentCode = await generateNextSequentialIncidentCode();

  const derivedIncidentType =
    primaryVerified.extracted_incident_type ?? sourceIncident.incident_type;

  const derivedLandmark = primaryVerified.canonical_landmark ?? null;
  const derivedArea =
    primaryVerified.resolved_area ?? sourceIncident.area ?? null;
  const derivedLocationText =
    primaryVerified.extracted_location ??
    derivedLandmark ??
    (derivedArea ? `${derivedArea} area` : sourceIncident.location_text);

  const locationDisplayForTitle =
    derivedLandmark ?? derivedArea ?? derivedLocationText;

  const derivedTitle = `${derivedIncidentType} near ${locationDisplayForTitle}`;

  const derivedUrgency: UrgencyLevel =
    primaryVerified.extracted_urgency ??
    (primaryVerified.classification === "rumor_unverified"
      ? "Low"
      : sourceIncident.urgency);

  const derivedOrigin: InformationOrigin = primaryVerified.information_origin;

  const initialInsertPayload = {
    incident_code: newIncidentCode,
    title: derivedTitle,
    summary: primaryVerified.english_rendering ?? primaryVerified.raw_content,
    incident_type: derivedIncidentType,
    status: "Active" as const,
    urgency: derivedUrgency,
    location_text: derivedLocationText,
    landmark_id: primaryVerified.landmark_id,
    canonical_landmark: derivedLandmark,
    area: derivedArea,
    latitude: primaryVerified.latitude,
    longitude: primaryVerified.longitude,
    direction_offset: primaryVerified.direction_offset,
    location_confidence: primaryVerified.location_confidence ?? 0.65,
    people_affected_count:
      primaryVerified.classification === "real_emergency"
        ? primaryVerified.people_affected_count
        : null,
    people_affected_min:
      primaryVerified.classification === "real_emergency"
        ? primaryVerified.people_affected_count
        : null,
    people_affected_max:
      primaryVerified.classification === "real_emergency"
        ? primaryVerified.people_affected_count
        : null,
    people_affected_description:
      primaryVerified.classification === "real_emergency"
        ? primaryVerified.people_affected_description
        : null,
    people_count_origin: derivedOrigin,
    vulnerable_people: primaryVerified.vulnerable_people ?? [],
    resources_needed: primaryVerified.resources_needed ?? [],
    information_origin: derivedOrigin,
    confidence_score: primaryVerified.extraction_confidence ?? 0.85,
    evidence_summary:
      primaryVerified.important_evidence ?? primaryVerified.raw_content,
    uncertainty_notes: null,
    related_report_count: selectedReports.length,
    latest_update_summary: `Split from ${sourceIncident.incident_code} by operator.`,
    resolution_pending: false,
  };

  // Check if there is an existing retired/merged incident row with 0 reports that can be repurposed,
  // or insert a new incident row.
  const { data: retiredRows } = await supabase
    .from("incidents")
    .select("*")
    .eq("related_report_count", 0)
    .like("resolution_notes", "MERGED_INTO:%")
    .order("created_at", { ascending: true })
    .limit(1);

  let createdIncident: IncidentRecord;

  if (retiredRows && retiredRows.length > 0) {
    const existingRetired = retiredRows[0] as IncidentRecord;
    const reuseCode = existingRetired.incident_code.startsWith("INC-2026-")
      ? existingRetired.incident_code
      : newIncidentCode;

    const { data: reusedData, error: reuseErr } = await supabase
      .from("incidents")
      .update({
        ...initialInsertPayload,
        incident_code: reuseCode,
        resolution_notes: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingRetired.id)
      .select("*")
      .single();

    if (reuseErr || !reusedData) {
      throw new Error(
        `Failed to initialize split incident: ${
          reuseErr?.message ?? "Unknown error"
        }`
      );
    }
    createdIncident = reusedData as IncidentRecord;
  } else {
    const { data: createdData, error: createErr } = await supabase
      .from("incidents")
      .insert(initialInsertPayload)
      .select("*")
      .single();

    if (createErr || !createdData) {
      throw new Error(
        `Failed to create split incident: ${
          createErr?.message ?? "Unknown error"
        }`
      );
    }
    createdIncident = createdData as IncidentRecord;
  }

  // Move selected reports to the newly created incident
  for (const rep of selectedReports) {
    const isUnverified =
      rep.classification === "rumor_unverified" || rep.is_unverified_evidence;

    const { error: moveErr } = await supabase
      .from("reports")
      .update({
        incident_id: createdIncident.id,
        possible_incident_id: null,
        correlation_status: "operator_assigned",
        is_unverified_evidence: isUnverified,
        match_breakdown: {
          ...(rep.match_breakdown ?? {}),
          explanation: `Operator split report from ${sourceIncident.incident_code} into ${createdIncident.incident_code}.`,
        },
      })
      .eq("id", rep.id);

    if (moveErr) {
      throw new Error(
        `Failed to move report ${rep.id} to split incident ${createdIncident.incident_code}: ${moveErr.message}`
      );
    }
  }

  const splitSummary = `Operator split ${selectedReports.length} report${
    selectedReports.length === 1 ? "" : "s"
  } from ${sourceIncident.incident_code} into ${createdIncident.incident_code}.`;

  // Recalculate both incidents from their resulting assigned reports
  const [recalculatedSource, recalculatedNew] = await Promise.all([
    recalculateIncidentFromReports(sourceIncident.id, splitSummary),
    recalculateIncidentFromReports(createdIncident.id, splitSummary),
  ]);

  // Write append-only audit trail entries on both incidents
  await supabase.from("incident_updates").insert([
    {
      incident_id: sourceIncident.id,
      report_id: selectedReports[0]?.id ?? null,
      update_type: "operator_split",
      previous_status: sourceIncident.status,
      new_status: recalculatedSource.status,
      information_origin: "operator",
      summary: splitSummary,
      details: {
        operation: "split_incident",
        operator_action: "manual_split_source",
        source_incident_id: sourceIncident.id,
        source_incident_code: sourceIncident.incident_code,
        target_incident_id: recalculatedNew.id,
        target_incident_code: recalculatedNew.incident_code,
        affected_report_ids: uniqueReportIds,
      },
    },
    {
      incident_id: recalculatedNew.id,
      report_id: selectedReports[0]?.id ?? null,
      update_type: "operator_split",
      previous_status: null,
      new_status: recalculatedNew.status,
      information_origin: "operator",
      summary: splitSummary,
      details: {
        operation: "split_incident",
        operator_action: "manual_split_created",
        source_incident_id: sourceIncident.id,
        source_incident_code: sourceIncident.incident_code,
        target_incident_id: recalculatedNew.id,
        target_incident_code: recalculatedNew.incident_code,
        affected_report_ids: uniqueReportIds,
      },
    },
  ]);

  return {
    success: true,
    sourceIncident: recalculatedSource,
    newIncident: recalculatedNew,
    movedReportIds: uniqueReportIds,
    summary: splitSummary,
  };
}
