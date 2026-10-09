import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkManifest } from "../../scripts/check-manifest.mjs";

test("manifest: MV3, minimal permissions, all files present, no remote code or network APIs", () => {
  const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extension");
  assert.deepEqual(checkManifest(ext), []);
});
