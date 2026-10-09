/**
 * ============================================================================
 * POST-BUILD CACHE CLEANUP
 * ============================================================================
 * Removes temporary Turbopack and Webpack compiler disk caches (.next/cache,
 * .netlify/.next/cache) immediately after production builds.
 *
 * Why this is needed:
 * - Next.js Turbopack stores incremental compiler task snapshots in .next/cache/turbopack/*.sst.
 * - These SSTable files are only needed for local dev caching and are NOT needed at runtime.
 * - Cloud providers (like Netlify) scan deployment artifacts (.netlify/) for secrets.
 * - Deleting the compiler cache ensures zero stale compiler artifacts or SSTable snapshots
 *   remain in the build output, without disabling Netlify secret scanning.
 * ============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const pathsToPrune = [
  path.join(projectRoot, ".next", "cache"),
  path.join(projectRoot, ".netlify", ".next", "cache"),
];

for (const targetPath of pathsToPrune) {
  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`[clean-build-cache] Successfully purged: ${targetPath}`);
    }
  } catch (err) {
    console.warn(`[clean-build-cache] Warning while removing ${targetPath}:`, err.message);
  }
}
