import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMatchingIncident } from "@/lib/incident-correlation/find-matching-incident";
import { resolveReportLocation } from "@/lib/incident-correlation/resolve-location";
import {
  extractAndClassifyReport,
  type ExtractedReportResult,
} from "@/lib/report-processing/extract-report";
import {
  formatReportForDisplay,
  processAndStoreReport,
  type ProcessedReportResponse,
} from "@/lib/report-processing/process-report";
import type {
  AudioFormat,
  IncidentRecord,
  InformationOrigin,
  LandmarkRecord,
  ReportRecord,
} from "@/types/database";
import {
  normalizeDetectedLanguage,
  SttServiceUnavailableError,
  transcribeAudioServerSide,
  type NormalizedLanguage,
} from "./transcribe-audio";
import { translateToEnglish } from "./translate-audio";
import { validateAudioServerSide } from "./validate-audio";

export interface StoredAudioReference {
  audioFileUrl: string;
  audioFormat: AudioFormat;
  fileHash: string;
  storageBackend: "supabase_storage" | "local_filesystem_fallback";
  storageWarning: string | null;
}

/**
 * Stores validated audio binary in Supabase Storage (preferred) or local `public/uploads/audio/`
 * fallback if the Supabase Storage bucket is not provisioned or RLS blocks anon bucket writes.
 * Never stores raw binary audio inside PostgreSQL.
 */
export async function storeUploadedAudioFile(input: {
  buffer: Uint8Array;
  fileName: string;
  audioFormat: AudioFormat;
  mimeType: string;
}): Promise<StoredAudioReference> {
  const hash = crypto
    .createHash("sha256")
    .update(input.buffer)
    .digest("hex")
    .slice(0, 24);

  const safeBaseName = input.fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);

  const objectName = `${hash}-${safeBaseName || "audio"}.${input.audioFormat}`;
  const bucketName =
    process.env.SUPABASE_AUDIO_BUCKET?.trim() || "audio-reports";

  // 1. Try Supabase Storage first (using service role key if configured, otherwise server client)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  try {
    const storageClient =
      supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : createSupabaseServerClient();

    if (serviceRoleKey) {
      const { data: buckets } = await storageClient.storage.listBuckets();
      const exists = (buckets ?? []).some((b) => b.name === bucketName);
      if (!exists) {
        await storageClient.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: 15 * 1024 * 1024,
        });
      }
    }

    const { error: uploadError } = await storageClient.storage
      .from(bucketName)
      .upload(objectName, input.buffer, {
        contentType: input.mimeType,
        upsert: true,
      });

    if (!uploadError) {
      const { data: publicUrlData } = storageClient.storage
        .from(bucketName)
        .getPublicUrl(objectName);

      return {
        audioFileUrl: publicUrlData.publicUrl,
        audioFormat: input.audioFormat,
        fileHash: hash,
        storageBackend: "supabase_storage",
        storageWarning: null,
      };
    }

    // Fall through to local disk reference if Supabase Storage RLS rejects anon upload
    const warningMsg = `Supabase Storage bucket "${bucketName}" rejected upload (${uploadError.message}). Stored audio reference in server /uploads/audio/${objectName}.`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "audio");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, objectName), input.buffer);

    return {
      audioFileUrl: `/uploads/audio/${objectName}`,
      audioFormat: input.audioFormat,
      fileHash: hash,
      storageBackend: "local_filesystem_fallback",
      storageWarning: warningMsg,
    };
  } catch (err) {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "audio");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, objectName), input.buffer);

    return {
      audioFileUrl: `/uploads/audio/${objectName}`,
      audioFormat: input.audioFormat,
      fileHash: hash,
      storageBackend: "local_filesystem_fallback",
      storageWarning:
        err instanceof Error
          ? `Supabase Storage unavailable (${err.message}); stored at /uploads/audio/${objectName}.`
          : `Stored at /uploads/audio/${objectName}.`,
    };
  }
}

export interface AudioTranscriptionStageResponse {
  status: "transcribed" | "stt_unavailable";
  fileName: string;
  sizeBytes: number;
  audioFileUrl: string;
  audioFormat: AudioFormat;
  storageBackend: "supabase_storage" | "local_filesystem_fallback";
  storageWarning: string | null;
  originalTranscript: string | null;
  editableTranscript: string | null;
  detectedLanguage: NormalizedLanguage | null;
  englishRendering: string | null;
  confidence: number | null;
  sttProvider: string | null;
  translationProvider: string | null;
  isDevelopmentFallback: boolean;
  error: string | null;
  sttUnavailableReason: string | null;
}

