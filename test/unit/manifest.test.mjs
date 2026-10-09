import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkManifest } from "../../scripts/check-manifest.mjs";

test("manifest: MV3, minimal permissions, all files present, no remote code or network APIs", () => {
  const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extension");
  assert.deepEqual(checkManifest(ext), []);
});

test("versions agree (package.json, manifest, exports) and only `storage` is requested", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const fs = await import("node:fs");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
  const { createRequire } = await import("node:module");
  const ex = createRequire(import.meta.url)("../../extension/lib/export.js");
  assert.equal(manifest.version, pkg.version);
  assert.equal(ex.APP_VERSION, pkg.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(Object.keys(manifest.commands).sort(), ["save-now", "toggle-panel"]);
});
