process.env.TZ = "UTC";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../extension/lib/core.js");
const { AttendanceTracker, computeRows, mergeSessions, sessionsDuration } = core;

const T0 = Date.UTC(2026, 9, 9, 8, 0, 0); // 2026-10-09 08:00:00 UTC
const s = (sec) => T0 + sec * 1000;
const p = (name, extra = {}) => ({ name, ...extra });
const row = (rows, name) => rows.find((r) => r.name === name);

test("normalizeName strips Meet suffixes, whitespace and doubled labels", () => {
  assert.equal(core.normalizeName("  Jane   Doe (You) "), "Jane Doe");
  assert.equal(core.normalizeName("Jane Doe (Host)"), "Jane Doe");
  assert.equal(core.normalizeName("Jane Doe\nMeeting host"), "Jane Doe");
  assert.equal(core.normalizeName("Jane Doe (Presentation)"), "Jane Doe");
  assert.equal(core.normalizeName("Mix Gamer BDMix Gamer BD"), "Mix Gamer BD");
  assert.equal(core.normalizeName("রহিম উদ্দিন"), "রহিম উদ্দিন");
  assert.equal(core.normalizeName(null), "");
});

test("isLikelyName rejects Meet UI labels and icon ligatures", () => {
  for (const bad of ["You", "Backgrounds and effects", "more_vert", "mic_off", "Turn on captions", "Pin to screen", "42", "Admit all"]) {
    assert.equal(core.isLikelyName(bad), false, bad);
  }
  for (const good of ["Jane Doe", "Ana María", "李雷", "Sahinur Islam", "O'Neil"]) {
    assert.equal(core.isLikelyName(good), true, good);
  }
  assert.equal(core.isSelfLabel("Jane (You)"), true);
  assert.equal(core.isSelfLabel("Jane"), false);
});

test("mergeSessions merges overlaps and adjacent sessions within gap", () => {
  const merged = mergeSessions(
    [
      { start: 50, end: 60 },
      { start: 0, end: 10 },
      { start: 5, end: 20 },
      { start: 22, end: 30 },
    ],
    2
  );
  assert.deepEqual(merged, [
    { start: 0, end: 30 },
    { start: 50, end: 60 },
  ]);
  assert.deepEqual(mergeSessions([{ start: 0, end: 10 }, { start: 5, end: null }]), [{ start: 0, end: null }]);
  assert.equal(sessionsDuration([{ start: 0, end: 10 }, { start: 20, end: null }], 25), 15);
});

test("tracks first seen, last seen and time in call for a simple meeting", () => {
  const t = new AttendanceTracker({ code: "abc-defg-hij", startedAt: s(0) }, { graceMs: 5000 });
  t.update([p("Alice"), p("Bob")], s(0));
  t.update([p("Alice"), p("Bob")], s(60));
  t.update([p("Alice")], s(61)); // Bob disappears
  t.update([p("Alice")], s(70)); // > grace → leave recorded at last seen (60s)
  t.finalize(s(120));
  const rows = computeRows(t.toRecord(s(120)));
  assert.equal(row(rows, "Alice").timeInCallMs, 120000);
  assert.equal(row(rows, "Alice").lastSeen, s(120));
  assert.equal(row(rows, "Bob").firstSeen, s(0));
  assert.equal(row(rows, "Bob").lastSeen, s(60));
  assert.equal(row(rows, "Bob").timeInCallMs, 60000);
  assert.equal(row(rows, "Bob").joins, 1);
});

test("short absences inside the grace window are merged into one session", () => {
  const t = new AttendanceTracker({ code: "abc-defg-hij", startedAt: s(0) }, { graceMs: 10000 });
  t.update([p("Alice")], s(0));
  t.update([], s(3)); // DOM flicker
  const ev = t.update([p("Alice")], s(6));
  assert.deepEqual(ev.rejoined, []);
  t.finalize(s(30));
  const r = row(computeRows(t.toRecord()), "Alice");
  assert.equal(r.joins, 1);
  assert.equal(r.timeInCallMs, 30000);
});

test("leave + rejoin creates a second session and excludes the gap", () => {
  const t = new AttendanceTracker({ code: "abc-defg-hij", startedAt: s(0) }, { graceMs: 5000 });
  t.update([p("Alice"), p("Bob")], s(0));
  t.update([p("Alice"), p("Bob")], s(20));
  const ev1 = t.update([p("Alice")], s(21));
  assert.deepEqual(ev1.left, []);
  const ev2 = t.update([p("Alice")], s(26));
  assert.deepEqual(ev2.left, ["Bob"]);
  const ev3 = t.update([p("Alice"), p("Bob")], s(40));
  assert.deepEqual(ev3.rejoined, ["Bob"]);
  t.finalize(s(50));
  const bob = row(computeRows(t.toRecord()), "Bob");
  assert.equal(bob.joins, 2);
  assert.equal(bob.timeInCallMs, 20000 + 10000);
  assert.equal(bob.firstSeen, s(0));
  assert.equal(bob.lastSeen, s(50));
});

test("names from different strategies / suffixes map to the same person", () => {
  const t = new AttendanceTracker({ code: "x", startedAt: s(0) });
  t.update([p("Jane Doe (You)", { isSelf: true }), p("jane doe")], s(0));
  t.update([p("Jane Doe")], s(5));
  const rows = computeRows(t.toRecord(s(5)), s(5));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isSelf, true);
});

