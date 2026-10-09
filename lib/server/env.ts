import "server-only";

/**
 * ============================================================================
 * SERVER-ONLY ENVIRONMENT ACCESSOR
 * ============================================================================
 * Safe, server-only runtime access for sensitive backend secrets.
 *
 * Rules:
 * 1. Enforced with `import "server-only"`; importing from any Client Component
 *    ("use client") causes an immediate compilation failure.
 * 2. Throws an immediate error if executed in a browser/client environment.
 * 3. Never evaluates or leaks secret values during static build phase
 *    (`NEXT_PHASE === "phase-production-build"`).
 * 4. Uses dynamic bracket lookup to prevent Turbopack/Next.js from statically capturing
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
 * Dynamically resolves a server-only environment variable strictly at request runtime.
 */
export function getServerSecret(variableName: string): string | undefined {
  ensureServerContext();

  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  // During static site generation / next build compilation phase, never expose secrets
  // to compilation workers or cache snapshots.
  if (process.env.NEXT_PHASE === "phase-production-build") {
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
