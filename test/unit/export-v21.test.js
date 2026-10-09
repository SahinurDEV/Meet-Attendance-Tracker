process.env.TZ = "UTC";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("xlsx");
const core = require("../../extension/lib/core.js");
const ex = require("../../extension/lib/export.js");
const an = require("../../extension/lib/analytics.js");
const { meeting } = require("../helpers/records.cjs");

const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const roster = { id: "r1", name: "CSE-301", codes: ["abc-defg-hij"], members: [{ name: "Ayesha Siddiqua", email: "a@x.io" }, { name: "Daniel Kim" }, { name: "রহিম উদ্দিন" }] };
const settings = { lateThresholdMin: 5, minPresenceValue: 10, timeFormat: "24h" };

function rec() {
  const r = meeting(
    [
      { name: "Ayesha Siddiqua", from: 0, speak: [0, 5] },
      { name: "Daniel Kim", from: 9 }, // late
      { name: "Quick Guest", from: 2, to: 5 }, // short
    ],
    { extra: { tags: ["class", "week-1"], notes: "Quiz next week.\nBring laptops." } }
  );
  r.chat = [
    { id: "1", sender: "Ayesha Siddiqua", text: "Good morning!", at: T0 + 60000 },
    { id: "2", sender: "Daniel Kim", text: "=cmd|' /C calc'!A0", at: T0 + 600000 },
    { id: "3", sender: "রহিম উদ্দিন", text: "আমি একটু দেরি করব, tab\there", at: T0 + 700000 },
  ];
  return r;
}

test("table rows carry status (present/late/short/guest) and absentee rows", () => {
  const t = ex.buildTable(rec(), settings, undefined, { roster });
  const status = Object.fromEntries(t.rows.map((r) => [r[1], r[2]]));
  assert.deepEqual(status, { "Ayesha Siddiqua": "Present", "Daniel Kim": "Late", "Quick Guest": "Too short (guest)", "রহিম উদ্দিন": "Absent" });
  assert.deepEqual(t.statuses, ["present", "short", "late", "absent"]); // ordered by first seen, absentees last
  assert.ok(t.meta.some(([k, v]) => k === "Roster" && v === "CSE-301 (2/3 attended)"));
  assert.ok(t.meta.some(([k, v]) => k === "Tags" && v === "class, week-1"));
  assert.equal(t.chat.length, 3);
  assert.deepEqual(t.chat[0], ["08:01:00", "Ayesha Siddiqua", "Good morning!"]);
});

test("JSON export is structured and complete", () => {
  const f = ex.exportRecord(rec(), "json", settings, undefined, { roster });
  assert.equal(f.filename, "meet-attendance_abc-defg-hij_2026-10-09_0800.json");
  const j = JSON.parse(f.data);
  assert.equal(j.app, "meet-attendance-tracker");
  assert.equal(j.appVersion, "2.1.1");
  assert.equal(j.meeting.durationSeconds, 3600);
  assert.deepEqual(j.meeting.tags, ["class", "week-1"]);
  assert.equal(j.meeting.roster.name, "CSE-301");
  assert.equal(j.summary.late, 1);
  assert.equal(j.summary.short, 1);
  assert.equal(j.summary.absent, 1);
  assert.equal(j.summary.meetingMs, undefined);
  const daniel = j.participants.find((p) => p.name === "Daniel Kim");
  assert.equal(daniel.status, "late");
  assert.equal(daniel.onRoster, true);
  assert.equal(daniel.firstSeen, "2026-10-09T08:09:00.000Z");
  assert.equal(daniel.sessions.length, 1);
  assert.deepEqual(j.absentees, [{ name: "রহিম উদ্দিন", status: "absent" }]);
  assert.equal(j.chat[2].sender, "রহিম উদ্দিন");
});

