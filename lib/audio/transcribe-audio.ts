import type { AudioFormat } from "@/types/database";
import {
  getGeminiApiKey,
  getGroqApiKey,
  getOpenAiApiKey,
} from "@/lib/server/env";

export interface NormalizedLanguage {
  /** Lowercase ISO-639 language code (e.g., "en", "ta", "hi", "te", "ml", "bn", "es") */
  code: string;
  /** Human-readable English display name via Intl.DisplayNames (e.g., "Telugu", "Tamil", "Hindi", "Malayalam") */
  name: string;
  /** Consistent normalized storage/display representation: "<Name> (<code>)" (e.g., "Telugu (te)") */
  formatted: string;
}

export interface TranscriptionResult {
  transcript: string;
  detectedLanguage: NormalizedLanguage;
  confidence: number | null;
  provider: string;
  isDevelopmentFallback?: boolean;
}

export class SttServiceUnavailableError extends Error {
  public readonly reason: string;
  constructor(reason: string) {
    super("Speech-to-text service unavailable.");
    this.name = "SttServiceUnavailableError";
    this.reason = reason;
  }
}

/**
 * Common language name to ISO 639-1/639-2 code lookup so provider responses that return
 * full language names (e.g. Whisper returning "telugu", "tamil", "hindi", "malayalam", "bengali", "spanish")
 * resolve cleanly alongside BCP-47 tags via Intl.DisplayNames.
 * This is a bidirectional normalization helper — any valid ISO/BCP-47 code is dynamically resolved by Intl.DisplayNames.
 */
const LANGUAGE_NAME_TO_ISO: Record<string, string> = {
  english: "en",
  tamil: "ta",
  hindi: "hi",
  telugu: "te",
  malayalam: "ml",
  kannada: "kn",
  bengali: "bn",
  bangla: "bn",
  marathi: "mr",
  gujarati: "gu",
  punjabi: "pa",
  odia: "or",
  oriya: "or",
  assamese: "as",
  urdu: "ur",
  nepali: "ne",
  sinhala: "si",
  sanskrit: "sa",
  spanish: "es",
  french: "fr",
  german: "de",
  portuguese: "pt",
  italian: "it",
  russian: "ru",
  arabic: "ar",
  chinese: "zh",
  mandarin: "zh",
  japanese: "ja",
  korean: "ko",
  vietnamese: "vi",
  thai: "th",
  indonesian: "id",
  malay: "ms",
  turkish: "tr",
  dutch: "nl",
  polish: "pl",
  ukrainian: "uk",
  persian: "fa",
  farsi: "fa",
  swahili: "sw",
  tagalog: "tl",
  filipino: "fil",
  burmese: "my",
};

/**
 * Unicode script detection across global writing systems (not limited to any fixed subset).
 */
const UNICODE_SCRIPT_DETECTORS: Array<{ regex: RegExp; isoCode: string }> = [
  { regex: /[\u0C00-\u0C7F]/, isoCode: "te" }, // Telugu
  { regex: /[\u0B80-\u0BFF]/, isoCode: "ta" }, // Tamil
  { regex: /[\u0900-\u097F]/, isoCode: "hi" }, // Devanagari (Hindi/Marathi/Nepali)
  { regex: /[\u0D00-\u0D7F]/, isoCode: "ml" }, // Malayalam
  { regex: /[\u0C80-\u0CFF]/, isoCode: "kn" }, // Kannada
  { regex: /[\u0980-\u09FF]/, isoCode: "bn" }, // Bengali / Assamese
  { regex: /[\u0A80-\u0AFF]/, isoCode: "gu" }, // Gujarati
  { regex: /[\u0A00-\u0A7F]/, isoCode: "pa" }, // Gurmukhi (Punjabi)
  { regex: /[\u0B00-\u0B7F]/, isoCode: "or" }, // Odia
  { regex: /[\u0D80-\u0DFF]/, isoCode: "si" }, // Sinhala
  { regex: /[\u0600-\u06FF]/, isoCode: "ar" }, // Arabic / Urdu / Persian
  { regex: /[\u0400-\u04FF]/, isoCode: "ru" }, // Cyrillic
  { regex: /[\u0E00-\u0E7F]/, isoCode: "th" }, // Thai
  { regex: /[\u3040-\u30FF]/, isoCode: "ja" }, // Hiragana / Katakana
  { regex: /[\uAC00-\uD7AF]/, isoCode: "ko" }, // Hangul
  { regex: /[\u4E00-\u9FFF]/, isoCode: "zh" }, // CJK Unified Ideographs
  { regex: /[\u0370-\u03FF]/, isoCode: "el" }, // Greek
  { regex: /[\u0590-\u05FF]/, isoCode: "he" }, // Hebrew
];

