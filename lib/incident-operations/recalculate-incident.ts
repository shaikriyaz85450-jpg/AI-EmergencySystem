import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  InformationOrigin,
  ReportRecord,
  UrgencyLevel,
} from "@/types/database";

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

/**
 * Recalculates an incident's aggregated fields strictly from its currently assigned
 * reports in `public.reports`, adhering to all Phase 5 & Phase 6 rules:
 *
 * 1. NEVER SUM people counts across reports.
 *    - Verified (`real_emergency`) reports with explicit `people_affected_count` are ranked by
 *      `information_origin` trust (`operator` > `responder_confirmed` > `ai_extracted`), then by `reported_at` (latest).
 *    - `people_affected_min` and `people_affected_max` reflect the min/max of explicit counts at the highest trust tier.
 *    - `rumor_unverified` reports NEVER affect `people_affected_count`.
 * 2. `related_report_count` equals the exact count of non-filtered reports assigned to the incident.
 * 3. Preserves reliable incident fields (type, canonical landmark, urgency, origin) when reports are removed,
 *    while updating counts, evidence, and uncertainty notes accurately.
 */
export async function recalculateIncidentFromReports(
  incidentId: string,
  latestSummaryOverride?: string
): Promise<IncidentRecord> {
  const supabase = createSupabaseServerClient();

  const [
    { data: incidentData, error: incErr },
    { data: reportsData, error: repErr },
  ] = await Promise.all([
    supabase.from("incidents").select("*").eq("id", incidentId).single(),
    supabase
      .from("reports")
      .select("*")
      .eq("incident_id", incidentId)
      .order("reported_at", { ascending: true }),
  ]);

  if (incErr || !incidentData) {
    throw new Error(
      `Failed to load incident ${incidentId} for recalculation: ${
        incErr?.message ?? "Not found"
      }`
    );
  }
  if (repErr) {
    throw new Error(
      `Failed to load reports for incident ${incidentId}: ${repErr.message}`
    );
  }

  const incident = incidentData as IncidentRecord;
  const assignedReports = ((reportsData ?? []) as ReportRecord[]).filter(
    (r) =>
      r.classification !== "general_question" &&
      r.classification !== "irrelevant"
  );

  const relatedReportCount = assignedReports.length;

  // Separate verified emergency reports from unverified rumors
  const verifiedReports = assignedReports.filter(
    (r) => r.classification === "real_emergency" && !r.is_unverified_evidence
  );
  const unverifiedReports = assignedReports.filter(
    (r) => r.classification === "rumor_unverified" || r.is_unverified_evidence
  );

  // 1. People Affected Calculation (NEVER SUM!)
  const reportsWithExplicitCount = verifiedReports.filter(
    (r) =>
      typeof r.people_affected_count === "number" &&
      r.people_affected_count >= 0
  );

  let peopleAffectedCount: number | null = null;
  let peopleAffectedMin: number | null = null;
  let peopleAffectedMax: number | null = null;
  let peopleAffectedDescription: string | null = null;
  let peopleCountOrigin: InformationOrigin = "ai_extracted";

  if (reportsWithExplicitCount.length > 0) {
    // Find highest trust rank among reports with explicit numbers
    const maxTrust = Math.max(
      ...reportsWithExplicitCount.map(
        (r) => ORIGIN_TRUST_RANK[r.information_origin] ?? 1
      )
    );
    const highestTrustCountReports = reportsWithExplicitCount.filter(
      (r) => (ORIGIN_TRUST_RANK[r.information_origin] ?? 1) === maxTrust
    );
    // Latest explicit count at the highest trust level
    const latestExplicitReport =
      highestTrustCountReports[highestTrustCountReports.length - 1];
    const counts = highestTrustCountReports.map(
      (r) => r.people_affected_count as number
    );

    peopleAffectedCount = latestExplicitReport.people_affected_count;
    peopleAffectedMin = Math.min(...counts);
    peopleAffectedMax = Math.max(...counts);
    peopleAffectedDescription =
      latestExplicitReport.people_affected_description ??
      `${peopleAffectedCount} people affected`;
    peopleCountOrigin = latestExplicitReport.information_origin;
  } else {
    // Check if any verified report has a non-numeric description (e.g., "Several people need assistance")
    const descriptiveReport = [...verifiedReports]
      .reverse()
      .find((r) => Boolean(r.people_affected_description));
    peopleAffectedCount = null;
    peopleAffectedMin = null;
    peopleAffectedMax = null;
    peopleAffectedDescription =
      descriptiveReport?.people_affected_description ?? null;
    peopleCountOrigin =
      descriptiveReport?.information_origin ?? incident.people_count_origin;
  }

  // 2. Vulnerable People & Resources Needed (Union across verified reports, fallback to all assigned)
  const sourceReportsForAttributes =
    verifiedReports.length > 0 ? verifiedReports : assignedReports;

  const vulnerableSet = new Set<string>();
  const resourcesSet = new Set<string>();

  for (const r of sourceReportsForAttributes) {
    for (const v of r.vulnerable_people ?? []) {
      if (v) vulnerableSet.add(v);
    }
    for (const res of r.resources_needed ?? []) {
      if (res) resourcesSet.add(res);
    }
  }

  const vulnerablePeople = Array.from(vulnerableSet);
  const resourcesNeeded =
    resourcesSet.size > 0
      ? Array.from(resourcesSet)
      : relatedReportCount > 0
      ? incident.resources_needed
      : [];

  // 3. Urgency (highest urgency among verified reports, or preserve incident urgency if still active)
  let computedUrgency: UrgencyLevel =
    verifiedReports.length > 0 ? "Low" : incident.urgency;
  for (const r of verifiedReports) {
    const u = r.extracted_urgency ?? "Medium";
    if (URGENCY_RANK[u] > URGENCY_RANK[computedUrgency]) {
      computedUrgency = u;
    }
  }

  // 4. Information Origin (highest trust among assigned reports)
  let highestOrigin: InformationOrigin = "ai_extracted";
  for (const r of assignedReports) {
    if (
      (ORIGIN_TRUST_RANK[r.information_origin] ?? 1) >
      (ORIGIN_TRUST_RANK[highestOrigin] ?? 1)
    ) {
      highestOrigin = r.information_origin;
    }
  }

  // 5. Evidence Summary & Uncertainty Notes
  const evidenceSnippets = verifiedReports.map(
    (r) => r.important_evidence ?? r.raw_content
  );
  const evidenceSummary =
    evidenceSnippets.length > 0
      ? evidenceSnippets.join(" | ")
      : assignedReports.map((r) => r.raw_content).join(" | ") ||
        incident.evidence_summary;

  const uncertaintyParts: string[] = [];
  if (peopleAffectedCount === null && relatedReportCount > 0) {
    uncertaintyParts.push(
      "Exact number of affected people not explicitly stated."
    );
  }
  for (const ur of unverifiedReports) {
    uncertaintyParts.push(
      `Unverified ${ur.source_channel} report noted ("${ur.raw_content}"); held as supporting context without altering verified counts.`
    );
  }
  const uncertaintyNotes =
    uncertaintyParts.length > 0 ? uncertaintyParts.join(" | ") : null;

  const updatePayload: Record<string, unknown> = {
    related_report_count: relatedReportCount,
    people_affected_count: peopleAffectedCount,
    people_affected_min: peopleAffectedMin,
    people_affected_max: peopleAffectedMax,
    people_affected_description: peopleAffectedDescription,
    people_count_origin: peopleCountOrigin,
    vulnerable_people: vulnerablePeople,
    resources_needed: resourcesNeeded,
    urgency: computedUrgency,
    information_origin:
      relatedReportCount > 0 ? highestOrigin : incident.information_origin,
    evidence_summary: evidenceSummary,
    uncertainty_notes: uncertaintyNotes,
    updated_at: new Date().toISOString(),
  };

  if (latestSummaryOverride) {
    updatePayload.latest_update_summary = latestSummaryOverride;
  }

  const { data: updatedData, error: updateErr } = await supabase
    .from("incidents")
    .update(updatePayload)
    .eq("id", incidentId)
    .select("*")
    .single();

  if (updateErr || !updatedData) {
    throw new Error(
      `Failed to save recalculated incident ${incident.incident_code}: ${updateErr?.message}`
    );
  }

  return updatedData as IncidentRecord;
}
