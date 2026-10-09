// Shared Playwright harness: launches Chromium with the unpacked extension and
// routes https://meet.google.com/* to the local mock Meet page.
import { chromium } from "playwright";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const EXT_DIR = path.join(ROOT, "extension");
const MOCK_HTML = readFileSync(path.join(ROOT, "test/fixtures/mock-meet.html"), "utf8");

export async function launch({ headless = true, viewport = { width: 1440, height: 900 }, colorScheme = "light" } = {}) {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "mat-profile-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium", // new headless mode supports extensions
    headless,
    viewport,
    colorScheme,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--no-first-run", "--lang=en-US"],
  });
  const externalRequests = [];
  await context.route("https://meet.google.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: MOCK_HTML })
  );
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;

  // Close the welcome tab opened on install so tests start clean.
  await new Promise((r) => setTimeout(r, 500));
  for (const p of context.pages()) if (p.url().includes("#/welcome")) await p.close();

  return {
    context,
    worker,
    extensionId,
    externalRequests,
    url: (p) => `chrome-extension://${extensionId}/${p}`,
    storage: () => worker.evaluate(() => chrome.storage.local.get(null)),
    setSettings: (patch) =>
      worker.evaluate(async (patch) => {
        const { settings } = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({ settings: { ...(settings || {}), ...patch } });
      }, patch),
    async close() {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 15000, interval = 250, message = "condition" } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${message}`);
}

export const meetings = (all) => Object.entries(all).filter(([k]) => k.startsWith("m:")).map(([, v]) => v);
export const lives = (all) => Object.entries(all).filter(([k]) => k.startsWith("live:")).map(([, v]) => v);