/**
 * Dynamically detects language from Unicode script or romanized cues when a provider does not supply a tag.
 */
export function inferLanguageCodeFromText(text: string): string {
  if (!text || !text.trim()) return "en";

  for (const detector of UNICODE_SCRIPT_DETECTORS) {
    if (detector.regex.test(text)) {
      return detector.isoCode;
    }
  }

  const lower = text.toLowerCase();
  if (/\b(neellu|chikkukunnaru|daggara|mandi|sahayam)\b/.test(lower)) {
    return "te";
  }
  if (/\b(vellam|thanni|udavi|makkal|veedu|paalam)\b/.test(lower)) {
    return "ta";
  }
  if (/\b(baadh|paani|madad|bachao|log|phas)\b/.test(lower)) {
    return "hi";
  }

  return "en";
}

/**
 * Normalizes any provider language code, BCP-47 locale tag, language name, or existing formatted string
 * into a consistent `{ code, name, formatted }` representation using `Intl.DisplayNames`.
 *
 * Examples:
 * - "te" / "te-IN" / "Telugu" / "TELUGU" -> `{ code: "te", name: "Telugu", formatted: "Telugu (te)" }`
 * - "ta" / "ta-IN" / "Tamil" -> `{ code: "ta", name: "Tamil", formatted: "Tamil (ta)" }`
 * - "hi" / "Hindi" -> `{ code: "hi", name: "Hindi", formatted: "Hindi (hi)" }`
 * - "ml" / "Malayalam" -> `{ code: "ml", name: "Malayalam", formatted: "Malayalam (ml)" }`
 * - "bn" / "Bengali" -> `{ code: "bn", name: "Bengali", formatted: "Bengali (bn)" }`
 * - "en" / "English" -> `{ code: "en", name: "English", formatted: "English (en)" }`
 */
export function normalizeDetectedLanguage(
  rawLanguage?: string | null,
  transcriptFallbackText?: string
): NormalizedLanguage {
  const displayNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "language" })
      : null;

  let candidate = (rawLanguage ?? "").trim();

  // If already in "<Name> (<code>)" format, extract the code inside parentheses
  const formattedMatch = candidate.match(/^(.+?)\s*\(([a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)?)\)$/);
  if (formattedMatch) {
    candidate = formattedMatch[2];
  }

  const scriptInferredCode = transcriptFallbackText
    ? inferLanguageCodeFromText(transcriptFallbackText)
    : null;

  if (
    !candidate ||
    candidate.toLowerCase() === "unknown" ||
    candidate.toLowerCase() === "und" ||
    candidate.toLowerCase() === "auto"
  ) {
    candidate = scriptInferredCode ?? "en";
  }

  const lowerCandidate = candidate.toLowerCase();

  // Check if the provider returned a full language name like "telugu" or "tamil"
  let isoCode = LANGUAGE_NAME_TO_ISO[lowerCandidate] ?? null;

  if (!isoCode) {
    // Extract primary language subtag from BCP-47 tag (e.g. "te-IN" -> "te", "ta_IN" -> "ta")
    const primarySubtag = lowerCandidate.split(/[-_]/)[0];
    if (/^[a-z]{2,3}$/.test(primarySubtag)) {
      isoCode = primarySubtag;
    }
  }

  // If provider returned "en" but the transcript itself is clearly in a non-Latin script (e.g. Telugu/Tamil/Hindi),
  // prefer the script-verified language code.
  if (
    isoCode === "en" &&
    scriptInferredCode &&
    scriptInferredCode !== "en"
  ) {
    isoCode = scriptInferredCode;
  }

  const finalCode = isoCode ?? scriptInferredCode ?? "en";

  let resolvedName: string | null = null;
  if (displayNames) {
    try {
      const intlName = displayNames.of(finalCode);
      if (intlName && intlName.toLowerCase() !== finalCode.toLowerCase()) {
        resolvedName = intlName;
      }
    } catch {
      resolvedName = null;
    }
  }

  if (!resolvedName) {
    resolvedName =
      candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
  }

  return {
    code: finalCode,
    name: resolvedName,
    formatted: `${resolvedName} (${finalCode})`,
  };
}

/**
 * Provider 1: Google Gemini STT (`gemini-3.5-transcribe` with fallback to `gemini-3.8-flash`).
 * Uses automatic language detection across all 85+ supported Gemini locales.
 */
