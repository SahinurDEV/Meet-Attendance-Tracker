// Firefox build: the same extension/ folder with a Firefox-specific manifest.json.
//
//   npm run build:firefox     → dist/firefox/ (unpacked; load it at about:debugging or with `web-ext run`)
//   npm run package:firefox   → dist/meet-attendance-tracker-v<version>-firefox.zip
//   npm run lint:firefox      → Mozilla's web-ext lint on dist/firefox/
//
// The Chrome manifest stays the single source of truth; firefoxManifest() only changes what differs.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EXT = path.join(ROOT, "extension");
export const FIREFOX_DIR = path.join(ROOT, "dist", "firefox");

// Add-on ID for addons.mozilla.org. It can't be changed once the add-on is published there.
export const GECKO_ID = "meet-attendance-tracker@sahinurdev.github.io";
export const GECKO_MIN_VERSION = "140.0"; // first release with data_collection_permissions (and an ESR)

export function firefoxManifest(chrome) {
  const m = structuredClone(chrome);
  // Firefox MV3 runs background scripts as an event page, not a service worker.
  // Scripts load in order, so lib/storage.js comes first (Chrome loads it with importScripts()).
  if (m.background?.service_worker) {
    m.background = { scripts: ["lib/storage.js", m.background.service_worker] };
  }
  delete m.minimum_chrome_version;
  m.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: GECKO_MIN_VERSION,
      // Required for new add-ons on AMO. Nothing is collected or transmitted; data stays in storage.local.
      data_collection_permissions: { required: ["none"] },
    },
  };
  return m;
}

/** Copy extension/ to dist/firefox/ and write the Firefox manifest. Returns the output dir. */
export function buildFirefox(out = FIREFOX_DIR) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.dirname(out), { recursive: true });
  cpSync(EXT, out, { recursive: true, filter: (src) => !path.basename(src).startsWith(".") });
  const chrome = JSON.parse(readFileSync(path.join(EXT, "manifest.json"), "utf8"));
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(firefoxManifest(chrome), null, 2) + "\n");
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildFirefox();
  console.log(`Firefox build → ${path.relative(ROOT, out)}/`);
}