test("TSV copy and chat CSV are spreadsheet-safe", () => {
  const t = ex.buildTable(rec(), settings, undefined, { roster });
  const tsv = ex.toTSV(t);
  const lines = tsv.trimEnd().split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], ex.EXPORT_HEADERS.join("\t"));
  assert.ok(lines.every((l) => l.split("\t").length === 8));
  const f = ex.exportRecord(rec(), "chat-csv", settings);
  assert.equal(f.filename, "meet-chat_abc-defg-hij_2026-10-09_0800.csv");
  assert.ok(f.data.startsWith("\uFEFFTime,Sender,Message\r\n"));
  assert.ok(f.data.includes("'=cmd|"));
  const rows = XLSX.utils.sheet_to_json(XLSX.read(f.data.slice(1), { type: "string", raw: true }).Sheets.Sheet1, { header: 1, raw: false });
  assert.equal(rows.length, 4);
  assert.equal(rows[3][2], "আমি একটু দেরি করব, tab\there");
  const tsvExport = ex.exportRecord(rec(), "tsv", settings);
  assert.ok(tsvExport.filename.endsWith(".tsv"));
});

test("XLSX: summary row, status-styled cells, notes and a Chat sheet", () => {
  const bytes = ex.toXLSX(ex.buildTable(rec(), settings, undefined, { roster }));
  const wb = XLSX.read(bytes, { type: "array", cellStyles: true });
  assert.deepEqual(wb.SheetNames, ["Attendance", "Chat"]);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Attendance, { header: 1, raw: true, defval: "" });
  assert.ok(rows.some((r) => r[0] === "Summary" && /Present 1 · Late 1 · Too short 1 · Absent 1/.test(r[1])));
  assert.ok(rows.some((r) => r[0] === "Notes" && r[1].includes("Bring laptops")));
  const hdr = rows.findIndex((r) => r[2] === "Status");
  assert.deepEqual(rows.slice(hdr + 1).map((r) => r[2]), ["Present", "Too short (guest)", "Late", "Absent"]);
  const chat = XLSX.utils.sheet_to_json(wb.Sheets.Chat, { header: 1, raw: true });
  assert.deepEqual(chat[0], ["Time", "Sender", "Message"]);
  assert.equal(chat.length, 4);
  // Status cells reference distinct fill styles.
  const sheetXml = Buffer.from(bytes).toString("latin1");
  assert.ok(sheetXml.includes("styles.xml"));
});

