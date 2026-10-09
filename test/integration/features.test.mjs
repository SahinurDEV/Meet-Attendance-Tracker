// v2.1 features end-to-end: rosters, rules, chat, notifications, shortcuts,
// tags/notes, analytics, series, bulk/JSON/TSV exports, Bengali PDF, theme, i18n.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { launch, sleep, waitFor, meetings } from "../helpers/harness.mjs";

const CODE = "ftr-abcd-efg";
const MEET_URL = `https://meet.google.com/${CODE}`;
let h;
const pageErrors = [];
const offDevice = [];

before(async () => {
  h = await launch();
  const p = await h.context.newPage();
  await p.goto("chrome://extensions");
  await p.evaluate(() => new Promise((r) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, r)));
  await p.close();
  h.context.on("request", (req) => {
    const u = new URL(req.url());
    if (!["chrome-extension:", "chrome:", "data:", "blob:"].includes(u.protocol) && u.host !== "meet.google.com") offDevice.push(req.url());
  });
  await h.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://meet.google.com" });
  // Rules small enough to observe in seconds: late after 3 s, short below 2.4 s.
  await h.setSettings({ leaveGraceSec: 1, autoSaveIntervalSec: 5, lateThresholdMin: 0.05, minPresenceMode: "minutes", minPresenceValue: 0.04, notifyJoinLeave: true, notifySound: true });
});

after(async () => {
  if (h) await h.close();
});

const watch = (p) => p.on("pageerror", (e) => pageErrors.push(`${p.url()}: ${e.message}`));
const download = async (page, click) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), click()]);
  return { name: dl.suggestedFilename(), buf: readFileSync(await dl.path()) };
};

test("roster editor: paste + CSV import, linked to a meeting code", async () => {
  const dash = await h.context.newPage();
  watch(dash);
  await dash.goto(h.url("dashboard.html#/rosters"));
  await dash.locator("#newRoster").click();
  await dash.locator("#rosterName").fill("Product team");
  await dash.locator("#rosterCodes").fill(`${CODE.toUpperCase()}, other-code-xyz`);
  await dash.locator("#rosterFile").setInputFiles({
    name: "team.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email\nAyesha Siddiqua,ayesha@example.com\nDaniel Kim,daniel@example.com\nMd. Rahim Uddin,rahim@example.com\nZara Late,\n"),
  });
  await waitFor(async () => /4/.test(await dash.locator("#rosterCount").textContent()), { message: "4 imported members" });
  await dash.locator("#saveRoster").click();
  await dash.waitForURL(/#\/rosters$/);
  await dash.locator('.roster-card[data-roster="Product team"]').waitFor();
  const all = await h.storage();
  const roster = Object.entries(all).find(([k]) => k.startsWith("roster:"))[1];
  assert.deepEqual(roster.codes, [CODE, "other-code-xyz"]);
  assert.deepEqual(roster.members.map((m) => m.name), ["Ayesha Siddiqua", "Daniel Kim", "Md. Rahim Uddin", "Zara Late"]);
  assert.equal(roster.members[0].email, "ayesha@example.com");
  await dash.close();
});