/**
 * Step 1 of Audio Intelligence Pipeline:
 * 1. Mandatory server-side validation
 * 2. Store audio file (Supabase Storage preferred, local `/uploads/audio` fallback)
 * 3. Server-side STT + Automatic Language Detection
 * 4. Initial English Rendering (if non-English)
 * 5. Return transcript + language + audio reference for operator review/edit before final report creation.
 */
export async function uploadAndTranscribeAudio(input: {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  buffer: Uint8Array;
  allowDevelopmentFallback?: boolean;
  developmentFallbackTranscript?: string | null;
  developmentFallbackLanguage?: string | null;
}): Promise<AudioTranscriptionStageResponse> {
  // 1. Mandatory Server-Side Validation
  const validation = validateAudioServerSide({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    buffer: input.buffer,
  });

  if (
    !validation.valid ||
    !validation.audioFormat ||
    !validation.canonicalMimeType
  ) {
    throw new Error(validation.error ?? "Invalid audio file.");
  }

  // 2. Store Audio File
  const stored = await storeUploadedAudioFile({
    buffer: input.buffer,
    fileName: input.fileName,
    audioFormat: validation.audioFormat,
    mimeType: validation.canonicalMimeType,
  });

  // 3. Server-Side STT
  try {
    const sttResult = await transcribeAudioServerSide({
      buffer: input.buffer,
      fileName: input.fileName,
      audioFormat: validation.audioFormat,
      mimeType: validation.canonicalMimeType,
      allowDevelopmentFallback: input.allowDevelopmentFallback,
      developmentFallbackTranscript: input.developmentFallbackTranscript,
      developmentFallbackLanguage: input.developmentFallbackLanguage,
    });

    // 4. Multilingual Translation -> English Rendering
    let englishRendering = sttResult.transcript;
    let translationProvider = "identity_english";

    if (sttResult.detectedLanguage.code !== "en") {
      try {
        const translation = await translateToEnglish(
          sttResult.transcript,
          sttResult.detectedLanguage
        );
        englishRendering = translation.englishRendering;
        translationProvider = translation.provider;
      } catch {
        // Part 21: If STT succeeds but translation fails, preserve audio, original transcript, and detected language
        englishRendering = sttResult.transcript;
        translationProvider = "translation_failed_preserved_original";
      }
    }

    return {
      status: "transcribed",
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      audioFileUrl: stored.audioFileUrl,
      audioFormat: stored.audioFormat,
      storageBackend: stored.storageBackend,
      storageWarning: stored.storageWarning,
      originalTranscript: sttResult.transcript,
      editableTranscript: sttResult.transcript,
      detectedLanguage: sttResult.detectedLanguage,
      englishRendering,
      confidence: sttResult.confidence,
      sttProvider: sttResult.provider,
      translationProvider,
      isDevelopmentFallback: Boolean(sttResult.isDevelopmentFallback),
      error: null,
      sttUnavailableReason: null,
    };
  } catch (err) {
    if (err instanceof SttServiceUnavailableError) {
      // Part 22: Do NOT invent a transcript. Show "Speech-to-text service unavailable." Keep audio available for retry.
      return {
        status: "stt_unavailable",
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        audioFileUrl: stored.audioFileUrl,
        audioFormat: stored.audioFormat,
        storageBackend: stored.storageBackend,
        storageWarning: stored.storageWarning,
        originalTranscript: null,
        editableTranscript: null,
        detectedLanguage: null,
        englishRendering: null,
        confidence: null,
        sttProvider: null,
        translationProvider: null,
        isDevelopmentFallback: false,
        error: "Speech-to-text service unavailable.",
        sttUnavailableReason: err.reason,
      };
    }
    throw err;
  }
}

export interface FinalizeAudioReportInput {
  audioFileUrl: string;
  audioFormat: AudioFormat;
  originalTranscript: string;
  editedTranscript?: string | null;
  detectedLanguage?: string | null;
  englishRendering?: string | null;
  informationOrigin?: InformationOrigin;
  isDevelopmentFallback?: boolean;
  /**
   * When true, runs translation + AI classification/extraction + non-mutating correlation preview
   * without inserting into Supabase `public.reports`.
   * When false (default), stores the report in `public.reports` and correlates against `public.incidents`.
   */
  dryRun?: boolean;
}