test("speaking time accumulates with sample-and-hold and caps big gaps", () => {
  const t = new AttendanceTracker({ code: "x", startedAt: s(0) }, { maxTickMs: 5000, graceMs: 60000 });
  t.update([p("Alice", { speaking: true }), p("Bob")], s(0));
  t.update([p("Alice", { speaking: true }), p("Bob")], s(1));
  t.update([p("Alice", { speaking: true }), p("Bob", { speaking: true })], s(2));
  t.update([p("Alice"), p("Bob", { speaking: true })], s(3)); // Alice spoke 0→3
  t.update([p("Alice"), p("Bob")], s(4)); // Bob spoke 2→4
  t.update([p("Alice", { speaking: true }), p("Bob")], s(10));
  t.update([p("Alice"), p("Bob")], s(30)); // 20s gap (throttled tab) capped to 5s
  t.finalize(s(31));
  const rows = computeRows(t.toRecord());
  assert.equal(row(rows, "Alice").speakingMs, 3000 + 5000);
  assert.equal(row(rows, "Bob").speakingMs, 2000);
});

test("live rows include in-progress speaking and open sessions", () => {
  const t = new AttendanceTracker({ code: "x", startedAt: s(0) });
  t.update([p("Alice", { speaking: true })], s(0));
  const rows = computeRows(t.toRecord(s(4)), s(4));
  assert.equal(rows[0].present, true);
  assert.equal(rows[0].speaking, true);
  assert.equal(rows[0].speakingMs, 4000);
  assert.equal(rows[0].timeInCallMs, 4000);
});

test("speaking stops when a participant disappears", () => {
  const t = new AttendanceTracker({ code: "x", startedAt: s(0) }, { graceMs: 2000 });
  t.update([p("Alice", { speaking: true })], s(0));
  t.update([], s(2));
  t.update([], s(10));
  t.finalize(s(20));
  const r = computeRows(t.toRecord())[0];
  assert.equal(r.speakingMs, 2000);
  assert.equal(r.timeInCallMs, 0);
});

test("finalize closes open sessions; records survive a JSON round trip and resume", () => {
  const t = new AttendanceTracker({ code: "abc-defg-hij", startedAt: s(0) }, { graceMs: 5000 });
  t.update([p("Alice"), p("Bob")], s(0));
  t.update([p("Alice"), p("Bob")], s(30));
  const stored = JSON.parse(JSON.stringify(t.toRecord(s(30))));
  // Page reloads; tracker resumes at 33s and sees Alice only.
  const t2 = AttendanceTracker.fromRecord(stored, { graceMs: 5000 }, s(33));
  t2.update([p("Alice")], s(34));
  t2.update([p("Alice")], s(40)); // Bob missing since 30s → left at 30s
  t2.finalize(s(60));
  const rec = t2.toRecord();
  assert.equal(rec.id, t.meta.id);
  assert.equal(rec.endedAt, s(60));
  const rows = computeRows(rec);
  assert.equal(row(rows, "Alice").timeInCallMs, 60000);
  assert.equal(row(rows, "Bob").timeInCallMs, 30000);
  assert.ok(rows.every((r) => !r.present));
  // No updates after the meeting ended.
  assert.deepEqual(t2.update([p("Carol")], s(70)).joined, []);
});

test("closeRecord closes a live record without touching the original", () => {
  const t = new AttendanceTracker({ code: "x", startedAt: s(0) });
  t.update([p("Alice", { speaking: true })], s(0));
  const live = t.toRecord(s(10));
  const closed = core.closeRecord(live, s(10));
  assert.equal(live.endedAt, null);
  assert.equal(closed.endedAt, s(10));
  const r = computeRows(closed)[0];
  assert.equal(r.timeInCallMs, 10000);
  assert.equal(r.speakingMs, 10000);
  assert.equal(r.present, false);
});

test("filterRows hides self by flag or configured name", () => {
  const rows = [
    { key: "me", name: "Me", isSelf: true },
    { key: "jane doe", name: "Jane Doe", isSelf: false },
    { key: "bob", name: "Bob", isSelf: false },
  ];
  assert.equal(core.filterRows(rows, { ignoreSelf: false }).length, 3);
  assert.deepEqual(core.filterRows(rows, { ignoreSelf: true }).map((r) => r.name), ["Jane Doe", "Bob"]);
  assert.deepEqual(core.filterRows(rows, { ignoreSelf: true, selfName: "jane  doe" }).map((r) => r.name), ["Bob"]);
});

test("formatting helpers", () => {
  assert.equal(core.formatClock(3725000), "01:02:05");
  assert.equal(core.formatDuration(3725000), "1h 02m");
  assert.equal(core.formatDuration(65000), "1m 05s");
  assert.equal(core.formatDuration(9000), "9s");
  const t = Date.UTC(2026, 9, 9, 14, 5, 9);
  assert.equal(core.formatTime(t, "24h"), "14:05:09");
  assert.equal(core.formatTime(t, "12h"), "2:05:09 PM");
  assert.equal(core.formatTime(Date.UTC(2026, 9, 9, 0, 1, 0), "12h", false), "12:01 AM");
  assert.equal(core.formatDate(t), "2026-10-09");
  assert.equal(core.exportFileName({ code: "abc-defg-hij", startedAt: t }, "csv"), "meet-attendance_abc-defg-hij_2026-10-09_1405.csv");
  assert.equal(core.meetingCodeFromUrl("https://meet.google.com/abc-defg-hij?authuser=0"), "abc-defg-hij");
  assert.equal(core.meetingCodeFromUrl("https://meet.google.com/landing"), null);
  assert.equal(core.makeMeetingId("abc-defg-hij", t), "abc-defg-hij_20261009T140509");
});