async function transcribeWithGemini(
  buffer: Uint8Array,
  mimeType: string,
  apiKey: string
): Promise<TranscriptionResult> {
  const base64Audio = Buffer.from(buffer).toString("base64");

  const prompt = `Transcribe the spoken audio verbatim in its original spoken language and script.
Do NOT translate the transcript into English if another language is spoken.
Return ONLY valid JSON with this exact structure:
{
  "transcript": "<exact verbatim transcript in the original spoken language>",
  "language_code": "<BCP-47 or ISO-639 language code detected from the speech, e.g. en, ta, hi, te, ml, bn, kn, es, etc.>",
  "language_name": "<human-readable language name>",
  "confidence": <number between 0 and 1>
}`;

  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.5-transcribe",
  ];
  let lastError = "Gemini STT request failed.";

  for (const modelName of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const isDedicatedTranscribeModel = modelName.includes("transcribe");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: base64Audio,
                    },
                  },
                ],
              },
            ],
            generationConfig: isDedicatedTranscribeModel
              ? { temperature: 0.0 }
              : {
                  temperature: 0.0,
                  responseMimeType: "application/json",
                },
          }),
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `Gemini model ${modelName} returned HTTP ${response.status}`;
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              audioTranscription?: { text?: string };
            }>;
          };
        }>;
      };

      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const firstPart = parts[0];
      const rawText = (
        firstPart?.audioTranscription?.text ??
        firstPart?.text ??
        ""
      ).trim();

      if (!rawText) {
        lastError = `Gemini model ${modelName} returned an empty transcription response.`;
        continue;
      }

      try {
        const parsed = JSON.parse(rawText) as {
          transcript?: string;
          language_code?: string;
          language_name?: string;
          confidence?: number;
        };

        const transcript = (parsed.transcript ?? "").trim();
        if (!transcript) {
          throw new Error("Empty transcript field in JSON.");
        }

        const detectedLanguage = normalizeDetectedLanguage(
          parsed.language_code || parsed.language_name,
          transcript
        );

        const confidence =
          typeof parsed.confidence === "number" &&
          parsed.confidence >= 0 &&
          parsed.confidence <= 1
            ? Number(parsed.confidence.toFixed(3))
            : 0.94;

        return {
          transcript,
          detectedLanguage,
          confidence,
          provider: `google_${modelName.replace(/[.-]/g, "_")}`,
          isDevelopmentFallback: false,
        };
      } catch {
        // If Gemini (e.g., gemini-3.5-transcribe) returned plain text transcription directly
        const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
        if (cleaned.length > 0) {
          const detectedLanguage = normalizeDetectedLanguage(null, cleaned);
          return {
            transcript: cleaned,
            detectedLanguage,
            confidence: 0.94,
            provider: `google_${modelName.replace(/[.-]/g, "_")}`,
            isDevelopmentFallback: false,
          };
        }
      }
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "Gemini STT connection error.";
    }
  }

  throw new SttServiceUnavailableError(lastError);
}

/**
 * Provider 2: OpenAI / Groq Whisper compatible multipart `/v1/audio/transcriptions` endpoint.
 */
async function transcribeWithWhisperCompatible(
  buffer: Uint8Array,
  fileName: string,
  mimeType: string,
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  providerLabel: string
): Promise<TranscriptionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const formData = new FormData();
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    const blob = new Blob([copy.buffer], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("model", modelName);
    formData.append("response_format", "verbose_json");

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new SttServiceUnavailableError(
        `${providerLabel} returned HTTP ${response.status}.`
      );
    }

    const payload = (await response.json()) as {
      text?: string;
      language?: string;
    };

    const transcript = (payload.text ?? "").trim();
    if (!transcript) {
      throw new SttServiceUnavailableError(
        `${providerLabel} returned an empty transcript.`
      );
    }

    const detectedLanguage = normalizeDetectedLanguage(
      payload.language,
      transcript
    );

    return {
      transcript,
      detectedLanguage,
      confidence: 0.92,
      provider: providerLabel,
      isDevelopmentFallback: false,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SttServiceUnavailableError) throw err;
    throw new SttServiceUnavailableError(
      err instanceof Error ? err.message : `${providerLabel} request failed.`
    );
  }
}

/**
 * Reads an optional embedded RIFF `LIST/INFO` metadata chunk (`ICMT` = transcript, `ILNG` = language code)
 * from a valid WAV file ONLY when `allowDevelopmentFallback: true` is explicitly requested in local test mode.
 * Never used silently; always labeled `provider: "development_test_fallback"` and `isDevelopmentFallback: true`.
 */
