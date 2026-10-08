import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  IncidentRecord,
  LandmarkRecord,
  MatchBreakdown,
  ReportRecord,
} from "@/types/database";
import {
  attachReportToExistingIncident,
  createIncidentFromReport,
} from "./create-or-update-incident";
import { findMatchingIncident } from "./find-matching-incident";
import { resolveReportLocation } from "./resolve-location";

export interface ReportCorrelationOutcome {
  report_id: string;
  classification: string;
  action:
    | "already_correlated"
    | "filtered_skipped"
    | "created_new_incident"
    | "matched_existing_incident"
    | "attached_unverified_evidence"
    | "possible_match_flagged"
    | "held_unverified";
  incident_id: string | null;
  incident_code: string | null;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
}

/**
 * Correlates a single report against existing open incidents in Supabase.
 *
 * Rules enforced:
 * 1. Idempotent: if `report.incident_id` is already set, returns existing link without duplicating.
 * 2. Filtered reports (`general_question`, `irrelevant`) remain `correlation_status = 'filtered'`, `incident_id = null`.
 * 3. `real_emergency` reports either match an existing compatible incident or create a new `Active` incident.
 * 4. `rumor_unverified` reports never create a new incident on their own, but if they match an active incident
 *    (by hazard + location/area), they attach as `is_unverified_evidence = true` while preserving their `rumor_unverified` classification.
 */
export async function correlateSingleReport(
  report: ReportRecord,
  landmarks: LandmarkRecord[],
  openIncidents: IncidentRecord[]
): Promise<{
  outcome: ReportCorrelationOutcome;
  updatedIncidents: IncidentRecord[];
}> {
  const supabase = createSupabaseServerClient();

  // 1. Idempotency check: if already linked to an incident, skip re-creation
  if (report.incident_id) {
    const existing = openIncidents.find((inc) => inc.id === report.incident_id);
    return {
      outcome: {
        report_id: report.id,
        classification: report.classification,
        action: "already_correlated",
        incident_id: report.incident_id,
        incident_code: existing?.incident_code ?? null,
        match_score: report.match_score,
        match_breakdown: report.match_breakdown,
      },
      updatedIncidents: openIncidents,
    };
  }

  // 2. General Question / Irrelevant -> must remain filtered and NEVER attach or create an incident
  if (
    report.classification === "general_question" ||
    report.classification === "irrelevant"
  ) {
    if (report.correlation_status !== "filtered") {
      await supabase
        .from("reports")
        .update({
          correlation_status: "filtered",
          incident_id: null,
          possible_incident_id: null,
        })
        .eq("id", report.id);
    }

    return {
      outcome: {
        report_id: report.id,
        classification: report.classification,
        action: "filtered_skipped",
        incident_id: null,
        incident_code: null,
        match_score: null,
        match_breakdown: null,
      },
      updatedIncidents: openIncidents,
    };
  }

  // 3. Resolve location against canonical landmarks table (without forcing a landmark when only area is present)
  const resolvedLocation = resolveReportLocation(report, landmarks);

  // 4. Evaluate against open incidents using multi-signal matching
  const { incident: matchedIncident, evaluation } = findMatchingIncident(
    report,
    resolvedLocation,
    openIncidents
  );

  // 5. Handle Rumor / Unverified reports
  if (report.classification === "rumor_unverified") {
    if (matchedIncident && evaluation && evaluation.decision === "match") {
      const updatedIncident = await attachReportToExistingIncident(
        matchedIncident,
        report,
        resolvedLocation,
        evaluation.score,
        evaluation.breakdown
      );

      const nextIncidents = openIncidents.map((inc) =>
        inc.id === updatedIncident.id ? updatedIncident : inc
      );

      return {
        outcome: {
          report_id: report.id,
          classification: report.classification,
          action: "attached_unverified_evidence",
          incident_id: updatedIncident.id,
          incident_code: updatedIncident.incident_code,
          match_score: evaluation.score,
          match_breakdown: evaluation.breakdown,
        },
        updatedIncidents: nextIncidents,
      };
    }

    // No matching active incident for this rumor -> keep in unverified_queue
    return {
      outcome: {
        report_id: report.id,
        classification: report.classification,
        action: "held_unverified",
        incident_id: null,
        incident_code: null,
        match_score: evaluation?.score ?? null,
        match_breakdown: evaluation?.breakdown ?? null,
      },
      updatedIncidents: openIncidents,
    };
  }

  // 6. Handle Real Emergency reports
  if (matchedIncident && evaluation && evaluation.decision === "match") {
    const updatedIncident = await attachReportToExistingIncident(
      matchedIncident,
      report,
      resolvedLocation,
      evaluation.score,
      evaluation.breakdown
    );

    const nextIncidents = openIncidents.map((inc) =>
      inc.id === updatedIncident.id ? updatedIncident : inc
    );

    return {
      outcome: {
        report_id: report.id,
        classification: report.classification,
        action: "matched_existing_incident",
        incident_id: updatedIncident.id,
        incident_code: updatedIncident.incident_code,
        match_score: evaluation.score,
        match_breakdown: evaluation.breakdown,
      },
      updatedIncidents: nextIncidents,
    };
  }

  if (
    matchedIncident &&
    evaluation &&
    evaluation.decision === "possible_match"
  ) {
    await supabase
      .from("reports")
      .update({
        possible_incident_id: matchedIncident.id,
        correlation_status: "possible_match",
        match_score: evaluation.score,
        match_breakdown: evaluation.breakdown,
      })
      .eq("id", report.id);

    return {
      outcome: {
        report_id: report.id,
        classification: report.classification,
        action: "possible_match_flagged",
        incident_id: null,
        incident_code: matchedIncident.incident_code,
        match_score: evaluation.score,
        match_breakdown: evaluation.breakdown,
      },
      updatedIncidents: openIncidents,
    };
  }

  // No matching incident exists -> create a new incident in public.incidents
  const createdIncident = await createIncidentFromReport(
    report,
    resolvedLocation
  );

  return {
    outcome: {
      report_id: report.id,
      classification: report.classification,
      action: "created_new_incident",
      incident_id: createdIncident.id,
      incident_code: createdIncident.incident_code,
      match_score: 1.0,
      match_breakdown: {
        location_score: resolvedLocation.canonical_landmark ? 1.0 : 0.75,
        incident_type_score: 1.0,
        semantic_similarity_score: 1.0,
        time_proximity_score: 1.0,
        detail_consistency_score: 1.0,
        explanation: `Created new incident ${createdIncident.incident_code}.`,
      },
    },
    updatedIncidents: [...openIncidents, createdIncident],
  };
}

