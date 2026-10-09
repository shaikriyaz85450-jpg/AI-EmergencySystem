import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiApiKey } from "@/lib/server/env";
import type {
  CorrelationStatus,
  InformationOrigin,
  LandmarkRecord,
  MatchBreakdown,
  ReportRecord,
  ReportSourceChannel,
} from "@/types/database";
import {
  toClassificationLabel,
  type ClassificationLabel,
} from "./classify-report";
import {
  extractAndClassifyReport,
  toInformationOriginLabel,
  type InformationOriginLabel,
} from "./extract-report";
import { correlateSingleReport } from "@/lib/incident-correlation/correlate-report";

export type SourceChannelLabel =
  | "WhatsApp"
  | "Audio"
  | "SMS"
  | "Social Media"
  | "Responder"
  | "Operator";

const SOURCE_CHANNEL_LABELS: Record<ReportSourceChannel, SourceChannelLabel> = {
  whatsapp: "WhatsApp",
  audio: "Audio",
  sms: "SMS",
  social_media: "Social Media",
  responder: "Responder",
  operator: "Operator",
};

export function toSourceChannelLabel(
  channel: ReportSourceChannel
): SourceChannelLabel {
  return SOURCE_CHANNEL_LABELS[channel] ?? "WhatsApp";
}

export function parseSourceChannel(
  input: string | null | undefined
): ReportSourceChannel | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "whatsapp":
      return "whatsapp";
    case "audio":
    case "voice":
    case "call":
      return "audio";
    case "sms":
    case "text":
      return "sms";
    case "social_media":
    case "social":
    case "twitter":
    case "x":
      return "social_media";
    case "responder":
    case "field_responder":
      return "responder";
    case "operator":
    case "manual":
      return "operator";
    default:
      return null;
  }
}

import { normalizeDetectedLanguage } from "@/lib/audio/transcribe-audio";
import type { AudioFormat } from "@/types/database";

export interface ProcessReportInput {
  source_channel: string;
  raw_content: string;
  reporter_identifier?: string | null;
  information_origin?: InformationOrigin;
  audio_file_url?: string | null;
  audio_format?: AudioFormat | null;
  original_transcript?: string | null;
  edited_transcript?: string | null;
  detected_language?: string | null;
  english_rendering?: string | null;
}

export interface ProcessedReportResponse {
  report: ReportRecord;
  display: {
    id: string;
    source_channel: SourceChannelLabel;
    raw_content: string;
    audio_file_url: string | null;
    audio_format: AudioFormat | null;
    original_transcript: string | null;
    edited_transcript: string | null;
    detected_language: string;
    english_rendering: string | null;
    classification: ClassificationLabel;
    confidence: number | null;
    incident_type: string | null;
    location: string | null;
    landmark: string | null;
    resolved_area: string | null;
    people_affected_count: number | null;
    people_affected_description: string | null;
    vulnerable_people: string[];
    resources_needed: string[];
    urgency: string | null;
    important_evidence: string | null;
    information_origin: InformationOriginLabel;
    correlation_status: CorrelationStatus;
    incident_id: string | null;
    incident_code: string | null;
    is_unverified_evidence: boolean;
    match_score: number | null;
    match_breakdown: MatchBreakdown | null;
    reported_at: string;
    created_at: string;
  };
  processing_mode: "llm_gemini" | "deterministic_fallback";
}

export function formatReportForDisplay(
  row: ReportRecord,
  incidentCodeById?: Map<string, string>
): ProcessedReportResponse["display"] {
  const classification = row.classification ?? "real_emergency";
  const incidentCode = row.incident_id
    ? incidentCodeById?.get(row.incident_id) ?? row.incident_id
    : null;

  const normalizedLang = normalizeDetectedLanguage(
    row.detected_language,
    row.original_transcript ?? row.raw_content
  );

  return {
    id: row.id,
    source_channel: toSourceChannelLabel(row.source_channel),
    raw_content: row.raw_content,
    audio_file_url: row.audio_file_url,
    audio_format: row.audio_format,
    original_transcript: row.original_transcript,
    edited_transcript: row.edited_transcript,
    detected_language: normalizedLang.formatted,
    english_rendering: row.english_rendering,
    classification: toClassificationLabel(classification),
    confidence: row.extraction_confidence,
    incident_type: row.extracted_incident_type,
    location: row.extracted_location,
    landmark: row.canonical_landmark ?? row.extracted_landmark,
    resolved_area: row.resolved_area,
    people_affected_count: row.people_affected_count,
    people_affected_description: row.people_affected_description,
    vulnerable_people: row.vulnerable_people ?? [],
    resources_needed: row.resources_needed ?? [],
    urgency: row.extracted_urgency,
    important_evidence: row.important_evidence,
    information_origin: toInformationOriginLabel(row.information_origin),
    correlation_status: row.correlation_status,
    incident_id: row.incident_id,
    incident_code: incidentCode,
    is_unverified_evidence: row.is_unverified_evidence,
    match_score: row.match_score,
    match_breakdown: row.match_breakdown,
    reported_at: row.reported_at,
    created_at: row.created_at,
  };
}

/**
 * Validates input, runs AI/fallback classification & extraction, resolves landmark ID
 * against public.landmarks, stores the structured report in public.reports, and correlates
 * it against active incidents in public.incidents.
 */
