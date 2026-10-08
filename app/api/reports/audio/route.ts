import { NextRequest, NextResponse } from "next/server";
import {
  finalizeAudioReport,
  uploadAndTranscribeAudio,
} from "@/lib/audio/process-audio-report";
import { SUPPORTED_AUDIO_FORMATS } from "@/lib/audio/validate-audio";
import type { AudioFormat, InformationOrigin } from "@/types/database";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // Stage 2: JSON payload to process/finalize a transcribed (and optionally operator-edited) audio report
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;

      const audioFileUrl =
        typeof body.audioFileUrl === "string"
          ? body.audioFileUrl.trim()
          : typeof body.audio_file_url === "string"
          ? body.audio_file_url.trim()
          : "";

      const rawFormat =
        typeof body.audioFormat === "string"
          ? body.audioFormat.trim().toLowerCase()
          : typeof body.audio_format === "string"
          ? body.audio_format.trim().toLowerCase()
          : "";

      const audioFormat: AudioFormat | null = (
        SUPPORTED_AUDIO_FORMATS as readonly string[]
      ).includes(rawFormat)
        ? (rawFormat as AudioFormat)
        : null;

      if (!audioFileUrl || !audioFormat) {
        return NextResponse.json(
          {
            error:
              "Valid audioFileUrl and audioFormat (mp3, wav, m4a, webm) are required.",
          },
          { status: 400 }
        );
      }

      const originalTranscript =
        typeof body.originalTranscript === "string"
          ? body.originalTranscript
          : typeof body.original_transcript === "string"
          ? body.original_transcript
          : "";

      if (!originalTranscript.trim()) {
        return NextResponse.json(
          {
            error:
              "originalTranscript cannot be empty. Speech-to-text or operator transcript is required.",
          },
          { status: 400 }
        );
      }

      const editedTranscript =
        typeof body.editedTranscript === "string"
          ? body.editedTranscript
          : typeof body.edited_transcript === "string"
          ? body.edited_transcript
          : null;

      const detectedLanguage =
        typeof body.detectedLanguage === "string"
          ? body.detectedLanguage
          : typeof body.detected_language === "string"
          ? body.detected_language
          : null;

      const englishRendering =
        typeof body.englishRendering === "string"
          ? body.englishRendering
          : typeof body.english_rendering === "string"
          ? body.english_rendering
          : null;

      const informationOrigin: InformationOrigin =
        body.informationOrigin === "responder_confirmed" ||
        body.informationOrigin === "operator"
          ? body.informationOrigin
          : "ai_extracted";

      const dryRun = Boolean(body.dryRun ?? body.dry_run);
      const isDevelopmentFallback = Boolean(
        body.isDevelopmentFallback ?? body.is_development_fallback
      );

      const finalized = await finalizeAudioReport({
        audioFileUrl,
        audioFormat,
        originalTranscript,
        editedTranscript,
        detectedLanguage,
        englishRendering,
        informationOrigin,
        isDevelopmentFallback,
        dryRun,
      });

      return NextResponse.json(
        {
          success: true,
          stage: "processed",
          ...finalized,
        },
        { status: dryRun ? 200 : 201 }
      );
    }

    // Stage 1: Multipart FormData audio upload + validation + storage + server-side STT
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Expected multipart/form-data with an 'audio' file field, or application/json for transcript finalization.",
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const fileEntry = formData.get("audio") ?? formData.get("file");

    if (!fileEntry || typeof fileEntry === "string") {
      return NextResponse.json(
        { error: "No audio file provided in form field 'audio'." },
        { status: 400 }
      );
    }

    const file = fileEntry as File;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const allowDevelopmentFallback =
      formData.get("allowDevelopmentFallback") === "true";
    const developmentFallbackTranscript =
      typeof formData.get("developmentFallbackTranscript") === "string"
        ? (formData.get("developmentFallbackTranscript") as string)
        : null;
    const developmentFallbackLanguage =
      typeof formData.get("developmentFallbackLanguage") === "string"
        ? (formData.get("developmentFallbackLanguage") as string)
        : null;

    const sttStage = await uploadAndTranscribeAudio({
      fileName: file.name || "upload.wav",
      mimeType: file.type,
      sizeBytes: file.size || buffer.byteLength,
      buffer,
      allowDevelopmentFallback,
      developmentFallbackTranscript,
      developmentFallbackLanguage,
    });

    if (sttStage.status === "stt_unavailable") {
      return NextResponse.json(
        {
          success: false,
          stage: "stt_unavailable",
          stt_unavailable: true,
          audio_file_url: sttStage.audioFileUrl,
          audio_format: sttStage.audioFormat,
          storage_mode: sttStage.storageBackend,
          ...sttStage,
        },
        { status: 503 }
      );
    }

    // Optional single-step mode if caller explicitly passes autoProcess=true
    const autoProcess = formData.get("autoProcess") === "true";
    const dryRun =
      formData.get("dryRun") === "true" ||
      formData.get("dry_run") === "true" ||
      Boolean(sttStage.isDevelopmentFallback);

    const transcriptionPayload = {
      ...sttStage,
      storageMode: sttStage.storageBackend,
      detectedLanguage:
        sttStage.detectedLanguage?.formatted ?? "Unknown (und)",
    };

    if (autoProcess && sttStage.originalTranscript) {
      const editedOverride =
        typeof formData.get("editedTranscript") === "string"
          ? (formData.get("editedTranscript") as string)
          : null;

      const finalized = await finalizeAudioReport({
        audioFileUrl: sttStage.audioFileUrl,
        audioFormat: sttStage.audioFormat,
        originalTranscript: sttStage.originalTranscript,
        editedTranscript: editedOverride,
        detectedLanguage: sttStage.detectedLanguage?.formatted ?? null,
        englishRendering: sttStage.englishRendering,
        isDevelopmentFallback: sttStage.isDevelopmentFallback,
        dryRun,
      });

      return NextResponse.json(
        {
          success: true,
          stage: "processed",
          transcription: transcriptionPayload,
          ...finalized,
        },
        { status: dryRun ? 200 : 201 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        stage: "transcribed",
        transcription: transcriptionPayload,
        ...sttStage,
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Audio report processing failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
