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

const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const s = (sec) => T0 + sec * 1000;

function sampleRecord() {
  const t = new core.AttendanceTracker({ code: "abc-defg-hij", title: "Weekly sync", startedAt: s(0) }, { graceMs: 5000 });
  t.update([{ name: "Alice Smith (You)", isSelf: true, speaking: true }, { name: 'Bob "The Builder", Jr.' }], s(0));
  t.update([{ name: "Alice Smith", isSelf: true }, { name: 'Bob "The Builder", Jr.' }, { name: "=HYPERLINK(1)" }], s(90));
  t.update([{ name: "Alice Smith", isSelf: true }, { name: "José Ñúñez" }, { name: "=HYPERLINK(1)" }], s(91));
  t.update([{ name: "Alice Smith", isSelf: true }, { name: "José Ñúñez" }, { name: "রহিম উদ্দিন" }], s(100));
  t.finalize(s(3725));
  return t.toRecord(s(3725));
}

test("buildTable has the expected columns and respects settings", () => {
  const rec = sampleRecord();
  const table = ex.buildTable(rec, { timeFormat: "24h" });
  assert.deepEqual(table.headers, ["#", "Name", "First Seen", "Last Seen", "Time in Call", "Speaking Time", "Joins"]);
  assert.equal(table.rows.length, 5);
  const alice = table.rows.find((r) => r[1].startsWith("Alice"));
  assert.deepEqual(alice.slice(1), ["Alice Smith (You)", "08:00:00", "09:02:05", "01:02:05", "00:00:05", "1"]); // 90s sample gap capped at maxTickMs
  assert.ok(table.meta.some(([k, v]) => k === "Date" && v === "2026-10-09"));
  const t12 = ex.buildTable(rec, { timeFormat: "12h", ignoreSelf: true });
  assert.equal(t12.rows.length, 4);
  assert.ok(!t12.rows.some((r) => r[1].startsWith("Alice")));
  assert.equal(t12.rows[0][2], "8:00:00 AM");
});

test("CSV output is RFC-4180 quoted, BOM-prefixed and formula-safe", () => {
  const csv = ex.toCSV(ex.buildTable(sampleRecord()));
  assert.ok(csv.startsWith("\uFEFF#,Name,First Seen,Last Seen,Time in Call,Speaking Time,Joins\r\n"));
  assert.ok(csv.includes('"Bob ""The Builder"", Jr."'));
  assert.ok(csv.includes("'=HYPERLINK(1)"));
  assert.ok(csv.includes("রহিম উদ্দিন"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 6);
  // Round-trip through a real CSV parser.
  const wb = XLSX.read(csv.slice(1), { type: "string", raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  assert.equal(rows[0][1], "Name");
  assert.ok(rows.some((r) => r[1] === 'Bob "The Builder", Jr.'));
});

test("zip writer produces a valid archive (CRC + directory)", () => {
  assert.equal(ex.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const bytes = ex.zip([{ name: "a.txt", data: "hello" }, { name: "dir/b.txt", data: "world" }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mat-zip-"));
  const file = path.join(dir, "t.zip");
  fs.writeFileSync(file, bytes);
  try {
    const listing = execFileSync("unzip", ["-l", file]).toString();
    assert.match(listing, /a\.txt/);
    assert.match(listing, /dir\/b\.txt/);
    execFileSync("unzip", ["-t", file]);
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // unzip not installed; SheetJS test below still validates zip
  }
});

test("XLSX output opens in SheetJS with correct cells", () => {
  const rec = sampleRecord();
  const bytes = ex.toXLSX(ex.buildTable(rec));
  assert.equal(bytes[0], 0x50); // PK
  const wb = XLSX.read(bytes, { type: "array" });
  assert.deepEqual(wb.SheetNames, ["Attendance"]);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Attendance, { header: 1, raw: true, defval: "" });
  const headerIdx = rows.findIndex((r) => r[1] === "Name");
  assert.ok(headerIdx > 0);
  assert.deepEqual(rows[headerIdx], ["#", "Name", "First Seen", "Last Seen", "Time in Call", "Speaking Time", "Joins"]);
  const data = rows.slice(headerIdx + 1).filter((r) => r[1]);
  assert.equal(data.length, 5);
  assert.equal(data[0][0], 1); // numeric
  assert.ok(data.some((r) => r[1] === "রহিম উদ্দিন"));
  assert.ok(data.some((r) => r[1] === "=HYPERLINK(1)")); // stored as text, not a formula
  assert.ok(!Object.values(wb.Sheets.Attendance).some((c) => c && c.f));
  assert.ok(rows.some((r) => r[0] === "Date" && r[1] === "2026-10-09"));
});

test("PDF output is structurally valid and contains the table text", () => {
  const rec = sampleRecord();
  const bytes = ex.toPDF(ex.buildTable(rec), { generatedAt: s(4000) });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  // xref offsets must point at the right objects.
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(startxref).startsWith("xref"));
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  // Stream lengths are exact.
  for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(text.slice(start + Number(m[1]), start + Number(m[1]) + 10), "\nendstream");
  }
  assert.ok(text.includes("(Alice Smith \\(You\\)) Tj"));
  assert.ok(text.includes("(Jose Nunez) Tj") || text.includes("(Jos\xe9 \xd1\xfa\xf1ez) Tj"));
  assert.ok(text.includes("(01:02:05) Tj"));

  // If poppler is available, make sure a real PDF reader extracts the text.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mat-pdf-"));
  const file = path.join(dir, "t.pdf");
  fs.writeFileSync(file, bytes);
  try {
    const out = execFileSync("pdftotext", ["-layout", file, "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    assert.match(out, /Attendance Report/);
    assert.match(out, /Alice Smith \(You\)/);
    assert.match(out, /Bob "The Builder", Jr\./);
    assert.match(out, /01:02:05/);
    const info = execFileSync("pdfinfo", [file]).toString();
    assert.match(info, /Pages:\s+1/);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
});

test("PDF paginates long tables with the header on every page", () => {
  const t = new core.AttendanceTracker({ code: "big-meet-ing", startedAt: s(0) });
  t.update(Array.from({ length: 70 }, (_, i) => ({ name: `Participant Number ${i + 1}` })), s(0));
  t.finalize(s(600));
  const bytes = ex.toPDF(ex.buildTable(t.toRecord()));
  const text = Buffer.from(bytes).toString("latin1");
  const pages = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pages >= 3, `pages=${pages}`);
  assert.equal((text.match(/\(Time in Call\) Tj/g) || []).length, pages);
  assert.ok(text.includes(`(Page ${pages} of ${pages}) Tj`));
});

test("exportRecord names files with the meeting date", () => {
  const rec = sampleRecord();
  for (const fmt of ["csv", "xlsx", "pdf"]) {
    const f = ex.exportRecord(rec, fmt, {});
    assert.equal(f.filename, `meet-attendance_abc-defg-hij_2026-10-09_0800.${fmt}`);
    assert.ok(f.data.length > 100);
  }
  assert.throws(() => ex.exportRecord(rec, "doc"));
});

test("toWinAnsi keeps Latin-1, strips accents beyond it and replaces the rest", () => {
  assert.equal(ex.toWinAnsi("José"), "José");
  assert.equal(ex.toWinAnsi("Łukasz"), "?ukasz");
  assert.equal(ex.toWinAnsi("Ştefan"), "Stefan");
  assert.equal(ex.toWinAnsi("李"), "?");
});
