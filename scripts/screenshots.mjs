// Capture marketing/README screenshots with the real extension loaded.
// Output: docs/screenshots/*.png (and a copy in $SHOTS_DIR if set).
import { launch, sleep, waitFor, lives, ROOT } from "../test/helpers/harness.mjs";
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { demoMeetings, ROSTERS } = require("./demo-data.cjs");

const OUT = path.join(ROOT, "docs/screenshots");
const COPY = process.env.SHOTS_DIR || "";
mkdirSync(OUT, { recursive: true });
if (COPY) mkdirSync(COPY, { recursive: true });
const shot = async (page, name, opts = {}) => {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, ...opts });
  console.log("saved", file);
};

const h = await launch({ viewport: { width: 1440, height: 900 } });
await h.setSettings({ leaveGraceSec: 3, lateThresholdMin: 5, minPresenceMode: "minutes", minPresenceValue: 10, notifyJoinLeave: true });
const demo = demoMeetings();
await h.worker.evaluate(async ({ list, rosters }) => {
  const obj = {};
  for (const m of list) obj["m:" + m.id] = m;
  for (const r of rosters) obj["roster:" + r.id] = Object.assign({ updatedAt: Date.now() }, r);
  await chrome.storage.local.set(obj);
}, { list: demo, rosters: ROSTERS });
const lecture = demo.find((m) => m.code === "lec-ture-one");
const sync = demo[0];

// 1) In-Meet panel on the mock Meet page. To make the shot look like a call
// that has been running for a while, we pre-seed the tab's resume state
// (the same sessionStorage snapshot the extension writes before a reload).
const core = require("../extension/lib/core.js");
const startedAt = Date.now() - 38 * 60000;
const tr = new core.AttendanceTracker({ code: "kfp-wnzq-rta", title: "Weekly Product Sync", url: "https://meet.google.com/kfp-wnzq-rta", startedAt }, { graceMs: 10000 });
const cast = [
  ["Sahinur Rahman", 0, null, 0.3, true], ["Ayesha Siddiqua", 40, null, 0.2], ["Daniel Kim", 95, null, 0.15],
  ["Lucas Oliveira", 140, null, 0.08], ["Tanvir Hasan", 200, 26 * 60, 0.05], ["Fatima Zahra", 330, null, 0.04],
  ["Kenji Watanabe", 610, null, 0.03], ["Emily Carter", 900, null, 0.02],
];
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
for (let t = 0; t <= 38 * 60 - 2; t += 5) {
  tr.update(cast.filter(([, j, l]) => t >= j && (l == null || t < l)).map(([name, , , talk, self]) => ({ name, isSelf: !!self, speaking: rnd() < talk })), startedAt + t * 1000);
}
const seeded = tr.toRecord(Date.now() - 1000);
const meet = await h.context.newPage();
await meet.addInitScript((state) => {
  if (!sessionStorage.getItem("mat:seeded")) {
    sessionStorage.setItem("mat:seeded", "1");
    sessionStorage.setItem("mat:state", JSON.stringify(state));
  }
}, { record: seeded, persisted: true });
await meet.goto("https://meet.google.com/kfp-wnzq-rta");
await meet.evaluate(() => {
  mockMeet.join("Lucas Oliveira");
  mockMeet.join("Fatima Zahra", { tile: false });
  mockMeet.join("Kenji Watanabe");
  mockMeet.join("Emily Carter");
});
await sleep(1500);
await meet.evaluate(() => mockMeet.speak("Ayesha Siddiqua", true));
await sleep(3000);
await meet.evaluate(() => { mockMeet.speak("Ayesha Siddiqua", false); mockMeet.speak("Daniel Kim", true); });
await sleep(2000);
await meet.evaluate(() => { mockMeet.speak("Daniel Kim", false); mockMeet.speak("Lucas Oliveira", true); mockMeet.leave("Emily Carter"); });
await sleep(4500);
await meet.locator("#mat-attendance-host .fab").click();
await meet.evaluate(() => mockMeet.join("Priya Natarajan"));
await sleep(900);
await shot(meet, "meet-panel.png");

