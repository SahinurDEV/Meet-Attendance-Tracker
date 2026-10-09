import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { firefoxManifest, buildFirefox, GECKO_ID, EXT } from "../../scripts/firefox.mjs";
import { checkManifest } from "../../scripts/check-manifest.mjs";

const chrome = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));

test("firefox manifest: event-page background, gecko settings, everything else unchanged", () => {
  const ff = firefoxManifest(chrome);
  assert.deepEqual(ff.background, { scripts: ["lib/storage.js", "background.js"] });
  assert.equal(ff.browser_specific_settings.gecko.id, GECKO_ID);
  assert.match(ff.browser_specific_settings.gecko.strict_min_version, /^\d+\.0$/);
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ["none"] });
  assert.ok(!("minimum_chrome_version" in ff));
  const strip = (m) => {
    const c = structuredClone(m);
    delete c.background;
    delete c.browser_specific_settings;
    delete c.minimum_chrome_version;
    return c;
  };
  assert.deepEqual(strip(ff), strip(chrome)); // same permissions, content scripts, commands, CSP, version
  assert.equal(chrome.background.service_worker, "background.js", "source manifest is not modified");
});

test("firefox build: copies the extension and passes the manifest checks", () => {
  const out = buildFirefox(fs.mkdtempSync(path.join(os.tmpdir(), "mat-ff-")) + "/firefox");
  try {
    assert.deepEqual(checkManifest(out), []);
    const built = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    assert.ok(built.browser_specific_settings);
    assert.ok(fs.existsSync(path.join(out, "_locales/bn/messages.json")));
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test("background.js only calls importScripts where it exists (service worker), so it also runs as a Firefox event page", () => {
  const src = fs.readFileSync(path.join(EXT, "background.js"), "utf8");
  assert.match(src, /if \(typeof importScripts === "function"\) importScripts\("lib\/storage\.js"\);/);
});
