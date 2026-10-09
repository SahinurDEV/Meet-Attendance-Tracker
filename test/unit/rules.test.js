process.env.TZ = "UTC";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../extension/lib/core.js");
const rules = require("../../extension/lib/rules.js");
const detect = require("../../extension/lib/detect.js");

const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const m = (min) => T0 + min * 60000;

/** people: [{name, from, to, self}] in minutes */
function meeting(people, endMin = 60, code = "abc-defg-hij", start = T0) {
  const t = new core.AttendanceTracker({ code, title: "Class", startedAt: start }, { graceMs: 1000 });
  const at = (min) => start + min * 60000;
  const times = new Set([0, endMin]);
  people.forEach((p) => (times.add(p.from), times.add(p.to ?? endMin)));
  for (const min of [...times].sort((a, b) => a - b)) {
    const snap = people.filter((p) => p.from <= min && min < (p.to ?? endMin + 1)).map((p) => ({ name: p.name, isSelf: !!p.self }));
    t.update(snap, at(min));
  }
  t.finalize(at(endMin));
  return t.toRecord(at(endMin));
}

test("parseCSV handles quotes, embedded newlines and auto-detects delimiters", () => {
  assert.deepEqual(rules.parseCSV('a,b\n"x, y","He said ""hi"""\n'), [["a", "b"], ["x, y", 'He said "hi"']]);
  assert.deepEqual(rules.parseCSV("name;email\r\nA;a@x.io"), [["name", "email"], ["A", "a@x.io"]]);
  assert.deepEqual(rules.parseCSV("name\temail\nA\ta@x.io"), [["name", "email"], ["A", "a@x.io"]]);
  assert.deepEqual(rules.parseCSV('"multi\nline",z'), [["multi\nline", "z"]]);
  assert.deepEqual(rules.parseCSV("\uFEFFonly"), [["only"]]);
});

test("parseRosterText: pasted lists, CSV headers, first/last columns, aliases, dedupe", () => {
  const pasted = rules.parseRosterText("Ayesha Siddiqua\n  Daniel Kim  \n\nayesha siddiqua\nরহিম উদ্দিন, rahim@uni.edu\n");
  assert.deepEqual(pasted.map((p) => p.name), ["Ayesha Siddiqua", "Daniel Kim", "রহিম উদ্দিন"]);
  assert.equal(pasted[2].email, "rahim@uni.edu");

  const csv = rules.parseRosterText("Roll,First Name,Last Name,Email,Alias\n1,Ayesha,Siddiqua,AYESHA@x.io,Ayu|Ayesha S\n2,,,dan.kim@x.io,\n");
  assert.equal(csv.length, 2);
  assert.deepEqual(csv[0], { name: "Ayesha Siddiqua", email: "ayesha@x.io", ref: "1", aliases: ["Ayu", "Ayesha S"] });
  assert.equal(csv[1].name, "dan kim"); // derived from the email

  const named = rules.parseRosterText("Student Name,Email\nMd. Rahim Uddin,r@x.io");
  assert.deepEqual(named, [{ name: "Md. Rahim Uddin", email: "r@x.io" }]);
});

test("matchRoster: exact, alias, reordered, honorific and subset matches; no ambiguous matches", () => {
  const rows = [
    { key: "a", name: "Rahim Uddin" },
    { key: "b", name: "Siddiqua Ayesha" },
    { key: "c", name: "Kim" },
    { key: "d", name: "John Smith" },
    { key: "e", name: "John Smith Jr" },
    { key: "f", name: "Nusrat Jahan Khan" },
  ];
  const members = [
    { name: "Md. Rahim Uddin" }, // honorific dropped → token equality
    { name: "Ayesha Siddiqua" }, // reordered
    { name: "Daniel Kim", aliases: ["Kim"] }, // alias
    { name: "John" }, // single token – too weak, ambiguous
    { name: "Nusrat Jahan" }, // subset of 3-token name
    { name: "Nobody Here" },
  ];
  const res = rules.matchRoster(members, rows);
  assert.equal(res.get(0), "a");
  assert.equal(res.get(1), "b");
  assert.equal(res.get(2), "c");
  assert.equal(res.has(3), false);
  assert.equal(res.get(4), "f");
  assert.equal(res.has(5), false);
  assert.deepEqual(rules.nameTokens("Dr. Mohammad  Ali"), ["ali"]);
});

test("evaluateAttendance: present, late, absent and guests against a roster", () => {
  const rec = meeting([
    { name: "Teacher", from: 0, self: true },
    { name: "Ayesha Siddiqua", from: 0 },
    { name: "Daniel Kim", from: 12 }, // late
    { name: "Visitor", from: 1 },
  ]);
  const roster = { id: "r1", name: "CSE", members: [{ name: "Ayesha Siddiqua" }, { name: "Daniel Kim" }, { name: "Rahim Uddin" }] };
  const ev = rules.evaluateAttendance(rec, { settings: { lateThresholdMin: 5, ignoreSelf: true }, roster });
  const by = Object.fromEntries(ev.rows.map((r) => [r.name, r]));
  assert.equal(by["Ayesha Siddiqua"].status, "present");
  assert.equal(by["Daniel Kim"].status, "late");
  assert.equal(by["Visitor"].onRoster, false);
  assert.equal(by["Teacher"], undefined); // ignoreSelf
  const withSelf = rules.evaluateAttendance(rec, { settings: { lateThresholdMin: 5 }, roster });
  const me = withSelf.rows.find((r) => r.isSelf);
  assert.equal(me.onRoster, null); // the organiser is never a "guest"
  assert.equal(rules.statusLabel(me), "Present");
  assert.equal(withSelf.summary.guests, 1);
  assert.deepEqual(ev.absentees.map((a) => a.name), ["Rahim Uddin"]);
  assert.equal(ev.summary.expected, 3);
  assert.equal(ev.summary.absent, 1);
  assert.equal(ev.summary.late, 1);
  assert.equal(ev.summary.guests, 1);
  assert.equal(Math.round(ev.summary.attendanceRate * 100), 67);
  assert.equal(rules.statusLabel(by["Visitor"]), "Present (guest)");
  assert.equal(rules.statusLabel(by["Daniel Kim"]), "Late");

  // Threshold 0 disables "late"; no roster → no absentees, expected null.
  const ev0 = rules.evaluateAttendance(rec, { settings: { lateThresholdMin: 0 } });
  assert.ok(ev0.rows.every((r) => r.status === "present"));
  assert.equal(ev0.summary.expected, null);
  assert.equal(ev0.absentees.length, 0);
});

