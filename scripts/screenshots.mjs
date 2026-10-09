// Capture marketing/README screenshots with the real extension loaded.
// Output: docs/screenshots/*.png (and a copy in $SHOTS_DIR if set).
import { launch, sleep, waitFor, lives, ROOT } from "../test/helpers/harness.mjs";
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { demoMeetings } = require("./demo-data.cjs");
const ex = require("../extension/lib/export.js");

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
await h.setSettings({ leaveGraceSec: 3 });
const demo = demoMeetings();
await h.worker.evaluate(async (list) => {
  const obj = {};
  for (const m of list) obj["m:" + m.id] = m;
  await chrome.storage.local.set(obj);
}, demo);

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
await sleep(600);
await shot(meet, "meet-panel.png");

// 2) Popup (rendered in a tab at popup size) while the call is live.
await waitFor(async () => lives(await h.storage()).length > 0, { message: "live" });
const popup = await h.context.newPage();
await popup.setViewportSize({ width: 370, height: 720 });
await popup.goto(h.url("popup.html"));
await sleep(1200);
await shot(popup, "popup.png", { fullPage: true });

// 3) Dashboard list, detail and settings.
const dash = await h.context.newPage();
await dash.goto(h.url("dashboard.html#/meetings"));
await dash.waitForSelector("#meetingTable tbody tr");
await sleep(500);
await shot(dash, "dashboard.png");
await dash.goto(h.url(`dashboard.html#/meeting/${encodeURIComponent(demo[0].id)}`));
await dash.waitForSelector("#participantsTable");
await sleep(400);
await shot(dash, "meeting-detail.png");
await h.setSettings({ leaveGraceSec: 10 }); // show defaults in the settings shot
await dash.goto(h.url("dashboard.html#/settings"));
await sleep(500);
await shot(dash, "settings.png");

// 4) PDF export rendered to an image (if poppler is available).
const pdfFile = ex.exportRecord(demo[0], "pdf", { timeFormat: "24h" });
const tmpPdf = path.join(OUT, "_sample.pdf");
writeFileSync(tmpPdf, pdfFile.data);
try {
  execFileSync("pdftoppm", ["-png", "-r", "110", "-singlefile", tmpPdf, path.join(OUT, "export-pdf")]);
  console.log("saved", path.join(OUT, "export-pdf.png"));
} catch (e) {
  console.warn("pdftoppm not available; skipping export-pdf.png");
}
execFileSync("rm", ["-f", tmpPdf]);

// 5) Landing page (desktop + mobile).
const landing = await h.context.newPage();
await landing.goto(pathToFileURL(path.join(ROOT, "docs/index.html")).href);
await sleep(800);
await shot(landing, "landing.png");
await landing.setViewportSize({ width: 390, height: 844 });
await sleep(300);
await shot(landing, "landing-mobile.png");

await h.close();
if (COPY) for (const f of readdirSync(OUT)) if (f.endsWith(".png")) copyFileSync(path.join(OUT, f), path.join(COPY, f));
console.log("done");