test("live meeting: absentees, late/short rules, toasts, chat, shortcuts, exports", async () => {
  const page = await h.context.newPage();
  watch(page);
  await page.goto(MEET_URL);
  const host = page.locator("#mat-attendance-host");
  const fab = host.locator(".fab");
  await waitFor(async () => (await fab.locator(".count").textContent()) === "3", { message: "initial cast" });

  // Keyboard shortcut command opens the panel (forwarded by the service worker to the active tab).
  await page.bringToFront();
  const res = await h.worker.evaluate(() => self.__matHandleCommand("toggle-panel"));
  assert.deepEqual(res, { ok: true });
  const panel = host.locator(".panel");
  await panel.waitFor({ state: "visible" });

  // Roster: Rahim and Zara haven't joined yet → "Not here yet", expected 2/4.
  await waitFor(async () => (await panel.locator('.p[data-status="absent"]').count()) === 2, { message: "2 absentees in panel" });
  assert.deepEqual((await panel.locator('.p[data-status="absent"]').evaluateAll((n) => n.map((x) => x.dataset.name))).sort(), ["Md. Rahim Uddin", "Zara Late"]);
  assert.match(await panel.locator(".sect").textContent(), /Not here yet \(2\)/);
  assert.equal(await panel.locator('[data-k="total"]').textContent(), "2/4");
  assert.match(await panel.locator('[data-l="total"]').textContent(), /Expected/);
  // You (not on the roster) are not tagged as a guest.
  assert.equal(await panel.locator('.p[data-name="Sahinur Rahman"] .tag.guest').count(), 0);

  // Join/leave toasts (after the warm-up): Zara joins late (> 3 s after start), Rahim matches "Md. Rahim Uddin".
  await sleep(5200);
  await page.evaluate(() => mockMeet.join("Zara Late"));
  await page.evaluate(() => mockMeet.join("Rahim Uddin"));
  await waitFor(async () => (await host.locator(".toast.join").count()) >= 1, { message: "join toast" });
  assert.match(await host.locator(".toasts").textContent(), /Zara Late joined/);
  await waitFor(async () => (await panel.locator('.p[data-name="Zara Late"]').getAttribute("data-status")) === "late", { message: "Zara late" });
  assert.equal(await panel.locator('.p[data-status="absent"]').count(), 0);
  assert.equal(await panel.locator('[data-k="total"]').textContent(), "4/4");

  // A guest who pops in for under a second is "Too short" once gone; leave toast is shown.
  await page.evaluate(() => mockMeet.join("Quick Visitor"));
  await sleep(300);
  await page.evaluate(() => mockMeet.leave("Quick Visitor"));
  await waitFor(async () => /Quick Visitor left/.test(await host.locator(".toasts").textContent()), { message: "leave toast" });
  await waitFor(async () => (await panel.locator('.p[data-name="Quick Visitor"]').getAttribute("data-status")) === "short", { message: "short status" });

  // Bengali participant + chat messages.
  await page.evaluate(() => mockMeet.join("তানভীর হাসান"));
  await page.evaluate(() => {
    mockMeet.chat("Ayesha Siddiqua", "Good morning everyone!");
    mockMeet.chat("Ayesha Siddiqua", "Slides: see the shared folder");
    mockMeet.chat("তানভীর হাসান", "শুভ সকাল!");
  });
  await waitFor(async () => /💬 3/.test(await panel.locator(".saved").textContent()), { message: "chat captured (3)" });

  // save-now shortcut → manual save including chat.
  const r2 = await h.worker.evaluate(() => self.__matHandleCommand("save-now"));
  assert.deepEqual(r2, { ok: true });
  const saved = await waitFor(async () => meetings(await h.storage()).find((m) => m.code === CODE && m.savedVia === "manual"), { message: "manual save via shortcut" });
  assert.deepEqual(saved.chat.map((c) => c.text), ["Good morning everyone!", "Slides: see the shared folder", "শুভ সকাল!"]);
  assert.equal(saved.chat[2].sender, "তানভীর হাসান");

  // Copy as table → TSV in the clipboard.
  await panel.locator('[data-act="copy"]').click();
  await waitFor(async () => /Copied/.test(await host.locator(".toasts").textContent()), { message: "copied toast" });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const lines = clip.trim().split("\n");
  assert.equal(lines[0], "#\tName\tStatus\tFirst Seen\tLast Seen\tTime in Call\tSpeaking Time\tJoins");
  assert.ok(lines.some((l) => /\tZara Late\tLate\t/.test(l)));
  assert.ok(lines.some((l) => /\tQuick Visitor\tToo short \(guest\)\t/.test(l)));

  // JSON + chat CSV + PDF (Bengali names drawn as images) from the panel.
  const json = await download(page, () => panel.locator('[data-act="json"]').click());
  assert.match(json.name, new RegExp(`^meet-attendance_${CODE}_\\d{4}-\\d{2}-\\d{2}_\\d{4}\\.json$`));
  const j = JSON.parse(json.buf.toString("utf8"));
  assert.equal(j.meeting.roster.name, "Product team");
  assert.equal(j.participants.find((p) => p.name === "Zara Late").status, "late");
  assert.equal(j.chat.length, 3);
  const chatCsv = await download(page, () => panel.locator('[data-act="chat-csv"]').click());
  assert.match(chatCsv.name, /^meet-chat_/);
  assert.match(chatCsv.buf.toString("utf8"), /শুভ সকাল!/);
  const pdf = await download(page, () => panel.locator('[data-act="pdf"]').click());
  const pdfText = pdf.buf.toString("latin1");
  assert.match(pdfText, /\/Subtype \/Image .*\/SMask \d+ 0 R/);
  assert.match(pdfText, /\/Filter \/RunLengthDecode/);
  assert.ok(!pdfText.includes("(??????"), "no question-mark fallback for Bengali");
  const xlsx = await download(page, () => panel.locator('[data-act="xlsx"]').click());
  const wb = XLSX.read(xlsx.buf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["Attendance", "Chat"]);

  // Toggle shortcut closes the panel again.
  await h.worker.evaluate(() => self.__matHandleCommand("toggle-panel"));
  await panel.waitFor({ state: "hidden" });

  // Dark theme applies to the in-Meet UI.
  await h.setSettings({ theme: "dark" });
  await waitFor(async () => (await host.getAttribute("data-theme")) === "dark", { message: "panel dark theme" });
  await h.setSettings({ theme: "system" });

  await sleep(2500); // everyone still in the call passes the 2.4 s minimum
  await page.evaluate(() => mockMeet.endCall());
  const final = await waitFor(async () => meetings(await h.storage()).find((m) => m.code === CODE && m.endedAt), { message: "final save" });
  assert.equal(final.chat.length, 3);
  assert.equal(final.participants.length, 7);
  await page.close();
});

