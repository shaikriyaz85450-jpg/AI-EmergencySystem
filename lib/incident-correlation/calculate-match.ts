import type {
  IncidentRecord,
  MatchBreakdown,
  ReportRecord,
} from "@/types/database";
import type { ResolvedLocationResult } from "./resolve-location";

export type MatchDecision = "match" | "possible_match" | "no_match";

export interface MatchEvaluationResult {
  decision: MatchDecision;
  score: number;
  breakdown: MatchBreakdown;
}

const HAZARD_KEYWORDS: Record<string, string[]> = {
  flood: [
    "flood",
    "flooding",
    "water",
    "waterlogging",
    "submerged",
    "underwater",
    "inundated",
    "stranded",
    "marooned",
    "rising",
  ],
  fire: ["fire", "smoke", "burning", "flames", "explosion", "short circuit"],
  medical: [
    "medical",
    "ambulance",
    "injured",
    "oxygen",
    "unconscious",
    "collapsed",
    "hospital",
  ],
  structural: ["collapse", "collapsed", "wall", "building", "roof"],
  infrastructure: ["tree", "power", "outage", "pole", "blocked", "traffic"],
};

function normalizeHazardCategory(incidentType: string | null | undefined): string {
  if (!incidentType) return "unknown";
  const lower = incidentType.toLowerCase();
  if (lower.includes("flood") || lower.includes("water")) return "flood";
  if (lower.includes("fire") || lower.includes("burn")) return "fire";
  if (lower.includes("medical") || lower.includes("ambulance")) return "medical";
  if (lower.includes("collapse")) return "structural";
  if (
    lower.includes("road") ||
    lower.includes("power") ||
    lower.includes("infrastructure") ||
    lower.includes("accident")
  ) {
    return "infrastructure";
  }
  return lower.trim();
}

function computeSemanticSimilarity(
  report: ReportRecord,
  incident: IncidentRecord
): number {
  const reportText = `${report.raw_content} ${report.english_rendering ?? ""} ${
    report.extracted_incident_type ?? ""
  }`.toLowerCase();
  const incidentText = `${incident.title} ${incident.summary ?? ""} ${
    incident.evidence_summary ?? ""
  } ${incident.incident_type}`.toLowerCase();

  const reportCat = normalizeHazardCategory(report.extracted_incident_type);
  const incidentCat = normalizeHazardCategory(incident.incident_type);

  // Check shared domain keywords
  const domainWords = HAZARD_KEYWORDS[incidentCat] ?? [];
  const sharedDomainHits = domainWords.filter(
    (w) => reportText.includes(w) && incidentText.includes(w)
  ).length;

  // Token overlap (excluding stop words)
  const stopWords = new Set([
    "the",
    "and",
    "near",
    "around",
    "are",
    "is",
    "has",
    "have",
    "entered",
    "reported",
    "area",
    "road",
    "people",
    "need",
    "heard",
    "entire",
  ]);
  const tokensA = reportText
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  const tokensB = new Set(
    incidentText
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
  );

  const overlapCount = tokensA.filter((t) => tokensB.has(t)).length;

  if (reportCat === incidentCat && reportCat !== "unknown") {
    return Number(
      Math.min(0.98, 0.72 + sharedDomainHits * 0.08 + overlapCount * 0.05).toFixed(
        3
      )
    );
  }

  return Number(Math.min(0.45, overlapCount * 0.08).toFixed(3));
}

function computeTimeProximityScore(
  reportTimestampIso: string,
  incidentTimestampIso: string
): number {
  const t1 = new Date(reportTimestampIso).getTime();
  const t2 = new Date(incidentTimestampIso).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0.8;

  const diffMinutes = Math.abs(t1 - t2) / (1000 * 60);
  if (diffMinutes <= 60) return 1.0;
  if (diffMinutes <= 180) return 0.9;
  if (diffMinutes <= 720) return 0.75;
  if (diffMinutes <= 1440) return 0.5;
  return 0.25;
}

/**
 * Multi-signal incident correlation evaluator.
 *
 * CRITICAL RULE:
 * Never correlate using location alone!
 * "Flood near Velachery MRTS Station" and "Fire near Velachery MRTS Station"
 * must NEVER match the same incident.
 */