// 2) Popup (rendered in a tab at popup size) while the call is live.
await waitFor(async () => lives(await h.storage()).length > 0, { message: "live" });
const popup = await h.context.newPage();
await popup.setViewportSize({ width: 370, height: 720 });
await popup.goto(h.url("popup.html"));
await sleep(1200);
await shot(popup, "popup.png", { fullPage: true });

// Dark-mode panel (same call, theme forced dark).
await h.setSettings({ theme: "dark" });
await sleep(1200);
await shot(meet, "dark-meet-panel.png");
await h.setSettings({ theme: "system" });

// 3) Dashboard: list, detail, analytics, person, series, rosters, settings.
const dash = await h.context.newPage();
const go = async (hash, sel, name, opts) => {
  await dash.goto(h.url("dashboard.html" + hash));
  await dash.waitForSelector(sel);
  await sleep(500);
  await shot(dash, name, opts);
};
await go("#/meetings", "#meetingTable tbody tr", "dashboard.png");
await go(`#/meeting/${encodeURIComponent(lecture.id)}`, "#participantsTable", "meeting-detail.png");
await go(`#/meeting/${encodeURIComponent(lecture.id)}`, "#participantsTable", "meeting-detail-full.png", { fullPage: true });
await go("#/analytics", "#chartAttendance svg", "analytics.png");
await go("#/analytics", "#chartAttendance svg", "analytics-full.png", { fullPage: true });
await go(`#/person/${encodeURIComponent("রহিম উদ্দিন")}`, "#personTrend svg", "person.png");
await go("#/series", "#seriesTable", "series-list.png");
await go("#/series/lec-ture-one", "#seriesMatrix", "series.png");
await go("#/rosters", ".roster-card", "rosters.png");
await go("#/roster/rdemo-cse301", "#rosterMembers", "roster-editor.png");
await h.setSettings({ leaveGraceSec: 10 }); // show defaults in the settings shot
await go("#/settings", "#seg-theme", "settings.png");
await go("#/settings", "#seg-theme", "settings-full.png", { fullPage: true });

// Dark mode (forced via settings; "system" follows the OS).
await h.setSettings({ theme: "dark" });
await go("#/meetings", "#meetingTable tbody tr", "dark-dashboard.png");
await go("#/analytics", "#chartAttendance svg", "dark-analytics.png");
await go(`#/meeting/${encodeURIComponent(sync.id)}`, "#participantsTable", "dark-meeting-detail.png");
await h.setSettings({ theme: "system" });

// 4) PDF export (generated in the extension page so Bengali names use the
// browser's text shaping), rendered to an image if poppler is available.
for (const [rec, name] of [[lecture, "export-pdf"], [sync, "export-pdf-team"]]) {
  await dash.goto(h.url("dashboard.html#/meetings"));
  await dash.waitForSelector("#meetingTable");
  const bytes = await dash.evaluate(async (id) => {
    const M = globalThis.MAT;
    const rec = await M.getMeeting(id);
    const roster = M.pickRoster(rec, await M.listRosters());
    const f = M.exportRecord(rec, "pdf", await M.getSettings(), undefined, { roster, renderer: M.createTextRenderer() });
    return Array.from(f.data);
  }, rec.id);
  const tmpPdf = path.join(OUT, `_${name}.pdf`);
  writeFileSync(tmpPdf, Buffer.from(bytes));
  try {
    execFileSync("pdftoppm", ["-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", tmpPdf, path.join(OUT, name)]);
    console.log("saved", path.join(OUT, name + ".png"));
  } catch (e) {
    console.warn("pdftoppm not available; skipping", name);
  }
  if (process.env.KEEP_PDF) copyFileSync(tmpPdf, path.join(process.env.KEEP_PDF, `${name}.pdf`));
  execFileSync("rm", ["-f", tmpPdf]);
}

// 5) Landing page (desktop + mobile).
const landing = await h.context.newPage();
await landing.goto(pathToFileURL(path.join(ROOT, "docs/index.html")).href);
await sleep(800);
await shot(landing, "landing.png");
await shot(landing, "landing-full.png", { fullPage: true });
await landing.setViewportSize({ width: 390, height: 844 });
await sleep(300);
await shot(landing, "landing-mobile.png");

await h.close();
if (COPY) for (const f of readdirSync(OUT)) if (f.endsWith(".png")) copyFileSync(path.join(OUT, f), path.join(COPY, f));
console.log("done");