export interface FinalizedAudioReportResult {
  originalTranscript: string;
  editedTranscript: string | null;
  effectiveTranscript: string;
  wasEdited: boolean;
  detectedLanguage: NormalizedLanguage;
  englishRendering: string;
  translationProvider: string;
  persisted_to_database: boolean;
  audio_metadata: {
    audio_file_url: string;
    audio_format: AudioFormat;
    detected_language: string;
    original_transcript: string;
    edited_transcript: string | null;
    effective_transcript: string;
    english_rendering: string;
    translation_provider: string;
    is_development_fallback: boolean;
  };
  extracted?: ExtractedReportResult;
  display: ProcessedReportResponse["display"];
  report?: ReportRecord;
  processedReport?: ProcessedReportResponse;
  correlation?: {
    correlationStatus: string;
    incidentId: string | null;
    incidentCode: string | null;
    matchScore: number | null;
  };
}

/**
 * Step 2 of Audio Intelligence Pipeline:
 * Takes the preserved `originalTranscript` and optional operator `editedTranscript`,
 * computes the `effectiveTranscript`, translates into `englishRendering` when non-English,
 * and sends through the EXISTING Phase 4 + Phase 5 + Phase 7 report processing pipeline.
 */
export async function finalizeAudioReport(
  input: FinalizeAudioReportInput
): Promise<FinalizedAudioReportResult> {
  const originalTranscript = (input.originalTranscript ?? "").trim();
  if (!originalTranscript) {
    throw new Error(
      "original_transcript is required and cannot be empty when processing an audio report."
    );
  }

  if (!input.audioFileUrl || !input.audioFileUrl.trim()) {
    throw new Error("audio_file_url is required for an audio report.");
  }

  const rawEdited =
    typeof input.editedTranscript === "string"
      ? input.editedTranscript.trim()
      : null;

  const wasEdited =
    rawEdited !== null &&
    rawEdited.length > 0 &&
    rawEdited !== originalTranscript;

  // Part 8:
  // If operator makes no changes -> effective transcript = original transcript (edited_transcript = null)
  // If operator edits -> effective transcript = edited transcript (original_transcript remains unchanged!)
  const effectiveTranscript = wasEdited ? rawEdited! : originalTranscript;
  const storedEditedTranscript = wasEdited ? rawEdited! : null;

  const normalizedLanguage = normalizeDetectedLanguage(
    input.detectedLanguage,
    effectiveTranscript
  );

  // Translate effective transcript into English when language is not English
  let englishRendering = effectiveTranscript;
  let translationProvider = "identity_english";

  if (normalizedLanguage.code !== "en") {
    if (
      wasEdited ||
      !input.englishRendering ||
      input.englishRendering.trim().length === 0 ||
      input.englishRendering.trim() === originalTranscript
    ) {
      const translation = await translateToEnglish(
        effectiveTranscript,
        normalizedLanguage
      );
      englishRendering = translation.englishRendering;
      translationProvider = translation.provider;
    } else {
      englishRendering = input.englishRendering.trim();
      translationProvider = "provided_english_rendering";
    }
  }

  if (input.dryRun || input.isDevelopmentFallback) {
    const extracted = await extractAndClassifyReport(
      effectiveTranscript,
      input.informationOrigin ?? "ai_extracted",
      {
        englishRendering,
        detectedLanguage: normalizedLanguage.formatted,
        sourceTranscript: effectiveTranscript,
      }
    );

    const supabase = createSupabaseServerClient();
    const [{ data: landmarksData }, { data: incidentsData }] =
      await Promise.all([
        supabase.from("landmarks").select("*"),
        supabase
          .from("incidents")
          .select("*")
          .not("status", "eq", "Resolved"),
      ]);

    const landmarks = (landmarksData ?? []) as LandmarkRecord[];
    const openIncidents = (incidentsData ?? []) as IncidentRecord[];

    const nowIso = new Date().toISOString();
    const syntheticReport: ReportRecord = {
      id: "DRY-RUN-AUDIO-REPORT",
      source_channel: "audio",
      raw_content: effectiveTranscript,
      audio_file_url: input.audioFileUrl.trim(),
      audio_format: input.audioFormat,
      original_transcript: originalTranscript,
      edited_transcript: storedEditedTranscript,
      detected_language: normalizedLanguage.formatted,
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
      landmark_id: null,
      canonical_landmark: extracted.landmark,
      resolved_area: extracted.resolved_area,
      latitude: extracted.latitude,
      longitude: extracted.longitude,
      direction_offset: null,
      location_confidence: extracted.location_confidence,
      incident_id: null,
      possible_incident_id: null,
      correlation_status:
        extracted.classification === "general_question" ||
        extracted.classification === "irrelevant"
          ? "filtered"
          : extracted.classification === "rumor_unverified"
          ? "unverified_queue"
          : "pending",
      match_score: null,
      match_breakdown: null,
      is_unverified_evidence:
        extracted.classification === "rumor_unverified",
      reported_at: nowIso,
      created_at: nowIso,
    };

    const resolvedLoc = resolveReportLocation(syntheticReport, landmarks);
    if (resolvedLoc.canonical_landmark && !syntheticReport.extracted_landmark) {
      syntheticReport.extracted_landmark = resolvedLoc.canonical_landmark;
    }
    if (resolvedLoc.canonical_landmark) {
      syntheticReport.canonical_landmark = resolvedLoc.canonical_landmark;
    }
    if (resolvedLoc.resolved_area && !syntheticReport.resolved_area) {
      syntheticReport.resolved_area = resolvedLoc.resolved_area;
    }

    let matchedIncidentCode: string | null = null;
    if (
      syntheticReport.classification === "real_emergency" ||
      syntheticReport.classification === "rumor_unverified"
    ) {
      const match = findMatchingIncident(
        syntheticReport,
        resolvedLoc,
        openIncidents
      );
      if (match.incident && match.evaluation) {
        syntheticReport.incident_id = match.incident.id;
        syntheticReport.match_score = match.evaluation.score;
        syntheticReport.match_breakdown = match.evaluation.breakdown;
        syntheticReport.correlation_status =
          match.evaluation.decision === "match"
            ? "matched"
            : "possible_match";
        matchedIncidentCode = match.incident.incident_code;
      } else if (syntheticReport.classification === "real_emergency") {
        syntheticReport.correlation_status = "new_incident";
      }
    }

    const codeMap = new Map<string, string>();
    if (syntheticReport.incident_id && matchedIncidentCode) {
      codeMap.set(syntheticReport.incident_id, matchedIncidentCode);
    }

    const display = formatReportForDisplay(syntheticReport, codeMap);

    return {
      originalTranscript,
      editedTranscript: storedEditedTranscript,
      effectiveTranscript,
      wasEdited,
      detectedLanguage: normalizedLanguage,
      englishRendering: extracted.english_rendering,
      translationProvider,
      persisted_to_database: false,
      audio_metadata: {
        audio_file_url: input.audioFileUrl.trim(),
        audio_format: input.audioFormat,
        detected_language: normalizedLanguage.formatted,
        original_transcript: originalTranscript,
        edited_transcript: storedEditedTranscript,
        effective_transcript: effectiveTranscript,
        english_rendering: extracted.english_rendering,
        translation_provider: translationProvider,
        is_development_fallback: Boolean(input.isDevelopmentFallback),
      },
      extracted,
      display,
      report: syntheticReport,
      correlation: {
        correlationStatus: syntheticReport.correlation_status,
        incidentId: syntheticReport.incident_id,
        incidentCode: matchedIncidentCode,
        matchScore: syntheticReport.match_score,
      },
    };
  }

  // Send through the existing Phase 4 -> Phase 5 -> Phase 7 report processing pipeline
  const processedReport = await processAndStoreReport({
    source_channel: "Audio",
    raw_content: effectiveTranscript,
    audio_file_url: input.audioFileUrl.trim(),
    audio_format: input.audioFormat,
    original_transcript: originalTranscript,
    edited_transcript: storedEditedTranscript,
    detected_language: normalizedLanguage.formatted,
    english_rendering: englishRendering,
    information_origin: input.informationOrigin ?? "ai_extracted",
  });

  const finalEnglish =
    processedReport.report.english_rendering ?? englishRendering;

  return {
    originalTranscript,
    editedTranscript: storedEditedTranscript,
    effectiveTranscript,
    wasEdited,
    detectedLanguage: normalizedLanguage,
    englishRendering: finalEnglish,
    translationProvider,
    persisted_to_database: true,
    audio_metadata: {
      audio_file_url: input.audioFileUrl.trim(),
      audio_format: input.audioFormat,
      detected_language: normalizedLanguage.formatted,
      original_transcript: originalTranscript,
      edited_transcript: storedEditedTranscript,
      effective_transcript: effectiveTranscript,
      english_rendering: finalEnglish,
      translation_provider: translationProvider,
      is_development_fallback: Boolean(input.isDevelopmentFallback),
    },
    display: processedReport.display,
    report: processedReport.report,
    processedReport,
    correlation: {
      correlationStatus: processedReport.display.correlation_status,
      incidentId: processedReport.display.incident_id,
      incidentCode: processedReport.display.incident_code,
      matchScore: processedReport.display.match_score,
    },
  };
}
