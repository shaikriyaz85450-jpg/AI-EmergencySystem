import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IncidentRecord, ReportRecord } from "@/types/database";
import { recalculateIncidentFromReports } from "./recalculate-incident";
import { validateReassignOperation } from "./validate-operation";

export interface ReassignReportResult {
  success: boolean;
  isNoOp: boolean;
  report: ReportRecord;
  sourceIncident: IncidentRecord | null;
  targetIncident: IncidentRecord;
  summary: string;
}

/**
 * Operator workflow to reassign a single report from its current incident to another existing incident.
 *
 * Rules enforced:
 * - Preserves raw_content, classification, information_origin, and extracted fields.
 * - Preserves unverified evidence flag (`is_unverified_evidence`).
 * - Recalculates both source and target incidents without summing people counts.
 * - Records append-only `operator_reassign` entries in `public.incident_updates`.
 * - Idempotent: if `report.incident_id === targetIncidentId`, returns a clean no-op response.
 */
export async function reassignReportToIncident(params: {
  reportId: string;
  targetIncidentId: string;
}): Promise<ReassignReportResult> {
  const supabase = createSupabaseServerClient();

  const [
    { data: reportData, error: repErr },
    { data: targetData, error: tgtErr },
  ] = await Promise.all([
    supabase
      .from("reports")
      .select("*")
      .eq("id", params.reportId)
      .maybeSingle(),
    supabase
      .from("incidents")
      .select("*")
      .eq("id", params.targetIncidentId)
      .maybeSingle(),
  ]);

  if (repErr) throw new Error(`Failed to fetch report: ${repErr.message}`);
  if (tgtErr)
    throw new Error(`Failed to fetch target incident: ${tgtErr.message}`);

  const report = (reportData as ReportRecord | null) ?? null;
  const targetIncident = (targetData as IncidentRecord | null) ?? null;

  const validation = validateReassignOperation(report, targetIncident);
  if (!validation.valid || !report || !targetIncident) {
    throw new Error(validation.error ?? "Invalid reassign operation.");
  }

  // Idempotent no-op if the report already belongs to the target incident
  if (validation.isNoOp) {
    return {
      success: true,
      isNoOp: true,
      report,
      sourceIncident: null,
      targetIncident,
      summary: `Report ${report.id} is already assigned to ${targetIncident.incident_code}.`,
    };
  }

  const previousIncidentId = report.incident_id;
  let sourceIncidentBefore: IncidentRecord | null = null;

  if (previousIncidentId) {
    const { data: srcData } = await supabase
      .from("incidents")
      .select("*")
      .eq("id", previousIncidentId)
      .maybeSingle();
    sourceIncidentBefore = (srcData as IncidentRecord | null) ?? null;
  }

  const isUnverified =
    report.classification === "rumor_unverified" ||
    report.is_unverified_evidence;

  // Move the report to the target incident (never mutating raw_content or classification)
  const { data: updatedReportData, error: moveErr } = await supabase
    .from("reports")
    .update({
      incident_id: targetIncident.id,
      possible_incident_id: null,
      correlation_status: "operator_assigned",
      is_unverified_evidence: isUnverified,
      match_breakdown: {
        ...(report.match_breakdown ?? {}),
        explanation: `Operator manually reassigned report from ${
          sourceIncidentBefore?.incident_code ?? "Unassigned"
        } to ${targetIncident.incident_code}.`,
      },
    })
    .eq("id", report.id)
    .select("*")
    .single();

  if (moveErr || !updatedReportData) {
    throw new Error(
      `Failed to reassign report ${report.id}: ${
        moveErr?.message ?? "Unknown error"
      }`
    );
  }

  const updatedReport = updatedReportData as ReportRecord;
  const sourceCode = sourceIncidentBefore?.incident_code ?? "Unassigned";

  const auditSummary = `Operator reassigned report ${report.id.slice(
    0,
    8
  )} from ${sourceCode} to ${targetIncident.incident_code}.`;

  // Recalculate source incident (if it had one) and target incident
  let updatedSourceIncident: IncidentRecord | null = null;
  if (sourceIncidentBefore) {
    updatedSourceIncident = await recalculateIncidentFromReports(
      sourceIncidentBefore.id,
      `Operator moved report ${report.id.slice(0, 8)} to ${
        targetIncident.incident_code
      }.`
    );

    await supabase.from("incident_updates").insert({
      incident_id: sourceIncidentBefore.id,
      report_id: report.id,
      update_type: "operator_reassign",
      previous_status: sourceIncidentBefore.status,
      new_status: updatedSourceIncident.status,
      information_origin: "operator",
      summary: auditSummary,
      details: {
        operation: "reassign_report",
        operator_action: "manual_reassign_out",
        source_incident_id: sourceIncidentBefore.id,
        source_incident_code: sourceIncidentBefore.incident_code,
        target_incident_id: targetIncident.id,
        target_incident_code: targetIncident.incident_code,
        affected_report_ids: [report.id],
      },
    });
  }

  const updatedTargetIncident = await recalculateIncidentFromReports(
    targetIncident.id,
    `Operator assigned report ${report.id.slice(0, 8)} from ${sourceCode}.`
  );

  await supabase.from("incident_updates").insert({
    incident_id: targetIncident.id,
    report_id: report.id,
    update_type: "operator_reassign",
    previous_status: targetIncident.status,
    new_status: updatedTargetIncident.status,
    information_origin: "operator",
    summary: auditSummary,
    details: {
      operation: "reassign_report",
      operator_action: "manual_reassign_in",
      source_incident_id: sourceIncidentBefore?.id ?? null,
      source_incident_code: sourceCode,
      target_incident_id: targetIncident.id,
      target_incident_code: targetIncident.incident_code,
      affected_report_ids: [report.id],
    },
  });

  return {
    success: true,
    isNoOp: false,
    report: updatedReport,
    sourceIncident: updatedSourceIncident,
    targetIncident: updatedTargetIncident,
    summary: auditSummary,
  };
}
