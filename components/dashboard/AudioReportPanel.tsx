"use client";

import React, { useRef, useState } from "react";
import type { AudioFormat } from "@/types/database";
import {
  formatFileSize,
  MAX_AUDIO_FILE_SIZE_BYTES,
  SUPPORTED_AUDIO_FORMATS,
  validateAudioMetadata,
} from "@/lib/audio/validate-audio";

export interface AudioReportProcessedResult {
  reportId: string;
  audioFileUrl: string;
  audioFormat: AudioFormat;
  detectedLanguage: string;
  originalTranscript: string;
  editedTranscript: string | null;
  effectiveTranscript: string;
  englishRendering: string;
  translationProvider: string;
  classification: string;
  incidentType: string | null;
  location: string | null;
  landmark: string | null;
  resolvedArea: string | null;
  peopleAffectedCount: number | null;
  vulnerablePeople: string[];
  resourcesNeeded: string[];
  urgency: string | null;
  correlationStatus: string;
  incidentCode: string | null;
  confidence: number | null;
  isDevelopmentFallback: boolean;
  persistedToDatabase: boolean;
}

export interface AudioReportPanelProps {
  onReportProcessed?: () => void;
  onClose?: () => void;
}

export function AudioReportPanel({
  onReportProcessed,
  onClose,
}: AudioReportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientValidationError, setClientValidationError] = useState<
    string | null
  >(null);
  const [detectedFormat, setDetectedFormat] = useState<AudioFormat | null>(
    null
  );

  // Stage 1: Upload + STT state
  const [uploadingStt, setUploadingStt] = useState<boolean>(false);
  const [sttUnavailableMessage, setSttUnavailableMessage] = useState<
    string | null
  >(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Uploaded audio metadata & transcripts
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<AudioFormat | null>(null);
  const [storageMode, setStorageMode] = useState<string | null>(null);
  const [sttProvider, setSttProvider] = useState<string | null>(null);
  const [isDevelopmentFallback, setIsDevelopmentFallback] =
    useState<boolean>(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");
  const [originalTranscript, setOriginalTranscript] = useState<string>("");
  const [editableTranscript, setEditableTranscript] = useState<string>("");
  const [englishRenderingPreview, setEnglishRenderingPreview] =
    useState<string>("");

  // Stage 2: Finalize + Correlate state
  const [processingReport, setProcessingReport] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processedResult, setProcessedResult] =
    useState<AudioReportProcessedResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadError(null);
    setSttUnavailableMessage(null);
    setProcessError(null);
    setProcessedResult(null);

    if (!file) {
      setSelectedFile(null);
      setClientValidationError(null);
      setDetectedFormat(null);
      return;
    }

    setSelectedFile(file);
    const validation = validateAudioMetadata({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    if (!validation.valid) {
      setClientValidationError(
        validation.error ?? "Unsupported or invalid audio file."
      );
      setDetectedFormat(null);
    } else {
      setClientValidationError(null);
      setDetectedFormat(validation.audioFormat);
    }
  };

  const handleUploadAndTranscribe = async (useDevFallback = false) => {
    if (!selectedFile || clientValidationError) return;

    try {
      setUploadingStt(true);
      setUploadError(null);
      setSttUnavailableMessage(null);
      setProcessError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const formData = new FormData();
      formData.append("audio", selectedFile);
      if (useDevFallback) {
        formData.append("allowDevelopmentFallback", "true");
      }

      const res = await fetch("/api/reports/audio", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await res.json();

      if (res.status === 503 && data.stt_unavailable) {
        setAudioFileUrl(data.audio_file_url ?? null);
        setAudioFormat(data.audio_format ?? detectedFormat ?? "wav");
        setStorageMode(data.storage_mode ?? null);
        setSttUnavailableMessage(
          data.error || "Speech-to-text service unavailable."
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Audio upload and transcription failed.");
      }

      const tx = data.transcription;
      setAudioFileUrl(tx.audioFileUrl);
      setAudioFormat(tx.audioFormat);
      setStorageMode(tx.storageMode);
      setSttProvider(tx.sttProvider);
      setIsDevelopmentFallback(Boolean(tx.isDevelopmentFallback));
      setDetectedLanguage(tx.detectedLanguage || "Unknown (und)");
      setOriginalTranscript(tx.originalTranscript || "");
      setEditableTranscript(tx.originalTranscript || "");
      setEnglishRenderingPreview("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setUploadError("Audio upload cancelled by operator.");
      } else {
        setUploadError(
          err instanceof Error
            ? err.message
            : "Failed to upload and transcribe audio."
        );
      }
    } finally {
      setUploadingStt(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadingStt(false);
  };

  const handleReset = () => {
    handleCancelUpload();
    setSelectedFile(null);
    setClientValidationError(null);
    setDetectedFormat(null);
    setSttUnavailableMessage(null);
    setUploadError(null);
    setAudioFileUrl(null);
    setAudioFormat(null);
    setStorageMode(null);
    setSttProvider(null);
    setIsDevelopmentFallback(false);
    setDetectedLanguage("");
    setOriginalTranscript("");
    setEditableTranscript("");
    setEnglishRenderingPreview("");
    setProcessError(null);
    setProcessedResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleProcessAudioReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFileUrl || !audioFormat || !originalTranscript.trim()) return;

    try {
      setProcessingReport(true);
      setProcessError(null);

      const trimmedEdited = editableTranscript.trim();
      const editedDiffers =
        trimmedEdited.length > 0 &&
        trimmedEdited !== originalTranscript.trim();

      const res = await fetch("/api/reports/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_file_url: audioFileUrl,
          audio_format: audioFormat,
          original_transcript: originalTranscript,
          edited_transcript: editedDiffers ? trimmedEdited : null,
          detected_language: detectedLanguage || null,
          is_development_fallback: isDevelopmentFallback,
          // Never write fake/fallback STT transcripts as real reports in public.reports
          dry_run: isDevelopmentFallback,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Failed to process and correlate audio report."
        );
      }

      const display = data.display;
      const audioMeta = data.audio_metadata;
      setEnglishRenderingPreview(
        audioMeta?.english_rendering ?? display?.english_rendering ?? ""
      );

      setProcessedResult({
        reportId: data.report?.id ?? display?.id ?? "DRY-RUN",
        audioFileUrl: audioMeta?.audio_file_url ?? audioFileUrl,
        audioFormat: audioMeta?.audio_format ?? audioFormat,
        detectedLanguage:
          audioMeta?.detected_language ??
          display?.detected_language ??
          detectedLanguage,
        originalTranscript:
          audioMeta?.original_transcript ?? originalTranscript,
        editedTranscript: audioMeta?.edited_transcript ?? null,
        effectiveTranscript:
          audioMeta?.effective_transcript ??
          (editedDiffers ? trimmedEdited : originalTranscript),
        englishRendering:
          audioMeta?.english_rendering ?? display?.english_rendering ?? "",
        translationProvider: audioMeta?.translation_provider ?? "deterministic",
        classification:
          display?.classification ??
          data.extracted?.classification ??
          "Real Emergency",
        incidentType:
          display?.incident_type ?? data.extracted?.incident_type ?? null,
        location: display?.location ?? data.extracted?.location ?? null,
        landmark: display?.landmark ?? data.extracted?.landmark ?? null,
        resolvedArea: display?.resolved_area ?? null,
        peopleAffectedCount:
          display?.people_affected_count ??
          data.extracted?.people_affected_count ??
          null,
        vulnerablePeople:
          display?.vulnerable_people ??
          data.extracted?.vulnerable_people ??
          [],
        resourcesNeeded:
          display?.resources_needed ?? data.extracted?.resources_needed ?? [],
        urgency: display?.urgency ?? data.extracted?.urgency ?? null,
        correlationStatus:
          display?.correlation_status ??
          data.correlation?.correlationStatus ??
          "pending",
        incidentCode:
          display?.incident_code ?? data.correlation?.incidentCode ?? null,
        confidence:
          display?.confidence ?? data.extracted?.confidence ?? null,
        isDevelopmentFallback: Boolean(audioMeta?.is_development_fallback),
        persistedToDatabase: data.persisted_to_database !== false,
      });

      if (data.persisted_to_database !== false) {
        onReportProcessed?.();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("incidents-updated"));
        }
      }
    } catch (err) {
      setProcessError(
        err instanceof Error ? err.message : "Failed to process audio report."
      );
    } finally {
      setProcessingReport(false);
    }
  };

  const isEdited =
    editableTranscript.trim().length > 0 &&
    editableTranscript.trim() !== originalTranscript.trim();

  return (
    <div className="px-[20px] py-[16px] bg-[#f8fafc] border-b border-[#e2e8f0]">
      <div className="flex flex-wrap items-center justify-between gap-[10px] mb-[12px]">
        <div>
          <div className="flex items-center gap-[8px]">
            <span className="inline-flex items-center px-[8px] py-[2px] rounded-[9999px] text-[11px] font-bold uppercase tracking-[0.03em] bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
              Multilingual Audio Intelligence
            </span>
            <h4 className="text-[14px] font-bold text-[#0f172a]">
              Audio Emergency Report Upload &amp; STT Pipeline
            </h4>
          </div>
          <p className="text-[12px] text-[#64748b] mt-[2px]">
            Supported formats: {SUPPORTED_AUDIO_FORMATS.join(", ").toUpperCase()}{" "}
            (Max {formatFileSize(MAX_AUDIO_FILE_SIZE_BYTES)}). Automatic
            language detection, immutable original transcript, operator-editable
            transcript, English rendering, and incident correlation.
          </p>
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            onClick={handleReset}
            className="px-[10px] py-[5px] rounded-[6px] text-[12px] font-semibold border border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f1f5f9] cursor-pointer"
          >
            Reset
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-[10px] py-[5px] rounded-[6px] text-[12px] font-semibold border border-[#cbd5e1] bg-white text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Select & Validate Audio File */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-[14px] mb-[12px]">
        <div className="flex flex-wrap items-center gap-[12px]">
          <label className="text-[12px] font-bold text-[#334155]">
            1. Select Audio File:
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/webm"
            onChange={handleFileChange}
            className="text-[12px] text-[#334155] file:mr-[10px] file:px-[10px] file:py-[5px] file:rounded-[6px] file:border file:border-[#cbd5e1] file:bg-[#f8fafc] file:text-[12px] file:font-semibold file:text-[#0f172a] hover:file:bg-[#f1f5f9] cursor-pointer"
          />

          {selectedFile && (
            <div className="flex flex-wrap items-center gap-[8px] text-[12px]">
              <span className="px-[8px] py-[3px] rounded bg-[#f1f5f9] font-semibold text-[#0f172a]">
                {selectedFile.name}
              </span>
              <span className="px-[8px] py-[3px] rounded bg-[#f8fafc] border border-[#e2e8f0] text-[#475569]">
                {formatFileSize(selectedFile.size)}
              </span>
              {detectedFormat && (
                <span className="px-[8px] py-[3px] rounded bg-[#f0fdf4] text-[#15803d] font-bold uppercase text-[11px]">
                  Valid .{detectedFormat}
                </span>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-[8px]">
            {uploadingStt ? (
              <button
                type="button"
                onClick={handleCancelUpload}
                className="px-[12px] py-[6px] rounded-[6px] bg-[#b91c1c] text-white text-[12px] font-semibold hover:bg-[#991b1b] cursor-pointer"
              >
                Cancel Upload
              </button>
            ) : (
              <button
                type="button"
                disabled={!selectedFile || Boolean(clientValidationError)}
                onClick={() => void handleUploadAndTranscribe(false)}
                className="px-[14px] py-[6px] rounded-[6px] bg-[#2563eb] text-white text-[12px] font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 cursor-pointer"
              >
                Upload &amp; Run Server STT
              </button>
            )}
          </div>
        </div>

        {clientValidationError && (
          <div className="mt-[10px] px-[12px] py-[8px] rounded-[6px] bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[12px] font-medium">
            Validation Rejected: {clientValidationError}
          </div>
        )}

        {uploadError && (
          <div className="mt-[10px] px-[12px] py-[8px] rounded-[6px] bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[12px] font-medium">
            {uploadError}
          </div>
        )}

        {/* STT Service Unavailable Banner (Part 22) */}
        {sttUnavailableMessage && (
          <div className="mt-[10px] p-[12px] rounded-[8px] bg-[#fffbeb] border border-[#fde68a] text-[#92400e]">
            <div className="flex flex-wrap items-center justify-between gap-[8px]">
              <div>
                <div className="text-[12.5px] font-bold text-[#b45309]">
                  {sttUnavailableMessage}
                </div>
                <p className="text-[11.5px] text-[#92400e] mt-[2px]">
                  The uploaded audio file has been validated and retained (
                  <code className="font-mono text-[11px]">
                    {audioFileUrl ?? selectedFile?.name}
                  </code>
                  ). No fake transcript or fake completed report was created.
                  Configure <code className="font-mono">GEMINI_API_KEY</code>{" "}
                  (or <code className="font-mono">GROQ_API_KEY</code> /{" "}
                  <code className="font-mono">OPENAI_API_KEY</code>) on the
                  server and retry.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-[8px]">
                <button
                  type="button"
                  onClick={() => void handleUploadAndTranscribe(false)}
                  className="px-[10px] py-[5px] rounded-[6px] bg-[#b45309] text-white text-[11.5px] font-semibold hover:bg-[#92400e] cursor-pointer"
                >
                  Retry STT
                </button>
                <button
                  type="button"
                  onClick={() => void handleUploadAndTranscribe(true)}
                  className="px-[10px] py-[5px] rounded-[6px] border border-[#f59e0b] bg-white text-[#b45309] text-[11.5px] font-semibold hover:bg-[#fffbeb] cursor-pointer"
                >
                  Use Development/Test Fallback (Dry-Run)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Transcript Inspection, Operator Editing & Processing */}
      {originalTranscript && (
        <form
          onSubmit={handleProcessAudioReport}
          className="bg-white border border-[#e2e8f0] rounded-[10px] p-[14px] mb-[12px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-[8px] mb-[10px]">
            <div className="flex flex-wrap items-center gap-[8px]">
              <span className="text-[12px] font-bold text-[#0f172a]">
                2. Transcript Verification &amp; Operator Correction
              </span>
              <span className="px-[8px] py-[2px] rounded-[9999px] text-[11px] font-bold bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                Detected Language: {detectedLanguage}
              </span>
              {sttProvider && (
                <span className="px-[8px] py-[2px] rounded text-[11px] font-semibold bg-[#f1f5f9] text-[#475569]">
                  STT Provider: {sttProvider}
                </span>
              )}
              {storageMode && (
                <span className="px-[8px] py-[2px] rounded text-[11px] font-semibold bg-[#f8fafc] border border-[#e2e8f0] text-[#64748b]">
                  Storage: {storageMode}
                </span>
              )}
            </div>
            {isDevelopmentFallback && (
              <span className="px-[8px] py-[3px] rounded bg-[#fffbeb] border border-[#fde68a] text-[#b45309] text-[11px] font-bold uppercase">
                DEVELOPMENT / TEST FALLBACK — DRY-RUN ONLY
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[12px]">
            {/* Original Transcript (Read-Only Evidence) */}
            <div>
              <label className="block text-[11.5px] font-bold text-[#475569] uppercase tracking-[0.03em] mb-[4px]">
                Original Transcript (Immutable STT Evidence)
              </label>
              <textarea
                readOnly
                value={originalTranscript}
                rows={3}
                className="w-full px-[10px] py-[8px] rounded-[6px] border border-[#e2e8f0] bg-[#f8fafc] text-[12.5px] text-[#475569] font-medium cursor-not-allowed"
              />
            </div>

            {/* Editable Transcript (Operator Correction) */}
            <div>
              <div className="flex items-center justify-between mb-[4px]">
                <label className="block text-[11.5px] font-bold text-[#0f172a] uppercase tracking-[0.03em]">
                  Editable Transcript (Used for AI Extraction &amp; Correlation)
                </label>
                {isEdited ? (
                  <span className="text-[11px] font-bold text-[#15803d]">
                    Operator Edited ✓
                  </span>
                ) : (
                  <span className="text-[11px] text-[#64748b]">
                    Unmodified (Using Original)
                  </span>
                )}
              </div>
              <textarea
                value={editableTranscript}
                onChange={(e) => setEditableTranscript(e.target.value)}
                rows={3}
                placeholder="Correct landmarks, street names, or counts before processing..."
                className="w-full px-[10px] py-[8px] rounded-[6px] border border-[#cbd5e1] bg-white text-[12.5px] text-[#0f172a] font-medium focus:outline-none focus:border-[#2563eb]"
              />
            </div>
          </div>

          {englishRenderingPreview && (
            <div className="mt-[10px] px-[12px] py-[8px] rounded-[6px] bg-[#f0fdf4] border border-[#bbf7d0] text-[12px] text-[#166534]">
              <span className="font-bold">English Rendering: </span>
              &ldquo;{englishRenderingPreview}&rdquo;
            </div>
          )}

          {processError && (
            <div className="mt-[10px] px-[12px] py-[8px] rounded-[6px] bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[12px]">
              {processError}
            </div>
          )}

          <div className="mt-[12px] flex flex-wrap items-center justify-between gap-[10px]">
            <div className="text-[11.5px] text-[#64748b]">
              Effective Transcript:{" "}
              <span className="font-semibold text-[#0f172a]">
                {isEdited
                  ? "edited_transcript (Operator Override)"
                  : "original_transcript"}
              </span>
            </div>
            <button
              type="submit"
              disabled={processingReport || !editableTranscript.trim()}
              className="px-[16px] py-[7px] rounded-[6px] bg-[#15803d] text-white text-[12.5px] font-bold hover:bg-[#166534] disabled:opacity-50 cursor-pointer"
            >
              {processingReport
                ? "Translating, Extracting & Correlating..."
                : "Process Audio Report"}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Audio Report Detail Result View (Part 16) */}
      {processedResult && (
        <div className="bg-white border border-[#bfdbfe] rounded-[10px] p-[16px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px] pb-[10px] border-b border-[#e2e8f0] mb-[12px]">
            <div className="flex items-center gap-[8px]">
              <span className="px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold uppercase bg-[#eff6ff] text-[#2563eb]">
                Source: Audio (.{processedResult.audioFormat})
              </span>
              <span className="px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold bg-[#f0fdf4] text-[#15803d]">
                Detected Language: {processedResult.detectedLanguage}
              </span>
              <span className="px-[8px] py-[3px] rounded-[9999px] text-[11px] font-bold bg-[#fef2f2] text-[#b91c1c]">
                {processedResult.classification}
              </span>
            </div>
            <div className="flex items-center gap-[8px]">
              {processedResult.incidentCode && (
                <span className="px-[10px] py-[3px] rounded-[6px] text-[12px] font-bold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
                  Incident: {processedResult.incidentCode}
                </span>
              )}
              <span className="text-[11.5px] font-semibold text-[#475569]">
                Confidence:{" "}
                {processedResult.confidence !== null
                  ? Math.round(processedResult.confidence * 100) / 100
                  : "N/A"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px] mb-[12px] text-[12px]">
            <div className="p-[10px] rounded-[8px] bg-[#f8fafc] border border-[#e2e8f0]">
              <div className="text-[10.5px] font-bold uppercase text-[#64748b] mb-[3px]">
                Original Transcript
              </div>
              <div className="text-[#334155] font-medium">
                &ldquo;{processedResult.originalTranscript}&rdquo;
              </div>
            </div>
            <div className="p-[10px] rounded-[8px] bg-[#f8fafc] border border-[#e2e8f0]">
              <div className="text-[10.5px] font-bold uppercase text-[#64748b] mb-[3px]">
                Editable Transcript
              </div>
              <div className="text-[#0f172a] font-semibold">
                {processedResult.editedTranscript ? (
                  <>&ldquo;{processedResult.editedTranscript}&rdquo;</>
                ) : (
                  <span className="text-[#64748b] font-normal">
                    Unmodified (Used Original Transcript)
                  </span>
                )}
              </div>
            </div>
            <div className="p-[10px] rounded-[8px] bg-[#f0fdf4] border border-[#bbf7d0]">
              <div className="text-[10.5px] font-bold uppercase text-[#15803d] mb-[3px]">
                English Rendering
              </div>
              <div className="text-[#166534] font-semibold">
                &ldquo;{processedResult.englishRendering}&rdquo;
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px] text-[12px]">
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                Incident Type
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.incidentType ?? "None"}
              </span>
            </div>
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                Location / Landmark
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.landmark ??
                  processedResult.location ??
                  processedResult.resolvedArea ??
                  "Unspecified"}
              </span>
            </div>
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                People Affected
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.peopleAffectedCount !== null
                  ? processedResult.peopleAffectedCount
                  : "null (Not explicitly numbered)"}
              </span>
            </div>
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                Urgency &amp; Correlation
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.urgency ?? "Normal"} •{" "}
                {processedResult.correlationStatus}
              </span>
            </div>
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0] col-span-2">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                Vulnerable People
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.vulnerablePeople.length > 0
                  ? processedResult.vulnerablePeople.join(", ")
                  : "None identified"}
              </span>
            </div>
            <div className="p-[8px] rounded bg-[#f8fafc] border border-[#e2e8f0] col-span-2">
              <span className="block text-[10.5px] font-bold uppercase text-[#64748b]">
                Resources Needed
              </span>
              <span className="font-semibold text-[#0f172a]">
                {processedResult.resourcesNeeded.length > 0
                  ? processedResult.resourcesNeeded.join(", ")
                  : "Standard assessment"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