test("dashboard: detail statuses, roster override, tags, notes, tag filter, bulk export, JSON", async () => {
  const dash = await h.context.newPage();
  watch(dash);
  const rec = meetings(await h.storage()).find((m) => m.code === CODE);
  await dash.goto(h.url(`dashboard.html#/meeting/${encodeURIComponent(rec.id)}`));
  await dash.locator("#participantsTable").waitFor();
  const st = await dash.locator("#participantsTable tbody tr").evaluateAll((trs) => Object.fromEntries(trs.map((t) => [t.dataset.name, t.dataset.status])));
  assert.equal(st["Zara Late"], "late");
  assert.equal(st["Quick Visitor"], "short");
  assert.equal(st["Ayesha Siddiqua"], "present");
  assert.equal(st["Rahim Uddin"], "late"); // joined together with Zara
  assert.match(await dash.locator("#chatLog").textContent(), /Good morning everyone!/);

  // Choosing "No roster" removes roster statuses; switching back restores them.
  await dash.locator("#rosterSelect").selectOption("none");
  await waitFor(async () => (await h.storage())[`m:${rec.id}`].rosterId === "none", { message: "rosterId none" });
  await dash.locator("#rosterSelect").selectOption("");
  await waitFor(async () => !(await h.storage())[`m:${rec.id}`].rosterId, { message: "roster auto" });

  // Tags + notes.
  const tagInput = dash.locator("#tagEditor input");
  await tagInput.fill("Sprint 12");
  await tagInput.press("Enter");
  await tagInput.fill("#standup");
  await tagInput.press("Enter");
  await dash.locator("#meetingNotes").fill("Decided to ship v2.1 on Friday.");
  await dash.locator("#meetingNotes").blur();
  await waitFor(async () => {
    const m = (await h.storage())[`m:${rec.id}`];
    return m.tags?.length === 2 && /ship v2.1/.test(m.notes || "");
  }, { message: "tags + notes saved" });
  assert.deepEqual((await h.storage())[`m:${rec.id}`].tags, ["sprint-12", "standup"]);

  const j = await download(dash, () => dash.locator('[data-export="json"]').click());
  const parsed = JSON.parse(j.buf.toString("utf8"));
  assert.deepEqual(parsed.meeting.tags, ["sprint-12", "standup"]);
  assert.match(parsed.meeting.notes, /ship v2.1/);

  // Meetings list: seed a second, untagged meeting, then filter by tag.
  await h.worker.evaluate(async () => {
    const now = Date.now();
    await chrome.storage.local.set({
      "m:seed-1": { id: "seed-1", code: "zzz-yyyy-xxx", title: "Other meeting", startedAt: now - 86400000, endedAt: now - 86400000 + 1800000, updatedAt: now - 86400000 + 1800000, savedVia: "auto", participants: [{ key: "bob", name: "Bob", sessions: [{ start: now - 86400000, end: now - 86400000 + 1800000 }], speakingMs: 0, joins: 1 }] },
    });
  });
  await dash.goto(h.url("dashboard.html#/meetings"));
  const rows = dash.locator("#meetingTable tbody tr");
  await waitFor(async () => (await rows.count()) >= 2, { message: "2 meetings" });
  const total = await rows.count();
  await dash.locator('.tagchip[data-tag="standup"]').click();
  await waitFor(async () => (await rows.count()) === 1, { message: "tag filter" });
  await dash.locator('.tagchip[data-tag="standup"]').click();
  await waitFor(async () => (await rows.count()) === total, { message: "tag filter cleared" });

  // Bulk export: XLSX workbook with a summary sheet + a sheet per meeting.
  await dash.locator("#bulkExport").click();
  await dash.locator("#bulkFormat").selectOption("xlsx");
  const bulk = await download(dash, () => dash.locator("#modalOk").click());
  assert.match(bulk.name, /^meet-attendance_bulk_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = XLSX.read(bulk.buf, { type: "buffer" });
  assert.equal(wb.SheetNames[0], "Summary");
  assert.ok(wb.SheetNames.length >= 3, wb.SheetNames.join(","));
  // Tag-restricted bulk CSV.
  await dash.locator("#bulkExport").click();
  await dash.locator("#bulkTag").selectOption("standup");
  await dash.locator("#bulkFormat").selectOption("csv");
  const bulkCsv = await download(dash, () => dash.locator("#modalOk").click());
  assert.ok(!/Other meeting/.test(bulkCsv.buf.toString("utf8")));
  assert.match(bulkCsv.buf.toString("utf8"), /Zara Late/);
  await dash.close();
});

test("analytics, person history and recurring series matrix with exports", async () => {
  // A second session of the same meeting code → a series.
  await h.worker.evaluate(async (code) => {
    const t0 = Date.now() - 7 * 86400000;
    const p = (key, name, offMin, durMin, speakMs = 0) => ({ key, name, sessions: [{ start: t0 + offMin * 60000, end: t0 + (offMin + durMin) * 60000 }], speakingMs: speakMs, joins: 1 });
    await chrome.storage.local.set({
      "m:seed-series": { id: "seed-series", code, title: "Weekly Product Sync", startedAt: t0, endedAt: t0 + 3600000, updatedAt: t0 + 3600000, savedVia: "auto",
        participants: [p("ayesha siddiqua", "Ayesha Siddiqua", 0, 60, 600000), p("daniel kim", "Daniel Kim", 0, 55, 300000), p("md. rahim uddin", "Md. Rahim Uddin", 20, 40, 60000)] },
    });
  }, CODE);
  const dash = await h.context.newPage();
  watch(dash);
  await dash.goto(h.url("dashboard.html#/analytics"));
  await dash.locator("#chartAttendance svg").waitFor();
  assert.ok((await dash.locator("#chartAttendance svg rect").count()) > 0);
  await dash.locator("#chartSpeakers svg").waitFor();
  await dash.locator("#chartShare svg").waitFor();
  await dash.locator("#rangeSelect").selectOption("all");
  const people = dash.locator("#peopleTable tbody tr");
  await waitFor(async () => (await people.count()) >= 5, { message: "people rows" });
  await dash.locator('#peopleTable tr[data-key="daniel kim"]').click();
  await dash.locator("#personTrend svg").waitFor();
  assert.match(await dash.locator(".view, main").first().textContent(), /Daniel Kim/);

  await dash.goto(h.url("dashboard.html#/series"));
  await dash.locator(`#seriesTable tr[data-code="${CODE}"]`).click();
  await dash.locator("#seriesMatrix").waitFor();
  const header = await dash.locator("#seriesMatrix thead th").count();
  assert.ok(header >= 4, `matrix columns ${header}`);
  const matrixText = await dash.locator("#seriesMatrix").textContent();
  assert.match(matrixText, /Zara Late/);
  const sx = await download(dash, () => dash.locator('[data-export="series-xlsx"]').click());
  const wb = XLSX.read(sx.buf, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Series, { header: 1, raw: true });
  const zara = rows.find((r) => r[0] === "Zara Late");
  assert.equal(zara[1], "Absent"); // not there in the older session
  assert.match(zara[2], /^Late /);
  const sc = await download(dash, () => dash.locator('[data-export="series-csv"]').click());
  assert.match(sc.name, new RegExp(`^meet-attendance_series_${CODE}_`));
  await dash.close();
});

test("theme: follows the system by default, can be forced dark or light", async () => {
  const dash = await h.context.newPage();
  watch(dash);
  await dash.emulateMedia({ colorScheme: "dark" });
  await dash.goto(h.url("dashboard.html#/settings"));
  await dash.locator('#seg-theme button[data-v="system"]').waitFor();
  const bg = () => dash.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const darkBg = await bg();
  await dash.locator('#seg-theme button[data-v="light"]').click();
  await waitFor(async () => (await dash.evaluate(() => document.documentElement.dataset.theme)) === "light", { message: "light forced" });
  const lightBg = await bg();
  assert.notEqual(darkBg, lightBg, "system dark differs from forced light");
  await dash.locator('#seg-theme button[data-v="dark"]').click();
  await waitFor(async () => (await h.storage()).settings.theme === "dark", { message: "theme saved" });
  await waitFor(async () => (await bg()) === darkBg, { message: "forced dark matches system dark" });
  const popup = await h.context.newPage();
  watch(popup);
  await popup.goto(h.url("popup.html"));
  await waitFor(async () => (await popup.evaluate(() => document.documentElement.dataset.theme)) === "dark", { message: "popup dark" });
  await h.setSettings({ theme: "system" });
  // Shortcuts are listed in settings (chrome.commands.getAll).
  await dash.reload();
  const cmds = await h.worker.evaluate(() => chrome.commands.getAll());
  assert.deepEqual(Object.fromEntries(cmds.filter((c) => c.name !== "_execute_action").map((c) => [c.name, c.shortcut])), { "toggle-panel": "Alt+Shift+M", "save-now": "Alt+Shift+S" });
  await waitFor(async () => /Alt\+Shift\+M/.test(await dash.locator("body").textContent()) && /Alt\+Shift\+S/.test(await dash.locator("body").textContent()), { message: "shortcuts listed" });
  await popup.close();
  await dash.close();
});

test("no runtime errors and no off-device network requests", async () => {
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(offDevice, []);
  const p = await h.context.newPage();
  await p.goto("chrome://extensions");
  const info = await p.evaluate(() => new Promise((r) => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, r)));
  await p.close();
  const me = info.find((i) => i.id === h.extensionId);
  assert.deepEqual(me.runtimeErrors, [], JSON.stringify(me.runtimeErrors));
  assert.deepEqual(me.manifestErrors, []);
});
