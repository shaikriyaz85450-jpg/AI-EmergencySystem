/**
 * ============================================================================
 * BUILD & DEPLOYMENT CACHE PURGE UTILITY
 * ============================================================================
 * Purges compiler cache directories (.next/cache, .netlify/.next/cache) and
 * any Turbopack SSTable files (.sst) before and after production builds.
 *
 * Why this is needed:
 * - Turbopack incremental cache stores compiler snapshots in .next/cache/turbopack/*.sst.
 * - These SSTable files are only needed for local development cache and are NOT needed
 *   for runtime production execution.
 * - Netlify scans deployment artifacts (.netlify/) for secret values.
 * - By purging all compiler caches and SST files, no cached secret snapshots are ever
 *   accessible to Netlify's secret scanner, without disabling or bypassing secret scanning.
 * ============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const explicitDirsToPrune = [
  path.join(projectRoot, ".next", "cache"),
  path.join(projectRoot, ".netlify", ".next", "cache"),
  path.join(projectRoot, ".netlify", "cache"),
];

for (const dirPath of explicitDirsToPrune) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`[clean-build-cache] Purged cache directory: ${dirPath}`);
    }
  } catch (err) {
    console.warn(`[clean-build-cache] Warning while removing ${dirPath}:`, err.message);
  }
}

/**
 * Recursively scans a root directory to remove any leftover Turbopack .sst files or cache directories.
 */
function cleanNestedCaches(rootDir) {
  if (!fs.existsSync(rootDir)) return;

  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "cache" || entry.name === "turbopack") {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`[clean-build-cache] Purged cache directory: ${fullPath}`);
          } catch (err) {
            console.warn(`[clean-build-cache] Could not remove ${fullPath}:`, err.message);
          }
        } else {
          cleanNestedCaches(fullPath);
        }
      } else if (entry.name.endsWith(".sst")) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`[clean-build-cache] Removed SSTable file: ${fullPath}`);
        } catch (err) {
          console.warn(`[clean-build-cache] Could not remove ${fullPath}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.warn(`[clean-build-cache] Error traversing ${rootDir}:`, err.message);
  }
}

cleanNestedCaches(path.join(projectRoot, ".next"));
cleanNestedCaches(path.join(projectRoot, ".netlify"));
