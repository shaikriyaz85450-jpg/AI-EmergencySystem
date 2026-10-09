/**
 * ============================================================================
 * SERVER-ONLY ENVIRONMENT ACCESSOR
 * ============================================================================
 * Safe, server-only runtime access for sensitive backend secrets.
 *
 * Rules:
 * 1. Must never be imported from any Client Component ("use client").
 * 2. Throws an immediate error if executed in a browser/client environment.
 * 3. Uses dynamic lookup to prevent Turbopack/Next.js from statically capturing
 *    or inlining sensitive secret values into build-time compilation caches (.sst).
 * ============================================================================
 */

function ensureServerContext(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "SECURITY VIOLATION: Server secrets cannot be accessed from a client context."
    );
  }
}

/**
 * Dynamically resolves a server-only environment variable at runtime.
 */
export function getServerSecret(variableName: string): string | undefined {
  ensureServerContext();

  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  // Dynamic bracket access avoids compile-time AST property capture by Turbopack
  const envDictionary = process.env as Record<string, string | undefined>;
  const val = envDictionary[variableName];
  if (!val) return undefined;

  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Retrieves the Gemini API Key strictly in server runtime context.
 */
export function getGeminiApiKey(): string | undefined {
  const secretKeyName = ["GEMINI", "API", "KEY"].join("_");
  return getServerSecret(secretKeyName);
}

/**
 * Retrieves Groq API Key strictly in server runtime context.
 */
export function getGroqApiKey(): string | undefined {
  const secretKeyName = ["GROQ", "API", "KEY"].join("_");
  return getServerSecret(secretKeyName);
}

/**
 * Retrieves OpenAI API Key strictly in server runtime context.
 */
export function getOpenAiApiKey(): string | undefined {
  const secretKeyName = ["OPENAI", "API", "KEY"].join("_");
  return getServerSecret(secretKeyName);
}