export function calculateIncidentMatch(
  report: ReportRecord,
  resolvedLocation: ResolvedLocationResult,
  incident: IncidentRecord
): MatchEvaluationResult {
  const reportCategory = normalizeHazardCategory(report.extracted_incident_type);
  const incidentCategory = normalizeHazardCategory(incident.incident_type);

  // 1. Incident Type Match Signal
  const isSameHazardCategory =
    reportCategory !== "unknown" &&
    incidentCategory !== "unknown" &&
    reportCategory === incidentCategory;

  const isIncompatibleHazard =
    reportCategory !== "unknown" &&
    incidentCategory !== "unknown" &&
    reportCategory !== incidentCategory;

  const incidentTypeScore = isSameHazardCategory
    ? 1.0
    : isIncompatibleHazard
    ? 0.0
    : 0.35;

  // 2. Location / Landmark Match Signal
  const hasSameCanonicalLandmark =
    Boolean(resolvedLocation.canonical_landmark) &&
    Boolean(incident.canonical_landmark) &&
    resolvedLocation.canonical_landmark === incident.canonical_landmark;

  const hasSameArea =
    Boolean(resolvedLocation.resolved_area) &&
    Boolean(incident.area) &&
    resolvedLocation.resolved_area?.toLowerCase() ===
      incident.area?.toLowerCase();

  let locationScore = 0.0;
  if (hasSameCanonicalLandmark) {
    locationScore = 1.0;
  } else if (hasSameArea) {
    // Same neighborhood/area (e.g., Report B "Velachery area" vs Incident at "Velachery MRTS Station" in "Velachery")
    locationScore = 0.78;
  } else {
    locationScore = 0.0;
  }

  // 3. Semantic Similarity Signal
  const semanticScore = computeSemanticSimilarity(report, incident);

  // 4. Time Proximity Signal
  const timeScore = computeTimeProximityScore(
    report.reported_at,
    incident.updated_at || incident.created_at
  );

  // 5. Detail / Context Consistency Signal
  const detailConsistencyScore = isIncompatibleHazard
    ? 0.0
    : isSameHazardCategory && (hasSameCanonicalLandmark || hasSameArea)
    ? 0.9
    : 0.4;

  // HARD VETO: If incident types are incompatible (e.g. Flood vs Fire at the exact same landmark)
  // or locations are in completely different areas of the city, they CANNOT match.
  if (isIncompatibleHazard) {
    const vetoScore = Number((locationScore * 0.2).toFixed(3));
    return {
      decision: "no_match",
      score: vetoScore,
      breakdown: {
        location_score: locationScore,
        incident_type_score: 0,
        semantic_similarity_score: semanticScore,
        time_proximity_score: timeScore,
        detail_consistency_score: 0,
        explanation: `Incompatible hazard types (${
          report.extracted_incident_type ?? "Unknown"
        } vs ${
          incident.incident_type
        }). Shared location alone cannot merge distinct emergency types.`,
      },
    };
  }

  if (locationScore === 0) {
    return {
      decision: "no_match",
      score: Number((incidentTypeScore * 0.25).toFixed(3)),
      breakdown: {
        location_score: 0,
        incident_type_score: incidentTypeScore,
        semantic_similarity_score: semanticScore,
        time_proximity_score: timeScore,
        detail_consistency_score: detailConsistencyScore,
        explanation: `Disjoint locations (${
          resolvedLocation.canonical_landmark ??
          resolvedLocation.resolved_area ??
          "Unknown"
        } vs ${incident.canonical_landmark ?? incident.area ?? "Unknown"}).`,
      },
    };
  }

  // Weighted composite score when both location/area and hazard context align
  const compositeScore = Number(
    (
      locationScore * 0.35 +
      incidentTypeScore * 0.3 +
      semanticScore * 0.2 +
      timeScore * 0.1 +
      detailConsistencyScore * 0.05
    ).toFixed(3)
  );

  // Multi-signal decision logic:
  // - Exact landmark + compatible hazard type + strong semantic match -> "match"
  // - Area-level match + compatible hazard type (e.g., Rumor/Unverified flood in Velachery area matching active Velachery flood incident) -> "match" (attached as unverified evidence if classification === 'rumor_unverified')
  if (
    isSameHazardCategory &&
    hasSameCanonicalLandmark &&
    semanticScore >= 0.65
  ) {
    return {
      decision: "match",
      score: compositeScore,
      breakdown: {
        location_score: locationScore,
        incident_type_score: incidentTypeScore,
        semantic_similarity_score: semanticScore,
        time_proximity_score: timeScore,
        detail_consistency_score: detailConsistencyScore,
        explanation: `Matched on canonical landmark (${resolvedLocation.canonical_landmark}), hazard type (${incident.incident_type}), and semantic context.`,
      },
    };
  }

  if (isSameHazardCategory && hasSameArea && semanticScore >= 0.65) {
    return {
      decision:
        report.classification === "rumor_unverified"
          ? "match"
          : compositeScore >= 0.8
          ? "match"
          : "possible_match",
      score: compositeScore,
      breakdown: {
        location_score: locationScore,
        incident_type_score: incidentTypeScore,
        semantic_similarity_score: semanticScore,
        time_proximity_score: timeScore,
        detail_consistency_score: detailConsistencyScore,
        explanation:
          report.classification === "rumor_unverified"
            ? `Unverified report in ${resolvedLocation.resolved_area} area matches active ${incident.incident_type} incident (${incident.incident_code}); attached as unverified supporting context without elevating verified counts.`
            : `Area-level match (${resolvedLocation.resolved_area}) and hazard match (${incident.incident_type}).`,
      },
    };
  }

  if (compositeScore >= 0.6) {
    return {
      decision: "possible_match",
      score: compositeScore,
      breakdown: {
        location_score: locationScore,
        incident_type_score: incidentTypeScore,
        semantic_similarity_score: semanticScore,
        time_proximity_score: timeScore,
        detail_consistency_score: detailConsistencyScore,
        explanation: `Partial multi-signal overlap with ${incident.incident_code}.`,
      },
    };
  }

  return {
    decision: "no_match",
    score: compositeScore,
    breakdown: {
      location_score: locationScore,
      incident_type_score: incidentTypeScore,
      semantic_similarity_score: semanticScore,
      time_proximity_score: timeScore,
      detail_consistency_score: detailConsistencyScore,
      explanation: `Insufficient multi-signal alignment with ${incident.incident_code}.`,
    },
  };
}