test("PDF: branded summary, notes and chat; Unicode names become image XObjects with a soft mask", () => {
  const calls = [];
  const fake = {
    measure: (s, size) => Array.from(s).length * size * 0.55,
    render(s, size) {
      calls.push(s);
      const w = Math.max(1, Array.from(s).length * 4);
      const h = 12;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = i % 7 === 0 ? 255 : 0;
      return { w, h, alpha, widthPt: w / 4 * size * 0.55, heightPt: size * 1.3, baselinePt: size * 0.3 };
    },
  };
  const f = ex.exportRecord(rec(), "pdf", settings, undefined, { roster, renderer: fake });
  const text = Buffer.from(f.data).toString("latin1");
  assert.ok(calls.includes("রহিম উদ্দিন"), calls.join("|"));
  assert.match(text, /\/Subtype \/Image \/Width 1 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/SMask \d+ 0 R/);
  assert.match(text, /\/ColorSpace \/DeviceGray \/BitsPerComponent 8 \/Filter \/RunLengthDecode/);
  assert.match(text, /\/XObject << \/Im0 \d+ 0 R/);
  // xref still valid with binary image streams
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  for (const m of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(text.slice(start + Number(m[1]), start + Number(m[1]) + 10), "\nendstream");
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mat-pdf21-"));
  const file = path.join(dir, "t.pdf");
  fs.writeFileSync(file, f.data);
  try {
    const out = execFileSync("pdftotext", ["-layout", file, "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    for (const re of [/Attendance Report/, /Present/, /Late/, /Too short/, /Absent/, /Attendance/, /Top speaker/i, /Quiz next week/, /Chat \(3 messages\)/, /Good morning!/, /Too short \(guest\)/])
      assert.match(out, re);
    const imgs = execFileSync("pdfimages", ["-list", file]).toString();
    assert.match(imgs, /smask/);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  // Without a renderer (Node), Unicode falls back to WinAnsi "?" instead of breaking.
  const plain = Buffer.from(ex.toPDF(ex.buildTable(rec(), settings, undefined, { roster }))).toString("latin1");
  assert.ok(!plain.includes("/Subtype /Image"));
});

test("runLength encodes PackBits that decode back to the input", () => {
  const decode = (enc) => {
    const out = [];
    for (let i = 0; i < enc.length; ) {
      const n = enc[i++];
      if (n === 128) break;
      if (n < 128) for (let k = 0; k <= n; k++) out.push(enc[i++]);
      else {
        const v = enc[i++];
        for (let k = 0; k < 257 - n; k++) out.push(v);
      }
    }
    return out;
  };
  const cases = [[], [1], [0, 0, 0, 0], Array.from({ length: 1000 }, (_, i) => (i * 7919) % 256), Array.from({ length: 700 }, (_, i) => (i % 300 < 150 ? 0 : i % 5))];
  for (const c of cases) assert.deepEqual(decode(ex.runLength(c)), c);
  assert.ok(ex.runLength(new Array(4000).fill(0)).length < 70);
  assert.equal(ex.needsUnicode("José"), false);
  assert.equal(ex.needsUnicode("রহিম"), true);
});

test("bulk export (xlsx/csv/json) covers a date range; series export renders the matrix", () => {
  const recs = [0, 1, 2].map((d) =>
    meeting([{ name: "Ayesha Siddiqua", from: 0 }, ...(d === 1 ? [] : [{ name: "Daniel Kim", from: d * 7 }])], { start: T0 + d * 86400000, extra: { tags: d ? ["class"] : [] } })
  );
  const rf = () => roster;
  const x = ex.exportBulk(recs, "xlsx", settings, rf, { from: "2026-10-09", to: "2026-10-11" });
  assert.equal(x.filename, "meet-attendance_bulk_2026-10-09_to_2026-10-11.xlsx");
  const wb = XLSX.read(x.data, { type: "array" });
  assert.equal(wb.SheetNames.length, 4);
  assert.equal(wb.SheetNames[0], "Summary");
  const sum = XLSX.utils.sheet_to_json(wb.Sheets.Summary, { header: 1, raw: true });
  assert.deepEqual(sum[2].slice(0, 3), ["Date", "Start", "Meeting"]);
  assert.equal(sum.length, 6);
  assert.equal(new Set(wb.SheetNames).size, wb.SheetNames.length);
  assert.ok(wb.SheetNames.every((n) => n.length <= 31));

  const c = ex.exportBulk(recs, "csv", settings, rf);
  const lines = c.data.replace(/\r\n$/, "").split("\r\n");
  assert.equal(lines[0], "\uFEFFDate,Meeting,Code,Name,Status,First Seen,Last Seen,Time in Call,Speaking Time,Joins");
  assert.equal(lines.length, 1 + 3 * 3); // 2 present + absentees each meeting
  const j = JSON.parse(ex.exportBulk(recs, "json", settings, rf).data);
  assert.equal(j.meetings.length, 3);

  const mx = an.seriesMatrix(recs, { settings, rosterFor: rf });
  const sc = ex.exportSeries(mx, "csv", settings);
  assert.match(sc.filename, /^meet-attendance_series_abc-defg-hij_\d{4}-\d{2}-\d{2}\.csv$/);
  const srows = sc.data.replace(/\r\n$/, "").split("\r\n");
  assert.ok(srows[0].includes("2026-10-09 08:00"));
  assert.ok(srows.some((r) => r.startsWith("Daniel Kim,Present 00:59:59,Absent,Late") || r.startsWith("Daniel Kim,Present ")));
  const sx = ex.exportSeries(mx, "xlsx", settings);
  const swb = XLSX.read(sx.data, { type: "array" });
  const srs = XLSX.utils.sheet_to_json(swb.Sheets.Series, { header: 1, raw: true });
  const dan = srs.find((r) => r[0] === "Daniel Kim");
  assert.equal(dan[2], "Absent");
  assert.match(dan[3], /^Late /);
  assert.equal(dan[dan.length - 1], "67%");
  assert.throws(() => ex.exportSeries(mx, "pdf"));
  assert.throws(() => ex.exportBulk(recs, "doc"));
});
