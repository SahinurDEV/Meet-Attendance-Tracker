// Integration test: loads the unpacked extension in Chromium and drives a mock
// Google Meet page (https://meet.google.com/* is routed to a local fixture).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launch, sleep, waitFor, meetings, lives } from "../helpers/harness.mjs";

const MEET_URL = "https://meet.google.com/abc-defg-hij";
let h;
const pageErrors = [];
const offDeviceRequests = [];

async function extensionsInfo() {
  const p = await h.context.newPage();
  await p.goto("chrome://extensions");
  const info = await p.evaluate(
    () => new Promise((r) => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, r))
  );
  await p.close();
  return info.find((i) => i.id === h.extensionId);
}

before(async () => {
  h = await launch();
  // Developer mode makes Chrome collect runtime errors for the manifest check.
  const p = await h.context.newPage();
  await p.goto("chrome://extensions");
  await p.evaluate(() => new Promise((r) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, r)));
  await p.close();
  h.context.on("request", (req) => {
    const u = new URL(req.url());
    if (!["chrome-extension:", "chrome:", "edge:", "data:", "blob:"].includes(u.protocol) && u.host !== "meet.google.com") offDeviceRequests.push(req.url());
  });
  await h.setSettings({ leaveGraceSec: 2, autoSaveIntervalSec: 5 });
});

after(async () => {
  if (h) await h.close();
});

test("manifest is valid MV3 with minimal permissions and loads without errors", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://meet.google.com/*"]);
  const live = await h.worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.name, "__MSG_extName__");
  assert.equal(live.name, "Meet Attendance Tracker"); // resolved from _locales/en
  assert.equal(manifest.default_locale, "en");
  assert.deepEqual(Object.keys(manifest.commands).sort(), ["save-now", "toggle-panel"]);
  const info = await extensionsInfo();
  assert.equal(info.state, "ENABLED");
  assert.deepEqual(info.manifestErrors, []);
  assert.deepEqual(info.installWarnings, []);
});

test("tracks joins, leaves, rejoins and speaking on a Meet-like page", async () => {
  const page = await h.context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(MEET_URL);

  // Initial cast is detected and the in-Meet button shows the live count.
  const fab = page.locator("#mat-attendance-host .fab");
  await waitFor(async () => (await fab.locator(".count").textContent()) === "3", { message: "3 participants in FAB" });

  // Speaking: Daniel talks for ~3s.
  await page.evaluate(() => mockMeet.speak("Daniel Kim", true));
  await sleep(3000);
  await page.evaluate(() => mockMeet.speak("Daniel Kim", false));

  // New joiner who is only visible in the People panel (no video tile).
  await page.evaluate(() => mockMeet.join("Priya Natarajan", { tile: false }));
  // Short DOM flicker must NOT count as leave/rejoin.
  await page.evaluate(() => mockMeet.flicker("Ayesha Siddiqua", 500));
  await waitFor(async () => (await fab.locator(".count").textContent()) === "4", { message: "4 participants" });

  // Ayesha leaves for real, then rejoins after the grace period.
  await page.evaluate(() => mockMeet.leave("Ayesha Siddiqua"));
  await waitFor(async () => (await fab.locator(".count").textContent()) === "3", { message: "absence noticed" });
  await sleep(3500); // longer than the 2s leave grace → a real leave is recorded
  await page.evaluate(() => mockMeet.join("Ayesha Siddiqua"));
  await waitFor(async () => (await fab.locator(".count").textContent()) === "4", { message: "rejoin recorded" });

  // Live state is published for the popup / dashboard.
  const live = await waitFor(async () => lives(await h.storage())[0], { message: "live state" });
  assert.equal(live.record.code, "abc-defg-hij");
  assert.equal(live.present, 4);

  // Panel shows the live list.
  await fab.click();
  const panel = page.locator("#mat-attendance-host .panel");
  await assert.doesNotReject(panel.waitFor({ state: "visible" }));
  const names = await panel.locator(".p .nm").allTextContents();
  assert.deepEqual(names.map((n) => n.replace(/YOU$/, "")).sort(), ["Ayesha Siddiqua", "Daniel Kim", "Priya Natarajan", "Sahinur Rahman"]);
  assert.equal(await panel.locator(".p .you").count(), 1);

  // Manual save button.
  await panel.locator('[data-act="save"]').click();
  const saved = await waitFor(async () => meetings(await h.storage()).find((m) => m.savedVia === "manual"), { message: "manual save" });
  assert.equal(saved.code, "abc-defg-hij");

  // Exports from the in-Meet panel download real files named with the date.
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  for (const fmt of ["csv", "xlsx", "pdf"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), panel.locator(`[data-act="${fmt}"]`).click()]);
    assert.match(dl.suggestedFilename(), new RegExp(`^meet-attendance_abc-defg-hij_${today}_\\d{4}\\.${fmt}$`));
    const buf = readFileSync(await dl.path());
    if (fmt === "csv") assert.match(buf.toString("utf8"), /Priya Natarajan/);
    if (fmt === "xlsx") assert.equal(buf.subarray(0, 2).toString(), "PK");
    if (fmt === "pdf") assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  }

  // Meeting ends: everything is finalized and auto-saved.
  await page.evaluate(() => mockMeet.endCall());
  const final = await waitFor(async () => meetings(await h.storage()).find((m) => m.endedAt), { message: "final save" });
  const rows = Object.fromEntries(final.participants.map((p) => [p.name, p]));
  assert.equal(final.participants.length, 4);
  assert.ok(final.participants.every((p) => !p.present));
  assert.equal(rows["Sahinur Rahman"].isSelf, true);
  assert.equal(rows["Ayesha Siddiqua"].sessions.length, 2, "leave + rejoin => 2 sessions (flicker ignored)");
  assert.equal(rows["Daniel Kim"].sessions.length, 1);
  assert.ok(rows["Daniel Kim"].speakingMs >= 2000 && rows["Daniel Kim"].speakingMs <= 5000, `speaking ${rows["Daniel Kim"].speakingMs}`);
  assert.equal(rows["Ayesha Siddiqua"].speakingMs, 0);
  const s = rows["Ayesha Siddiqua"].sessions;
  assert.ok(s[1].start > s[0].end, "gap between sessions");
  await waitFor(async () => lives(await h.storage()).length === 0, { message: "live state cleared" });
  await page.close();
});

