import type { IncidentRecord, ReportRecord } from "@/types/database";

export function isIncidentMergedIntoAnother(incident: IncidentRecord): boolean {
  if ((incident.resolution_notes ?? "").startsWith("MERGED_INTO:")) {
    return true;
  }
  return false;
}

export function validateMergeOperation(
  sourceIncident: IncidentRecord | null,
  targetIncident: IncidentRecord | null
): { valid: boolean; isNoOp?: boolean; error?: string } {
  if (!sourceIncident) {
    return { valid: false, error: "Source incident not found." };
  }
  if (!targetIncident) {
    return { valid: false, error: "Target (surviving) incident not found." };
  }
  if (sourceIncident.id === targetIncident.id) {
    return {
      valid: false,
      error: "Cannot merge an incident into itself. Select two distinct incidents.",
    };
  }
  if (isIncidentMergedIntoAnother(targetIncident)) {
    return {
      valid: false,
      error: `Target incident ${targetIncident.incident_code} has already been merged into another incident and cannot be the surviving incident.`,
    };
  }
  if (
    (sourceIncident.resolution_notes ?? "").startsWith(
      `MERGED_INTO:${targetIncident.incident_code}`
    ) &&
    sourceIncident.related_report_count === 0
  ) {
    return { valid: true, isNoOp: true };
  }
  if (isIncidentMergedIntoAnother(sourceIncident)) {
    return {
      valid: false,
      error: `Source incident ${sourceIncident.incident_code} has already been merged.`,
    };
  }
  return { valid: true };
}

export function validateSplitOperation(
  sourceIncident: IncidentRecord | null,
  allIncidentReports: ReportRecord[],
  selectedReportIds: string[]
): { valid: boolean; error?: string } {
  if (!sourceIncident) {
    return { valid: false, error: "Source incident not found." };
  }
  if (isIncidentMergedIntoAnother(sourceIncident)) {
    return {
      valid: false,
      error: `Incident ${sourceIncident.incident_code} has already been merged and cannot be split.`,
    };
  }
  if (!Array.isArray(selectedReportIds) || selectedReportIds.length === 0) {
    return {
      valid: false,
      error: "Select at least one report to split into a new incident.",
    };
  }

  const uniqueSelected = Array.from(new Set(selectedReportIds));
  const incidentReportIdSet = new Set(allIncidentReports.map((r) => r.id));

  for (const repId of uniqueSelected) {
    if (!incidentReportIdSet.has(repId)) {
      return {
        valid: false,
        error: `Report ${repId} does not currently belong to incident ${sourceIncident.incident_code}.`,
      };
    }
  }

  if (uniqueSelected.length >= allIncidentReports.length) {
    return {
      valid: false,
      error: `Cannot split all ${allIncidentReports.length} report(s) out of ${sourceIncident.incident_code}. At least one report must remain in the original incident (use Reassign or Merge if moving all reports).`,
    };
  }

  const selectedReports = allIncidentReports.filter((r) =>
    uniqueSelected.includes(r.id)
  );
  const hasActionableContent = selectedReports.some(
    (r) =>
      r.classification === "real_emergency" ||
      r.classification === "rumor_unverified"
  );
  if (!hasActionableContent) {
    return {
      valid: false,
      error:
        "Selected reports are filtered non-emergency messages and cannot form an emergency incident.",
    };
  }

  return { valid: true };
}

export function validateReassignOperation(
  report: ReportRecord | null,
  targetIncident: IncidentRecord | null
): { valid: boolean; isNoOp?: boolean; error?: string } {
  if (!report) {
    return { valid: false, error: "Report not found." };
  }
  if (!targetIncident) {
    return { valid: false, error: "Target incident not found." };
  }
  if (isIncidentMergedIntoAnother(targetIncident)) {
    return {
      valid: false,
      error: `Target incident ${targetIncident.incident_code} has been merged and is no longer an active target.`,
    };
  }
  if (
    report.classification === "general_question" ||
    report.classification === "irrelevant"
  ) {
    return {
      valid: false,
      error: `Filtered report (${report.classification}) cannot be assigned to an emergency incident.`,
    };
  }
  if (report.incident_id === targetIncident.id) {
    return { valid: true, isNoOp: true };
  }
  return { valid: true };
}
