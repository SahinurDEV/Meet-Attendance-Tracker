// Build a Chrome Web Store–ready zip of extension/ → dist/meet-attendance-tracker-v<version>.zip
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { checkManifest } from "./check-manifest.mjs";
import { buildFirefox } from "./firefox.mjs";

const require = createRequire(import.meta.url);
const { zip } = require("../extension/lib/export.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `node scripts/package.mjs --firefox` packages the Firefox variant (see scripts/firefox.mjs).
const FIREFOX = process.argv.includes("--firefox");
const EXT = FIREFOX ? buildFirefox() : path.join(ROOT, "extension");

const problems = checkManifest(EXT);
if (problems.length) {
  console.error("Manifest check failed:\n - " + problems.join("\n - "));
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push({ name: path.relative(EXT, full).split(path.sep).join("/"), data: readFileSync(full), date: statSync(full).mtime });
  }
})(EXT);

const { version } = JSON.parse(readFileSync(path.join(EXT, "manifest.json"), "utf8"));
mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const out = path.join(ROOT, "dist", `meet-attendance-tracker-v${version}${FIREFOX ? "-firefox" : ""}.zip`);
const bytes = zip(files.map((f) => ({ ...f, data: new Uint8Array(f.data) })));
writeFileSync(out, bytes);
console.log(`Packaged ${files.length} files (${(bytes.length / 1024).toFixed(1)} KB) → ${path.relative(ROOT, out)}`);