test("minimum time in call rule (minutes and percent), only for people no longer in the call", () => {
  const rec = meeting([
    { name: "Long Stayer", from: 0 },
    { name: "Quick Visit", from: 10, to: 14 }, // 4 min
    { name: "Half Time", from: 30 }, // 30 min
  ]);
  const byMin = rules.evaluateAttendance(rec, { settings: { minPresenceMode: "minutes", minPresenceValue: 5 } });
  const st = (ev) => Object.fromEntries(ev.rows.map((r) => [r.name, r.status]));
  assert.deepEqual(st(byMin), { "Long Stayer": "present", "Quick Visit": "short", "Half Time": "present" });
  const byPct = rules.evaluateAttendance(rec, { settings: { minPresenceMode: "percent", minPresenceValue: 75 } });
  assert.deepEqual(st(byPct), { "Long Stayer": "present", "Quick Visit": "short", "Half Time": "short" });
  assert.equal(byPct.summary.short, 2);
  assert.equal(rules.minPresenceMs({ minPresenceMode: "percent", minPresenceValue: 50 }, 3600000), 1800000);
  assert.equal(rules.minPresenceMs({ minPresenceValue: 0 }, 3600000), 0);
  // Short beats late: someone late AND short is "short".
  const both = rules.evaluateAttendance(rec, { settings: { lateThresholdMin: 5, minPresenceValue: 5 } });
  assert.equal(st(both)["Quick Visit"], "short");
  assert.equal(st(both)["Half Time"], "late");

  // A live participant below the minimum is not flagged yet.
  const t = new core.AttendanceTracker({ code: "x", startedAt: T0 });
  t.update([{ name: "Just Joined" }], m(0));
  const live = rules.evaluateAttendance(t.toRecord(m(1)), { settings: { minPresenceValue: 5 }, now: m(1) });
  assert.equal(live.rows[0].status, "present");
});

test("summary stats: averages, total speaking and top speaker", () => {
  const t = new core.AttendanceTracker({ code: "x", startedAt: T0 }, { maxTickMs: 60000 });
  t.update([{ name: "A", speaking: true }, { name: "B" }], T0);
  t.update([{ name: "A", speaking: true }, { name: "B", speaking: true }], T0 + 30000);
  t.update([{ name: "A" }, { name: "B" }], T0 + 40000);
  t.finalize(T0 + 60000);
  const ev = rules.evaluateAttendance(t.toRecord());
  assert.equal(ev.summary.topSpeaker.name, "A");
  assert.equal(ev.summary.topSpeaker.speakingMs, 40000);
  assert.equal(ev.summary.totalSpeakingMs, 50000);
  assert.equal(ev.summary.avgTimeInCallMs, 60000);
});

test("chat: addChat de-duplicates, sorts, survives a record round trip", () => {
  const t = new core.AttendanceTracker({ code: "x", startedAt: T0 });
  assert.equal(t.addChat([{ id: "1", sender: "Ayesha Siddiqua", text: "Hello!", time: m(2) }, { sender: "Daniel Kim", text: "Hi", timeLabel: "8:01 AM", time: m(1) }], m(3)), 2);
  assert.equal(t.addChat([{ id: "1", sender: "Ayesha Siddiqua", text: "Hello!", time: m(2) }, { sender: "Daniel Kim", text: "Hi", timeLabel: "8:01 AM" }, { sender: "x", text: "   " }], m(4)), 0);
  assert.equal(t.addChat([{ sender: "Daniel Kim", text: "Hi", timeLabel: "8:05 AM", time: m(5) }]), 1); // same text, new minute
  const rec = JSON.parse(JSON.stringify(t.toRecord(m(6))));
  assert.deepEqual(rec.chat.map((c) => c.text), ["Hi", "Hello!", "Hi"]);
  assert.deepEqual(rec.chat.map((c) => c.at), [m(1), m(2), m(5)]);
  const back = core.AttendanceTracker.fromRecord(rec, m(7));
  assert.equal(back.chat.length, 3);
  assert.equal(back.addChat([{ id: "1", sender: "Ayesha Siddiqua", text: "Hello!" }]), 0);
});

test("parseClockLabel: 12h/24h labels, midnight wrap, junk", () => {
  const ref = Date.UTC(2026, 9, 9, 14, 30);
  assert.equal(detect.parseClockLabel("2:05 PM", ref), Date.UTC(2026, 9, 9, 14, 5));
  assert.equal(detect.parseClockLabel("14:05", ref), Date.UTC(2026, 9, 9, 14, 5));
  assert.equal(detect.parseClockLabel("12:10 a.m.", ref), Date.UTC(2026, 9, 9, 0, 10));
  assert.equal(detect.parseClockLabel("11:50 PM", Date.UTC(2026, 9, 10, 0, 5)), Date.UTC(2026, 9, 9, 23, 50));
  assert.equal(detect.parseClockLabel("soon", ref), null);
  assert.equal(detect.parseClockLabel("25:99", ref), null);
});