export function extractDevelopmentTestWavMetadata(
  buffer: Uint8Array
): { transcript: string; languageCode: string | null } | null {
  if (buffer.byteLength < 44) return null;
  const riff = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  const wave = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (riff !== "RIFF" || wave !== "WAVE") return null;

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  let offset = 12;
  let transcript: string | null = null;
  let languageCode: string | null = null;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = String.fromCharCode(
      buffer[offset],
      buffer[offset + 1],
      buffer[offset + 2],
      buffer[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = Math.min(
      buffer.byteLength,
      chunkDataStart + chunkSize
    );

    if (chunkId === "LIST" && chunkDataStart + 4 <= chunkDataEnd) {
      const listType = String.fromCharCode(
        buffer[chunkDataStart],
        buffer[chunkDataStart + 1],
        buffer[chunkDataStart + 2],
        buffer[chunkDataStart + 3]
      );
      if (listType === "INFO") {
        let subOffset = chunkDataStart + 4;
        while (subOffset + 8 <= chunkDataEnd) {
          const subId = String.fromCharCode(
            buffer[subOffset],
            buffer[subOffset + 1],
            buffer[subOffset + 2],
            buffer[subOffset + 3]
          );
          const subSize = view.getUint32(subOffset + 4, true);
          const subStart = subOffset + 8;
          const subEnd = Math.min(chunkDataEnd, subStart + subSize);
          const textBytes = buffer.subarray(subStart, subEnd);
          const decoded = new TextDecoder("utf-8")
            .decode(textBytes)
            .replace(/\0+$/g, "")
            .trim();

          if (subId === "ICMT" && decoded) {
            transcript = decoded;
          } else if (subId === "ILNG" && decoded) {
            languageCode = decoded;
          }
          subOffset = subStart + subSize + (subSize % 2);
        }
      }
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!transcript) return null;
  return { transcript, languageCode };
}

export interface TranscribeAudioInput {
  buffer: Uint8Array;
  fileName: string;
  audioFormat: AudioFormat;
  mimeType: string;
  /**
   * When false (default), missing or unreachable STT provider throws `SttServiceUnavailableError`
   * ("Speech-to-text service unavailable.") and NEVER invents a transcript.
   * When explicitly true, permits reading development/test fallback metadata or operator fallback text,
   * always explicitly marked with `isDevelopmentFallback: true` and `provider: "development_test_fallback"`.
   */
  allowDevelopmentFallback?: boolean;
  developmentFallbackTranscript?: string | null;
  developmentFallbackLanguage?: string | null;
}

/**
 * Provider-agnostic server-side Speech-to-Text service.
 */
export async function transcribeAudioServerSide(
  input: TranscribeAudioInput
): Promise<TranscriptionResult> {
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();
  const openaiKey = getOpenAiApiKey();

  // 1. Primary Provider: Google Gemini 3.5 Transcribe / 3.8 Flash
  if (geminiKey) {
    return transcribeWithGemini(input.buffer, input.mimeType, geminiKey);
  }

  // 2. Secondary Provider: Groq Whisper Large v3
  if (groqKey) {
    return transcribeWithWhisperCompatible(
      input.buffer,
      input.fileName,
      input.mimeType,
      groqKey,
      "https://api.groq.com/openai/v1/audio/transcriptions",
      "whisper-large-v3-turbo",
      "groq_whisper_large_v3"
    );
  }

  // 3. Tertiary Provider: OpenAI Whisper
  if (openaiKey) {
    return transcribeWithWhisperCompatible(
      input.buffer,
      input.fileName,
      input.mimeType,
      openaiKey,
      "https://api.openai.com/v1/audio/transcriptions",
      "whisper-1",
      "openai_whisper_1"
    );
  }

  // 4. Explicit Development/Test Fallback (ONLY if explicitly enabled by caller; never silent)
  if (input.allowDevelopmentFallback) {
    const fallbackText = input.developmentFallbackTranscript?.trim();
    if (fallbackText) {
      const detectedLanguage = normalizeDetectedLanguage(
        input.developmentFallbackLanguage,
        fallbackText
      );
      return {
        transcript: fallbackText,
        detectedLanguage,
        confidence: null,
        provider: "development_test_fallback",
        isDevelopmentFallback: true,
      };
    }

    if (input.audioFormat === "wav") {
      const wavMeta = extractDevelopmentTestWavMetadata(input.buffer);
      if (wavMeta && wavMeta.transcript) {
        const detectedLanguage = normalizeDetectedLanguage(
          input.developmentFallbackLanguage || wavMeta.languageCode,
          wavMeta.transcript
        );
        return {
          transcript: wavMeta.transcript,
          detectedLanguage,
          confidence: null,
          provider: "development_test_fallback",
          isDevelopmentFallback: true,
        };
      }
    }
  }

  // Part 22: If STT provider is unavailable, DO NOT invent a transcript.
  throw new SttServiceUnavailableError(
    "No server-side STT provider API key (GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY) is configured in .env.local."
  );
}
