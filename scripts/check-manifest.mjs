// Static manifest sanity checks: MV3, every referenced file exists, no remote code.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function checkManifest(extDir) {
  const problems = [];
  const m = JSON.parse(readFileSync(path.join(extDir, "manifest.json"), "utf8"));
  if (m.manifest_version !== 3) problems.push("manifest_version must be 3");
  const allowed = new Set(["storage"]);
  for (const p of m.permissions || []) if (!allowed.has(p)) problems.push(`unexpected permission: ${p}`);
  if (m.host_permissions?.length) problems.push("host_permissions should be empty");
  const refs = [
    m.background?.service_worker,
    m.action?.default_popup,
    ...Object.values(m.icons || {}),
    ...Object.values(m.action?.default_icon || {}),
    ...(m.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ].filter(Boolean);
  for (const r of refs) if (!existsSync(path.join(extDir, r))) problems.push(`missing file: ${r}`);
  // No remote scripts / CDN references in shipped code or pages.
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|html|css)$/.test(name)) {
        const src = readFileSync(full, "utf8");
        if (/<script[^>]+src=["']https?:/i.test(src) || /importScripts\(\s*["']https?:/.test(src) || /\bimport\s*\(\s*["']https?:/.test(src))
          problems.push(`remote code reference in ${path.relative(extDir, full)}`);
        if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src)) problems.push(`network API used in ${path.relative(extDir, full)}`);
      }
    }
  })(extDir);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../extension");
  const problems = checkManifest(ext);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("manifest OK");
}
