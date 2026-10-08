import type { AudioFormat } from "@/types/database";

/**
 * Documented MVP audio file size limits:
 * - Maximum: 15 MB (15,728,640 bytes) — well within Gemini inline 20 MB request limit
 * - Minimum: 44 bytes (standard minimum RIFF/WAV header length; prevents 0-byte or trivial text files)
 */
export const MAX_AUDIO_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_FILE_SIZE_MB = 15;
export const MIN_AUDIO_FILE_SIZE_BYTES = 12;

export const SUPPORTED_AUDIO_FORMATS: readonly AudioFormat[] = [
  "mp3",
  "wav",
  "m4a",
  "webm",
] as const;

const MIME_TO_AUDIO_FORMAT: Record<string, AudioFormat> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/x-mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
  "video/webm": "webm",
};

const FORMAT_TO_CANONICAL_MIME: Record<AudioFormat, string> = {
  mp3: "audio/mp3",
  wav: "audio/wav",
  m4a: "audio/m4a",
  webm: "audio/webm",
};

export interface AudioValidationResult {
  valid: boolean;
  error: string | null;
  audioFormat: AudioFormat | null;
  canonicalMimeType: string | null;
}

export function extractFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot === -1 || lastDot === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(lastDot + 1).toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Client-safe metadata validation (checks file presence, extension, MIME type, and file size).
 */
export function validateAudioMetadata(input: {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
}): AudioValidationResult {
  if (!input || !input.fileName || input.fileName.trim().length === 0) {
    return {
      valid: false,
      error: "No audio file selected.",
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return {
      valid: false,
      error: "Audio file is empty (0 bytes). Please upload a valid recording.",
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  if (input.sizeBytes < MIN_AUDIO_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Audio file is too small (${input.sizeBytes} bytes) to contain valid audio data.`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  if (input.sizeBytes > MAX_AUDIO_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Audio file exceeds the ${MAX_AUDIO_FILE_SIZE_MB} MB limit (${formatFileSize(
        input.sizeBytes
      )}).`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  const ext = extractFileExtension(input.fileName);
  const rawMime = (input.mimeType ?? "").split(";")[0].trim().toLowerCase();

  const extFormat: AudioFormat | null = (
    SUPPORTED_AUDIO_FORMATS as readonly string[]
  ).includes(ext)
    ? (ext as AudioFormat)
    : null;

  const mimeFormat: AudioFormat | null = rawMime
    ? MIME_TO_AUDIO_FORMAT[rawMime] ?? null
    : null;

  // Reject if neither extension nor MIME type is a supported audio format
  if (!extFormat && !mimeFormat) {
    return {
      valid: false,
      error: `Unsupported audio format "${
        ext || rawMime || "unknown"
      }". Supported formats: MP3, WAV, M4A, WEBM.`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  // If an explicit non-generic MIME type is provided and conflicts with the extension, reject
  if (
    rawMime &&
    rawMime !== "application/octet-stream" &&
    !mimeFormat
  ) {
    return {
      valid: false,
      error: `Unsupported MIME type "${rawMime}". Supported audio types: MP3, WAV, M4A, WEBM.`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  if (extFormat && mimeFormat && extFormat !== mimeFormat) {
    return {
      valid: false,
      error: `File extension ".${ext}" conflicts with MIME type "${rawMime}".`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  const resolvedFormat = extFormat ?? mimeFormat!;

  return {
    valid: true,
    error: null,
    audioFormat: resolvedFormat,
    canonicalMimeType: FORMAT_TO_CANONICAL_MIME[resolvedFormat],
  };
}

/**
 * Inspects binary header bytes to verify the buffer actually contains audio container/frame signatures
 * rather than plain text, JSON, HTML, or corrupt bytes renamed to an audio extension.
 */
export function verifyAudioBinarySignature(
  buffer: Uint8Array,
  expectedFormat: AudioFormat
): { valid: boolean; reason: string | null } {
  if (!buffer || buffer.byteLength < MIN_AUDIO_FILE_SIZE_BYTES) {
    return {
      valid: false,
      reason: "Audio binary payload is empty or truncated.",
    };
  }

  switch (expectedFormat) {
    case "wav": {
      if (buffer.byteLength < 44) {
        return {
          valid: false,
          reason:
            "Invalid WAV file: shorter than standard 44-byte RIFF/WAVE header.",
        };
      }
      const riff = String.fromCharCode(
        buffer[0],
        buffer[1],
        buffer[2],
        buffer[3]
      );
      const wave = String.fromCharCode(
        buffer[8],
        buffer[9],
        buffer[10],
        buffer[11]
      );
      if (riff !== "RIFF" || wave !== "WAVE") {
        return {
          valid: false,
          reason:
            "Invalid WAV file: missing RIFF/WAVE binary container header.",
        };
      }
      return { valid: true, reason: null };
    }

    case "mp3": {
      const id3 = String.fromCharCode(buffer[0], buffer[1], buffer[2]);
      const isMpegSync =
        buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      if (id3 !== "ID3" && !isMpegSync) {
        return {
          valid: false,
          reason:
            "Invalid MP3 file: missing ID3 tag or MPEG audio frame sync header.",
        };
      }
      return { valid: true, reason: null };
    }

    case "m4a": {
      const ftyp = String.fromCharCode(
        buffer[4],
        buffer[5],
        buffer[6],
        buffer[7]
      );
      const isAdts = buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
      if (ftyp !== "ftyp" && !isAdts) {
        return {
          valid: false,
          reason:
            "Invalid M4A file: missing ISO Base Media (ftyp) or AAC ADTS header.",
        };
      }
      return { valid: true, reason: null };
    }

    case "webm": {
      const isEbml =
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3;
      if (!isEbml) {
        return {
          valid: false,
          reason: "Invalid WEBM file: missing EBML binary header (0x1A45DFA3).",
        };
      }
      return { valid: true, reason: null };
    }

    default:
      return {
        valid: false,
        reason: `Unsupported audio format: ${String(expectedFormat)}`,
      };
  }
}

/**
 * Mandatory server-side audio validation (checks metadata + binary container signatures).
 */
export function validateAudioServerSide(input: {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  buffer: Uint8Array;
}): AudioValidationResult {
  const metaCheck = validateAudioMetadata({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  if (!metaCheck.valid || !metaCheck.audioFormat) {
    return metaCheck;
  }

  if (!input.buffer || input.buffer.byteLength === 0) {
    return {
      valid: false,
      error: "Uploaded audio buffer is empty.",
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  if (input.buffer.byteLength > MAX_AUDIO_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Uploaded audio buffer exceeds ${MAX_AUDIO_FILE_SIZE_MB} MB limit.`,
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  const binaryCheck = verifyAudioBinarySignature(
    input.buffer,
    metaCheck.audioFormat
  );
  if (!binaryCheck.valid) {
    return {
      valid: false,
      error: binaryCheck.reason ?? "Corrupt or invalid audio file content.",
      audioFormat: null,
      canonicalMimeType: null,
    };
  }

  return metaCheck;
}