test("auto-save off: nothing is stored until the user saves manually", async () => {
  await h.setSettings({ autoSave: false });
  const before = meetings(await h.storage()).length;
  const page = await h.context.newPage();
  await page.goto("https://meet.google.com/xyz-abcd-efg");
  await waitFor(async () => lives(await h.storage()).length === 1, { message: "live" });
  await sleep(1500);
  assert.equal(meetings(await h.storage()).length, before);
  // Popup "Save now" sends a command to the Meet tab.
  const popup = await h.context.newPage();
  await popup.goto(h.url("popup.html"));
  await popup.getByRole("button", { name: "Save now" }).click();
  await waitFor(async () => meetings(await h.storage()).some((m) => m.code === "xyz-abcd-efg"), { message: "popup save" });
  await popup.close();
  await page.close();
  await h.setSettings({ autoSave: true });
});

test("ignore-my-name and 12h time format apply to the in-Meet panel", async () => {
  await h.setSettings({ ignoreSelf: true, timeFormat: "12h" });
  const page = await h.context.newPage();
  await page.goto("https://meet.google.com/qrs-tuvw-xyz");
  const fab = page.locator("#mat-attendance-host .fab");
  await waitFor(async () => (await fab.locator(".count").textContent()) === "2", { message: "self hidden" });
  await fab.click();
  const sub = await page.locator("#mat-attendance-host .p .sub").first().textContent();
  assert.match(sub, /(AM|PM)/);
  await page.close();
  await h.setSettings({ ignoreSelf: false, timeFormat: "24h" });
});

test("dashboard lists history with search, details and delete", async () => {
  const dash = await h.context.newPage();
  dash.on("pageerror", (e) => pageErrors.push(e.message));
  await dash.goto(h.url("dashboard.html#/meetings"));
  const rowsLoc = dash.locator("#meetingTable tbody tr");
  await waitFor(async () => (await rowsLoc.count()) >= 2, { message: "meeting rows" });
  await dash.getByRole("searchbox", { name: "Search meetings" }).fill("Priya");
  await waitFor(async () => (await rowsLoc.count()) === 1, { message: "search filters by participant" });
  await rowsLoc.first().click();
  await dash.waitForSelector("#participantsTable");
  const names = await dash.locator("#participantsTable tbody tr").evaluateAll((trs) => trs.map((t) => t.dataset.name));
  assert.ok(names.includes("Priya Natarajan"));
  const [dl] = await Promise.all([dash.waitForEvent("download"), dash.locator('[data-export="xlsx"]').click()]);
  assert.match(dl.suggestedFilename(), /\.xlsx$/);

  const count = meetings(await h.storage()).length;
  await dash.getByRole("button", { name: "Delete", exact: true }).click();
  await dash.locator("#modalOk").click();
  await waitFor(async () => meetings(await h.storage()).length === count - 1, { message: "deleted" });
  await dash.waitForURL(/#\/meetings$/);

  // Settings page writes to storage.
  await dash.goto(h.url("dashboard.html#/settings"));
  await dash.locator("label.switch:has(#set-ignoreSelf)").click();
  await waitFor(async () => (await h.storage()).settings.ignoreSelf === true, { message: "setting saved" });
  await dash.locator("label.switch:has(#set-ignoreSelf)").click();
  await dash.close();
});

test("no runtime errors and no off-device network requests", async () => {
  assert.deepEqual(pageErrors, []);
  const info = await extensionsInfo();
  assert.deepEqual(info.runtimeErrors, [], JSON.stringify(info.runtimeErrors));
  assert.deepEqual(offDeviceRequests, []);
});