export async function processAndStoreReport(
  input: ProcessReportInput
): Promise<ProcessedReportResponse> {
  const channel = parseSourceChannel(input.source_channel);
  if (!channel) {
    throw new Error(
      `Invalid source_channel "${input.source_channel}". Supported values: WhatsApp, Audio, SMS, Social Media, Responder, Operator.`
    );
  }

  if (
    typeof input.raw_content !== "string" ||
    input.raw_content.trim().length === 0
  ) {
    throw new Error("raw_content must be a non-empty string.");
  }

  // Preserve exact original incoming content
  const rawContentExact = input.raw_content.trim();

  const supabase = createSupabaseServerClient();

  // Part 23 Idempotency: If an audio report with the exact same audio_file_url and raw_content
  // has already been stored, return it instead of creating a duplicate report or incident.
  if (channel === "audio" && input.audio_file_url) {
    const { data: existingAudioReport } = await supabase
      .from("reports")
      .select("*")
      .eq("source_channel", "audio")
      .eq("audio_file_url", input.audio_file_url)
      .eq("raw_content", rawContentExact)
      .maybeSingle();

    if (existingAudioReport) {
      const existingTyped = existingAudioReport as ReportRecord;
      const codeMap = new Map<string, string>();
      if (existingTyped.incident_id) {
        const { data: incRow } = await supabase
          .from("incidents")
          .select("id, incident_code")
          .eq("id", existingTyped.incident_id)
          .maybeSingle();
        if (incRow) {
          codeMap.set(incRow.id as string, incRow.incident_code as string);
        }
      }
      return {
        report: existingTyped,
        display: formatReportForDisplay(existingTyped, codeMap),
        processing_mode: getGeminiApiKey()
          ? "llm_gemini"
          : "deterministic_fallback",
      };
    }
  }

  // Determine information origin
  const defaultOrigin: InformationOrigin =
    channel === "responder"
      ? "responder_confirmed"
      : channel === "operator"
      ? "operator"
      : "ai_extracted";
  const informationOrigin = input.information_origin ?? defaultOrigin;

  // Run extraction + classification using effective content + optional English rendering & source transcript
  const extracted = await extractAndClassifyReport(
    rawContentExact,
    informationOrigin,
    {
      englishRendering: input.english_rendering,
      detectedLanguage: input.detected_language,
      sourceTranscript: input.original_transcript ?? rawContentExact,
    }
  );

  // Resolve landmark_id from public.landmarks if a canonical landmark was identified
  let landmarkId: string | null = null;
  let canonicalLandmark = extracted.landmark;
  let resolvedArea = extracted.resolved_area;
  let latitude = extracted.latitude;
  let longitude = extracted.longitude;

  if (canonicalLandmark) {
    const { data: landmarkRow } = await supabase
      .from("landmarks")
      .select("*")
      .eq("canonical_name", canonicalLandmark)
      .maybeSingle();

    if (landmarkRow) {
      const typedLandmark = landmarkRow as LandmarkRecord;
      landmarkId = typedLandmark.id;
      canonicalLandmark = typedLandmark.canonical_name;
      resolvedArea = typedLandmark.area;
      latitude = typedLandmark.latitude;
      longitude = typedLandmark.longitude;
    }
  }

  let correlationStatus: CorrelationStatus = "pending";
  if (
    extracted.classification === "irrelevant" ||
    extracted.classification === "general_question"
  ) {
    correlationStatus = "filtered";
  } else if (extracted.classification === "rumor_unverified") {
    correlationStatus = "unverified_queue";
  }

  const insertPayload = {
    source_channel: channel,
    raw_content: rawContentExact,
    audio_file_url: input.audio_file_url ?? null,
    audio_format: input.audio_format ?? null,
    original_transcript: input.original_transcript ?? null,
    edited_transcript: input.edited_transcript ?? null,
    detected_language: extracted.detected_language,
    english_rendering: extracted.english_rendering,
    classification: extracted.classification,
    filter_reason: extracted.filter_reason,
    information_origin: extracted.information_origin,
    extracted_incident_type: extracted.incident_type,
    extracted_location: extracted.location,
    extracted_landmark: extracted.landmark,
    people_affected_description: extracted.people_affected_description,
    people_affected_count: extracted.people_affected_count,
    vulnerable_people: extracted.vulnerable_people,
    resources_needed: extracted.resources_needed,
    extracted_urgency: extracted.urgency,
    important_evidence: extracted.important_evidence,
    reports_resolution: extracted.reports_resolution,
    extraction_confidence: extracted.confidence,
    landmark_id: landmarkId,
    canonical_landmark: canonicalLandmark,
    resolved_area: resolvedArea,
    latitude,
    longitude,
    location_confidence: extracted.location_confidence,
    incident_id: null,
    possible_incident_id: null,
    correlation_status: correlationStatus,
    match_score: null,
    match_breakdown: null,
    is_unverified_evidence: extracted.classification === "rumor_unverified",
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("reports")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError || !insertedRow) {
    throw new Error(
      `Failed to save report to Supabase: ${
        insertError?.message ?? "Unknown database error"
      }`
    );
  }

  const initialReportRow = insertedRow as ReportRecord;

  // Correlate the newly inserted report against open incidents
  const [{ data: landmarksData }, { data: incidentsData }] = await Promise.all([
    supabase.from("landmarks").select("*"),
    supabase
      .from("incidents")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const { outcome } = await correlateSingleReport(
    initialReportRow,
    (landmarksData ?? []) as LandmarkRecord[],
    (incidentsData ?? [])
  );

  // Fetch the updated report row after correlation
  const { data: updatedReportData } = await supabase
    .from("reports")
    .select("*")
    .eq("id", initialReportRow.id)
    .single();

  const finalReportRow = (updatedReportData ?? initialReportRow) as ReportRecord;
  const codeMap = new Map<string, string>();
  if (outcome.incident_id && outcome.incident_code) {
    codeMap.set(outcome.incident_id, outcome.incident_code);
  }

  return {
    report: finalReportRow,
    display: formatReportForDisplay(finalReportRow, codeMap),
    processing_mode: extracted.processing_mode,
  };
}
