import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  InformationOrigin,
  MatchBreakdown,
  ReportRecord,
  UrgencyLevel,
} from "@/types/database";
import type { ResolvedLocationResult } from "./resolve-location";

const ORIGIN_TRUST_RANK: Record<InformationOrigin, number> = {
  ai_extracted: 1,
  responder_confirmed: 2,
  operator: 3,
};

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
}

/**
 * Computes the people count state for an incident when a new report is correlated.
 *
 * CRITICAL RULE (Section 7 / MVP_SPEC.md §5):
 * NEVER SUM PEOPLE COUNTS ACROSS REPORTS.
 * - If a report is Rumor / Unverified, it NEVER alters the people count.
 * - If the incoming report has no explicit number (`null`), keep the existing explicit count.
 * - If both have explicit numbers from citizen reports that differ, track min/max range and keep the latest explicit count without summing.
 * - Higher-trust origin (`responder_confirmed`, `operator`) takes precedence over `ai_extracted`.
 */
export function resolvePeopleCountUpdate(
  incident: IncidentRecord,
  report: ReportRecord
): {
  people_affected_count: number | null;
  people_affected_min: number | null;
  people_affected_max: number | null;
  people_affected_description: string | null;
  people_count_origin: InformationOrigin;
} {
  // Rumor / Unverified reports must never change people count
  if (report.classification === "rumor_unverified") {
    return {
      people_affected_count: incident.people_affected_count,
      people_affected_min: incident.people_affected_min,
      people_affected_max: incident.people_affected_max,
      people_affected_description: incident.people_affected_description,
      people_count_origin: incident.people_count_origin,
    };
  }

  const incomingCount = report.people_affected_count;
  const existingCount = incident.people_affected_count;

  if (incomingCount === null) {
    return {
      people_affected_count: existingCount,
      people_affected_min: incident.people_affected_min,
      people_affected_max: incident.people_affected_max,
      people_affected_description:
        incident.people_affected_description ??
        report.people_affected_description,
      people_count_origin: incident.people_count_origin,
    };
  }

  const incomingTrust = ORIGIN_TRUST_RANK[report.information_origin] ?? 1;
  const existingTrust = ORIGIN_TRUST_RANK[incident.people_count_origin] ?? 1;

  if (existingCount === null || incomingTrust > existingTrust) {
    return {
      people_affected_count: incomingCount,
      people_affected_min: incomingCount,
      people_affected_max: incomingCount,
      people_affected_description:
        report.people_affected_description ?? `${incomingCount} people affected`,
      people_count_origin: report.information_origin,
    };
  }

  if (incomingTrust === existingTrust) {
    const minVal = Math.min(
      incident.people_affected_min ?? existingCount,
      incomingCount
    );
    const maxVal = Math.max(
      incident.people_affected_max ?? existingCount,
      incomingCount
    );
    return {
      people_affected_count: incomingCount,
      people_affected_min: minVal,
      people_affected_max: maxVal,
      people_affected_description:
        report.people_affected_description ??
        incident.people_affected_description,
      people_count_origin: incident.people_count_origin,
    };
  }

  // Incoming report has lower trust than existing responder/operator count
  return {
    people_affected_count: existingCount,
    people_affected_min: incident.people_affected_min,
    people_affected_max: incident.people_affected_max,
    people_affected_description: incident.people_affected_description,
    people_count_origin: incident.people_count_origin,
  };
}

/**
 * Generates sequential, human-readable incident codes (`INC-2026-001`, `INC-2026-002`, ...)
 */
