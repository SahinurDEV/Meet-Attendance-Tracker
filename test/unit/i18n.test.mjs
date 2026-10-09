import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../extension");
const load = (l) => JSON.parse(fs.readFileSync(path.join(EXT, "_locales", l, "messages.json"), "utf8"));
const en = load("en");
const bn = load("bn");

function sourceFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== "_locales" && f !== "vendor") out.push(...sourceFiles(p));
    } else if (/\.(js|html|json)$/.test(f)) out.push(p);
  }
  return out;
}

test("locales: en and bn have identical keys and valid chrome.i18n messages", () => {
  assert.deepEqual(Object.keys(bn).sort(), Object.keys(en).sort());
  for (const [lang, msgs] of [["en", en], ["bn", bn]]) {
    for (const [k, v] of Object.entries(msgs)) {
      assert.match(k, /^[A-Za-z0-9_]+$/, `${lang}:${k} key`);
      assert.equal(typeof v.message, "string", `${lang}:${k}`);
      assert.ok(v.message.trim().length > 0, `${lang}:${k} empty`);
      // Same $n substitutions in both languages; no stray "$" (chrome.i18n would treat it as a placeholder).
      const subs = (s) => [...s.matchAll(/\$(\d)/g)].map((m) => m[1]).sort().join(",");
      assert.equal(subs(v.message), subs(en[k].message), `${lang}:${k} substitutions`);
      assert.ok(!/\$(?!\d)/.test(v.message), `${lang}:${k} stray $`);
    }
  }
  // Bengali strings are actually translated (Bengali script), apart from a few technical ones.
  const untranslated = Object.keys(en).filter((k) => !/[\u0980-\u09FF]/.test(bn[k].message) && !["bulk_json"].includes(k));
  assert.deepEqual(untranslated, []);
});

test("locales: every key used by the code exists; the manifest uses __MSG_ names", () => {
  const used = new Set();
  for (const f of sourceFiles(EXT)) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:\bt|\bli)\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/\bt\(\s*[^"()]+\?\s*"([A-Za-z0-9_]+)"\s*:\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]).add(m[2]);
    for (const m of s.matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
  }
  for (const s of ["present", "late", "short", "absent", "guestSuffix"]) used.add("status_" + s);
  used.delete("status_"); // tStatus() builds status_<name> dynamically (covered above)
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 200, `only ${used.size} keys found`);
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extName__");
  assert.ok(en.extName.message.length <= 75);
  assert.ok(en.extShortName.message.length <= 12);
  assert.ok(en.extDescription.message.length <= 132, `description ${en.extDescription.message.length} chars`);
  assert.ok(bn.extDescription.message.length <= 132, `bn description ${bn.extDescription.message.length} chars`);
});
