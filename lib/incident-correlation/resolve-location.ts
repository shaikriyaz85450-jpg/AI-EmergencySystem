import type { LandmarkRecord, ReportRecord } from "@/types/database";

export interface ResolvedLocationResult {
  landmark_id: string | null;
  canonical_landmark: string | null;
  resolved_area: string | null;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  direction_offset: string | null;
  location_confidence: number;
}

/**
 * Extracts directional or distance offset phrases (e.g., "near", "opposite", "200m north of").
 */
export function extractDirectionOffset(rawContent: string): string | null {
  const offsetMatch = rawContent.match(
    /\b((?:\d+\s*(?:m|meters|km)\s+)?(?:north|south|east|west|near|opposite|outside|beside|behind|in front of)\b[^.,;!?]*)/i
  );
  return offsetMatch ? offsetMatch[1].trim() : null;
}

/**
 * Resolves a report's location against the canonical Supabase landmarks gazetteer.
 * Does NOT force a canonical landmark if the report only mentions an area (e.g. "entire Velachery area").
 */
export function resolveReportLocation(
  report: Pick<
    ReportRecord,
    | "raw_content"
    | "english_rendering"
    | "extracted_location"
    | "extracted_landmark"
    | "canonical_landmark"
    | "resolved_area"
    | "landmark_id"
    | "latitude"
    | "longitude"
    | "location_confidence"
  >,
  landmarks: LandmarkRecord[]
): ResolvedLocationResult {
  const combinedText = `${report.raw_content} ${report.english_rendering ?? ""}`;
  const rawLower = combinedText.toLowerCase();
  const extractedLandmarkLower = (
    report.canonical_landmark ??
    report.extracted_landmark ??
    ""
  )
    .trim()
    .toLowerCase();
  const extractedLocationLower = (report.extracted_location ?? "")
    .trim()
    .toLowerCase();

  // 1. Check for an explicit canonical landmark or alias match in the report
  for (const lm of landmarks) {
    const canonicalLower = lm.canonical_name.toLowerCase();
    const matchedCanonical =
      extractedLandmarkLower === canonicalLower ||
      rawLower.includes(canonicalLower);

    const matchedAlias = (lm.aliases ?? []).some((alias) =>
      rawLower.includes(alias.toLowerCase())
    );

    if (matchedCanonical || matchedAlias) {
      return {
        landmark_id: lm.id,
        canonical_landmark: lm.canonical_name,
        resolved_area: lm.area,
        location_text:
          report.extracted_location?.trim() || lm.canonical_name,
        latitude: lm.latitude,
        longitude: lm.longitude,
        direction_offset: extractDirectionOffset(combinedText),
        location_confidence: 0.95,
      };
    }
  }

  // 2. Check for area-only match (e.g., "entire Velachery area") — do NOT force a landmark!
  for (const lm of landmarks) {
    const areaLower = lm.area.toLowerCase();
    if (
      (report.resolved_area ?? "").toLowerCase() === areaLower ||
      extractedLocationLower.includes(areaLower) ||
      rawLower.includes(areaLower)
    ) {
      return {
        landmark_id: null,
        canonical_landmark: null,
        resolved_area: lm.area,
        location_text:
          report.extracted_location?.trim() || `${lm.area} area`,
        latitude: lm.latitude,
        longitude: lm.longitude,
        direction_offset: extractDirectionOffset(combinedText),
        location_confidence: 0.65,
      };
    }
  }

  // 3. Fallback when neither landmark nor known area is found
  return {
    landmark_id: report.landmark_id ?? null,
    canonical_landmark: report.canonical_landmark ?? null,
    resolved_area: report.resolved_area ?? null,
    location_text:
      report.extracted_location?.trim() || "Unspecified Location",
    latitude: report.latitude ?? null,
    longitude: report.longitude ?? null,
    direction_offset: extractDirectionOffset(report.raw_content),
    location_confidence: report.location_confidence ?? 0.3,
  };
}