async function generateNextIncidentCode(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from("incidents")
    .select("*", { count: "exact", head: true });

  const nextNum = (count ?? 0) + 1;
  return `INC-2026-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Creates a new incident in `public.incidents` from a qualifying `real_emergency` report,
 * links the report (`incident_id`), and creates the initial `incident_created` row in `public.incident_updates`.
 */
export async function createIncidentFromReport(
  report: ReportRecord,
  resolvedLocation: ResolvedLocationResult
): Promise<IncidentRecord> {
  const supabase = createSupabaseServerClient();

  const incidentCode = await generateNextIncidentCode();
  const incidentType =
    report.extracted_incident_type ?? "Emergency Assistance";
  const locationLabel =
    resolvedLocation.canonical_landmark ??
    resolvedLocation.resolved_area ??
    resolvedLocation.location_text;

  const title = `${incidentType} near ${locationLabel}`;
  const urgency: UrgencyLevel = report.extracted_urgency ?? "Medium";

  const initialMatchBreakdown: MatchBreakdown = {
    location_score: resolvedLocation.canonical_landmark ? 1.0 : 0.75,
    incident_type_score: 1.0,
    semantic_similarity_score: 1.0,
    time_proximity_score: 1.0,
    detail_consistency_score: 1.0,
    explanation: `Primary report initiated new incident ${incidentCode} at ${locationLabel}.`,
  };

  const insertPayload = {
    incident_code: incidentCode,
    title,
    summary: report.english_rendering ?? report.raw_content,
    incident_type: incidentType,
    status: "Active" as const,
    urgency,
    location_text: resolvedLocation.location_text,
    landmark_id: resolvedLocation.landmark_id,
    canonical_landmark: resolvedLocation.canonical_landmark,
    area: resolvedLocation.resolved_area,
    latitude: resolvedLocation.latitude,
    longitude: resolvedLocation.longitude,
    direction_offset: resolvedLocation.direction_offset,
    location_confidence: resolvedLocation.location_confidence,
    people_affected_count: report.people_affected_count,
    people_affected_min: report.people_affected_count,
    people_affected_max: report.people_affected_count,
    people_affected_description: report.people_affected_description,
    people_count_origin: report.information_origin,
    vulnerable_people: report.vulnerable_people ?? [],
    resources_needed: report.resources_needed ?? [],
    information_origin: report.information_origin,
    confidence_score: report.extraction_confidence ?? 0.88,
    evidence_summary: report.important_evidence ?? report.raw_content,
    uncertainty_notes:
      report.people_affected_count === null
        ? "Exact number of affected people not explicitly stated in initial report."
        : null,
    related_report_count: 1,
    latest_update_summary: `Initial report received via ${report.source_channel.toUpperCase()}: "${report.raw_content}"`,
    resolution_pending: false,
  };

  const { data: createdIncident, error: createError } = await supabase
    .from("incidents")
    .insert(insertPayload)
    .select("*")
    .single();

  if (createError || !createdIncident) {
    throw new Error(
      `Failed to create incident: ${createError?.message ?? "Unknown error"}`
    );
  }

  const incident = createdIncident as IncidentRecord;

  // Link the report to the newly created incident
  const { error: reportUpdateError } = await supabase
    .from("reports")
    .update({
      incident_id: incident.id,
      possible_incident_id: null,
      correlation_status: "new_incident",
      match_score: 1.0,
      match_breakdown: initialMatchBreakdown,
      is_unverified_evidence: false,
      landmark_id: resolvedLocation.landmark_id,
      canonical_landmark: resolvedLocation.canonical_landmark,
      resolved_area: resolvedLocation.resolved_area,
      latitude: resolvedLocation.latitude,
      longitude: resolvedLocation.longitude,
      direction_offset: resolvedLocation.direction_offset,
      location_confidence: resolvedLocation.location_confidence,
    })
    .eq("id", report.id);

  if (reportUpdateError) {
    throw new Error(
      `Failed to link report ${report.id} to incident ${incident.incident_code}: ${reportUpdateError.message}`
    );
  }

  // Record append-only timeline entry in public.incident_updates
  await supabase.from("incident_updates").insert({
    incident_id: incident.id,
    report_id: report.id,
    update_type: "incident_created",
    previous_status: null,
    new_status: "Active",
    information_origin: report.information_origin,
    summary: `Incident ${incident.incident_code} (${incident.incident_type}) created from ${report.source_channel} report near ${locationLabel}.`,
    details: {
      incident_code: incident.incident_code,
      people_affected_count: incident.people_affected_count,
      canonical_landmark: incident.canonical_landmark,
      urgency: incident.urgency,
    },
  });

  return incident;
}

/**
 * Attaches a correlated report (either a verified/real_emergency report or a rumor_unverified
 * supporting evidence report) to an existing incident, preserving all safety rules.
 */
export async function attachReportToExistingIncident(
  incident: IncidentRecord,
  report: ReportRecord,
  resolvedLocation: ResolvedLocationResult,
  matchScore: number,
  matchBreakdown: MatchBreakdown
): Promise<IncidentRecord> {
  const supabase = createSupabaseServerClient();

  const isUnverifiedRumor = report.classification === "rumor_unverified";

  // Idempotency check: if this report is already linked to this incident, do not double-update
  if (report.incident_id === incident.id) {
    return incident;
  }

  // Link the report in public.reports (preserving original classification, information_origin, and raw_content)
  const { error: linkError } = await supabase
    .from("reports")
    .update({
      incident_id: incident.id,
      possible_incident_id: null,
      correlation_status: "matched",
      match_score: matchScore,
      match_breakdown: matchBreakdown,
      is_unverified_evidence: isUnverifiedRumor,
      landmark_id: resolvedLocation.landmark_id ?? report.landmark_id,
      canonical_landmark:
        resolvedLocation.canonical_landmark ?? report.canonical_landmark,
      resolved_area: resolvedLocation.resolved_area ?? report.resolved_area,
      latitude: resolvedLocation.latitude ?? report.latitude,
      longitude: resolvedLocation.longitude ?? report.longitude,
      direction_offset:
        resolvedLocation.direction_offset ?? report.direction_offset,
      location_confidence:
        resolvedLocation.location_confidence ?? report.location_confidence,
    })
    .eq("id", report.id);

  if (linkError) {
    throw new Error(
      `Failed to attach report ${report.id} to incident ${incident.incident_code}: ${linkError.message}`
    );
  }

  // Count actual correlated reports in public.reports for this incident (excluding filtered)
  const { count: correlatedCount } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("incident_id", incident.id)
    .neq("classification", "general_question")
    .neq("classification", "irrelevant");

  const nextReportCount = correlatedCount ?? incident.related_report_count + 1;

  if (isUnverifiedRumor) {
    // Rumor / Unverified evidence:
    // - Do NOT alter people_affected_count
    // - Do NOT elevate urgency or information_origin
    // - Record in uncertainty_notes and latest_update_summary
    const unverifiedNote = `Unverified ${report.source_channel} report noted ("${report.raw_content}"); held as supporting context without altering verified counts.`;
    const updatedUncertaintyNotes = incident.uncertainty_notes
      ? `${incident.uncertainty_notes} | ${unverifiedNote}`
      : unverifiedNote;

    const { data: updatedIncident, error: updateErr } = await supabase
      .from("incidents")
      .update({
        related_report_count: nextReportCount,
        uncertainty_notes: updatedUncertaintyNotes,
        latest_update_summary: `Unverified supporting report linked (${report.source_channel}): "${report.raw_content}"`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", incident.id)
      .select("*")
      .single();

    if (updateErr || !updatedIncident) {
      throw new Error(
        `Failed to update incident ${incident.incident_code}: ${updateErr?.message}`
      );
    }

    await supabase.from("incident_updates").insert({
      incident_id: incident.id,
      report_id: report.id,
      update_type: "unverified_evidence_attached",
      previous_status: incident.status,
      new_status: incident.status,
      information_origin: report.information_origin,
      summary: `Unverified report attached as supporting context to ${incident.incident_code}: "${report.raw_content}"`,
      details: {
        match_score: matchScore,
        match_breakdown: matchBreakdown,
        classification: report.classification,
      },
    });

    return updatedIncident as IncidentRecord;
  }

  // Real Emergency report correlated to existing incident:
  // Apply NEVER SUM people count rule
  const peopleUpdate = resolvePeopleCountUpdate(incident, report);
  const mergedVulnerable = mergeUniqueStrings(
    incident.vulnerable_people,
    report.vulnerable_people
  );
  const mergedResources = mergeUniqueStrings(
    incident.resources_needed,
    report.resources_needed
  );

  // Determine urgency (only escalate if incoming report has higher urgency evidence)
  const incomingUrgency = report.extracted_urgency ?? "Medium";
  const nextUrgency: UrgencyLevel =
    URGENCY_RANK[incomingUrgency] > URGENCY_RANK[incident.urgency]
      ? incomingUrgency
      : incident.urgency;

  // Determine highest trust origin
  const nextOrigin: InformationOrigin =
    ORIGIN_TRUST_RANK[report.information_origin] >
    ORIGIN_TRUST_RANK[incident.information_origin]
      ? report.information_origin
      : incident.information_origin;

  const nextEvidenceSummary = incident.evidence_summary
    ? `${incident.evidence_summary} | ${
        report.important_evidence ?? report.raw_content
      }`
    : report.important_evidence ?? report.raw_content;

  const nextResolutionPending =
    incident.status !== "Resolved" && report.reports_resolution
      ? true
      : incident.resolution_pending;

  const { data: updatedIncident, error: updateErr } = await supabase
    .from("incidents")
    .update({
      urgency: nextUrgency,
      people_affected_count: peopleUpdate.people_affected_count,
      people_affected_min: peopleUpdate.people_affected_min,
      people_affected_max: peopleUpdate.people_affected_max,
      people_affected_description: peopleUpdate.people_affected_description,
      people_count_origin: peopleUpdate.people_count_origin,
      vulnerable_people: mergedVulnerable,
      resources_needed: mergedResources,
      information_origin: nextOrigin,
      evidence_summary: nextEvidenceSummary,
      related_report_count: nextReportCount,
      resolution_pending: nextResolutionPending,
      latest_update_summary: `Correlated ${report.source_channel} report: "${report.raw_content}"`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incident.id)
    .select("*")
    .single();

  if (updateErr || !updatedIncident) {
    throw new Error(
      `Failed to update incident ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  await supabase.from("incident_updates").insert({
    incident_id: incident.id,
    report_id: report.id,
    update_type: "report_correlated",
    previous_status: incident.status,
    new_status: incident.status,
    information_origin: report.information_origin,
    summary: `Correlated ${report.source_channel} report to ${incident.incident_code} (Match: ${Math.round(
      matchScore * 100
    )}%).`,
    details: {
      match_score: matchScore,
      match_breakdown: matchBreakdown,
      people_affected_count: peopleUpdate.people_affected_count,
      detected_language: report.detected_language,
    },
  });

  if (
    peopleUpdate.people_affected_count !== null &&
    peopleUpdate.people_affected_count !== incident.people_affected_count
  ) {
    await supabase.from("incident_updates").insert({
      incident_id: incident.id,
      report_id: report.id,
      update_type: "people_count_update",
      previous_status: incident.status,
      new_status: incident.status,
      information_origin: report.information_origin,
      summary: `People affected count updated from ${
        incident.people_affected_count ?? "Unknown"
      } to ${peopleUpdate.people_affected_count} on ${
        incident.incident_code
      } via ${report.source_channel} report (replaced latest explicit count; never summed).`,
      details: {
        previous_people_affected_count: incident.people_affected_count,
        new_people_affected_count: peopleUpdate.people_affected_count,
        report_id: report.id,
      },
    });
  }

  if (
    report.reports_resolution &&
    incident.status !== "Resolved" &&
    !incident.resolution_pending
  ) {
    await supabase.from("incident_updates").insert({
      incident_id: incident.id,
      report_id: report.id,
      update_type: "resolution_pending",
      previous_status: incident.status,
      new_status: incident.status,
      information_origin: report.information_origin,
      summary: `Resolution pending on ${incident.incident_code} (status remains ${incident.status} awaiting responder/operator verification): "${report.raw_content}"`,
      details: {
        resolution_pending: true,
        report_id: report.id,
      },
    });
  }

  return updatedIncident as IncidentRecord;
}
