import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IncidentRecord, ReportRecord } from "@/types/database";
import { recalculateIncidentFromReports } from "./recalculate-incident";
import { validateMergeOperation } from "./validate-operation";

export interface MergeIncidentsResult {
  success: boolean;
  isNoOp: boolean;
  sourceIncident: IncidentRecord;
  targetIncident: IncidentRecord;
  movedReportIds: string[];
  summary: string;
}

/**
 * Operator workflow to merge `sourceIncidentId` into `targetIncidentId` (surviving incident).
 *
 * Rules enforced:
 * - Preserves all reports, raw_content, classifications, extraction fields, and unverified evidence flags.
 * - Moves all reports belonging to `sourceIncidentId` to `targetIncidentId`.
 * - Recalculates `targetIncidentId` without summing people counts.
 * - Retires `sourceIncidentId` from active operational display without deleting its row or its historical `incident_updates`
 *   (sets `related_report_count = 0` and records `MERGED_INTO:<target_code>` in `resolution_notes`).
 * - Writes `operator_merge` audit entries to `public.incident_updates` on both incidents.
 * - Idempotent: repeating the same merge returns a clean no-op response.
 */
export async function mergeIncidents(params: {
  sourceIncidentId: string;
  targetIncidentId: string;
}): Promise<MergeIncidentsResult> {
  const supabase = createSupabaseServerClient();

  const [
    { data: sourceData, error: srcErr },
    { data: targetData, error: tgtErr },
  ] = await Promise.all([
    supabase
      .from("incidents")
      .select("*")
      .eq("id", params.sourceIncidentId)
      .maybeSingle(),
    supabase
      .from("incidents")
      .select("*")
      .eq("id", params.targetIncidentId)
      .maybeSingle(),
  ]);

  if (srcErr)
    throw new Error(`Failed to load source incident: ${srcErr.message}`);
  if (tgtErr)
    throw new Error(`Failed to load target incident: ${tgtErr.message}`);

  const sourceIncident = (sourceData as IncidentRecord | null) ?? null;
  const targetIncident = (targetData as IncidentRecord | null) ?? null;

  const validation = validateMergeOperation(sourceIncident, targetIncident);
  if (!validation.valid || !sourceIncident || !targetIncident) {
    throw new Error(validation.error ?? "Invalid merge operation.");
  }

  if (validation.isNoOp) {
    return {
      success: true,
      isNoOp: true,
      sourceIncident,
      targetIncident,
      movedReportIds: [],
      summary: `Incident ${sourceIncident.incident_code} was already merged into ${targetIncident.incident_code}.`,
    };
  }

  // Load all reports currently assigned to the source incident
  const { data: sourceReportsData, error: repErr } = await supabase
    .from("reports")
    .select("*")
    .eq("incident_id", sourceIncident.id)
    .order("reported_at", { ascending: true });

  if (repErr) {
    throw new Error(
      `Failed to load reports for source incident ${sourceIncident.incident_code}: ${repErr.message}`
    );
  }

  const sourceReports = (sourceReportsData ?? []) as ReportRecord[];
  const movedReportIds = sourceReports.map((r) => r.id);

  // Move every report from source incident to target incident
  for (const rep of sourceReports) {
    const isUnverified =
      rep.classification === "rumor_unverified" || rep.is_unverified_evidence;

    const { error: moveErr } = await supabase
      .from("reports")
      .update({
        incident_id: targetIncident.id,
        possible_incident_id: null,
        correlation_status: "operator_assigned",
        is_unverified_evidence: isUnverified,
        match_breakdown: {
          ...(rep.match_breakdown ?? {}),
          explanation: `Operator merged source incident ${sourceIncident.incident_code} into ${targetIncident.incident_code}.`,
        },
      })
      .eq("id", rep.id);

    if (moveErr) {
      throw new Error(
        `Failed to reassign report ${rep.id} during merge: ${moveErr.message}`
      );
    }
  }

  // Also redirect any pending possible_incident_id references pointing to sourceIncident
  await supabase
    .from("reports")
    .update({ possible_incident_id: targetIncident.id })
    .eq("possible_incident_id", sourceIncident.id);

  const mergeSummary = `Operator merged ${sourceIncident.incident_code} into ${targetIncident.incident_code}.`;

  // Retire source incident from active operational view without using 'Resolved' status
  // and without deleting historical rows
  const { data: updatedSourceData, error: srcUpdateErr } = await supabase
    .from("incidents")
    .update({
      related_report_count: 0,
      resolution_notes: `MERGED_INTO:${targetIncident.incident_code}:${targetIncident.id}`,
      latest_update_summary: mergeSummary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceIncident.id)
    .select("*")
    .single();

  if (srcUpdateErr || !updatedSourceData) {
    throw new Error(
      `Failed to retire merged source incident ${sourceIncident.incident_code}: ${srcUpdateErr?.message}`
    );
  }

  const updatedSourceIncident = updatedSourceData as IncidentRecord;

  // Recalculate surviving target incident from its combined reports (never summing people counts)
  const updatedTargetIncident = await recalculateIncidentFromReports(
    targetIncident.id,
    mergeSummary
  );

  // Record append-only audit trail in public.incident_updates on both incidents
  await supabase.from("incident_updates").insert([
    {
      incident_id: targetIncident.id,
      report_id: sourceReports[0]?.id ?? null,
      update_type: "operator_merge",
      previous_status: targetIncident.status,
      new_status: updatedTargetIncident.status,
      information_origin: "operator",
      summary: mergeSummary,
      details: {
        operation: "merge_incidents",
        operator_action: "manual_merge_target_surviving",
        source_incident_id: sourceIncident.id,
        source_incident_code: sourceIncident.incident_code,
        target_incident_id: targetIncident.id,
        target_incident_code: targetIncident.incident_code,
        affected_report_ids: movedReportIds,
      },
    },
    {
      incident_id: sourceIncident.id,
      report_id: sourceReports[0]?.id ?? null,
      update_type: "operator_merge",
      previous_status: sourceIncident.status,
      new_status: updatedSourceIncident.status,
      information_origin: "operator",
      summary: mergeSummary,
      details: {
        operation: "merge_incidents",
        operator_action: "manual_merge_source_retired",
        source_incident_id: sourceIncident.id,
        source_incident_code: sourceIncident.incident_code,
        target_incident_id: targetIncident.id,
        target_incident_code: targetIncident.incident_code,
        affected_report_ids: movedReportIds,
      },
    },
  ]);

  return {
    success: true,
    isNoOp: false,
    sourceIncident: updatedSourceIncident,
    targetIncident: updatedTargetIncident,
    movedReportIds,
    summary: mergeSummary,
  };
}