/**
 * Batch-correlates all uncorrelated reports in `public.reports` in deterministic order:
 * 1. First processes `real_emergency` reports (oldest first) so primary incidents exist.
 * 2. Next processes `rumor_unverified` reports so they can attach as supporting unverified evidence to active incidents.
 * 3. Ensures `general_question` and `irrelevant` reports remain `filtered` with `incident_id = null`.
 *
 * Fully idempotent: running multiple times never creates duplicate incidents or duplicate updates.
 */
export async function correlateAllPendingReports(): Promise<{
  outcomes: ReportCorrelationOutcome[];
  incidents: IncidentRecord[];
}> {
  const supabase = createSupabaseServerClient();

  const [{ data: landmarkRows, error: lmErr }, { data: incidentRows, error: incErr }, { data: reportRows, error: repErr }] =
    await Promise.all([
      supabase.from("landmarks").select("*"),
      supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("reports")
        .select("*")
        .order("reported_at", { ascending: true }),
    ]);

  if (lmErr) throw new Error(`Failed to load landmarks: ${lmErr.message}`);
  if (incErr) throw new Error(`Failed to load incidents: ${incErr.message}`);
  if (repErr) throw new Error(`Failed to load reports: ${repErr.message}`);

  const landmarks = (landmarkRows ?? []) as LandmarkRecord[];
  let openIncidents = (incidentRows ?? []) as IncidentRecord[];
  const allReports = (reportRows ?? []) as ReportRecord[];

  // Order reports so Real Emergencies are processed first (chronologically),
  // followed by Rumor / Unverified, followed by Filtered (General Question / Irrelevant).
  const priorityOrder = (r: ReportRecord): number => {
    if (r.classification === "real_emergency") return 1;
    if (r.classification === "rumor_unverified") return 2;
    return 3;
  };

  const orderedReports = [...allReports].sort((a, b) => {
    const pDiff = priorityOrder(a) - priorityOrder(b);
    if (pDiff !== 0) return pDiff;
    return (
      new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()
    );
  });

  const outcomes: ReportCorrelationOutcome[] = [];

  for (const report of orderedReports) {
    const result = await correlateSingleReport(
      report,
      landmarks,
      openIncidents
    );
    outcomes.push(result.outcome);
    openIncidents = result.updatedIncidents;
  }

  return {
    outcomes,
    incidents: openIncidents,
  };
}
