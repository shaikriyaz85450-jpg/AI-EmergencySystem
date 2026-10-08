import type { IncidentRecord, ReportRecord } from "@/types/database";
import {
  calculateIncidentMatch,
  type MatchEvaluationResult,
} from "./calculate-match";
import type { ResolvedLocationResult } from "./resolve-location";

export interface BestIncidentMatch {
  incident: IncidentRecord | null;
  evaluation: MatchEvaluationResult | null;
}

/**
 * Evaluates a report against all active/open incidents and returns the best multi-signal match.
 */
export function findMatchingIncident(
  report: ReportRecord,
  resolvedLocation: ResolvedLocationResult,
  openIncidents: IncidentRecord[]
): BestIncidentMatch {
  let bestIncident: IncidentRecord | null = null;
  let bestEvaluation: MatchEvaluationResult | null = null;

  for (const incident of openIncidents) {
    if (
      incident.status === "Resolved" ||
      (incident.resolution_notes ?? "").startsWith("MERGED_INTO:")
    ) {
      continue;
    }

    const evaluation = calculateIncidentMatch(
      report,
      resolvedLocation,
      incident
    );

    if (
      !bestEvaluation ||
      evaluation.score > bestEvaluation.score
    ) {
      bestIncident = incident;
      bestEvaluation = evaluation;
    }
  }

  if (!bestEvaluation || bestEvaluation.decision === "no_match") {
    return {
      incident: null,
      evaluation: bestEvaluation,
    };
  }

  return {
    incident: bestIncident,
    evaluation: bestEvaluation,
  };
}
