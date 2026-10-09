process.env.TZ = "UTC";
const test = require("node:test");
const assert = require("node:assert/strict");
const an = require("../../extension/lib/analytics.js");
const charts = require("../../extension/lib/charts.js");
const { meeting } = require("../helpers/records.cjs");

const DAY = 86400000;
const D0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const roster = { id: "r1", name: "CSE-301", codes: ["cse-abcd-301"], members: [{ name: "Ayesha Siddiqua" }, { name: "Daniel Kim" }, { name: "Rahim Uddin" }] };
const rosterFor = (r) => (r.code === "cse-abcd-301" ? roster : null);

function dataset() {
  const cls = (day, people, tags) => meeting(people, { code: "cse-abcd-301", title: "CSE-301", start: D0 + day * DAY, extra: { tags } });
  return [
    cls(0, [{ name: "Ayesha Siddiqua", from: 0, speak: [0, 10] }, { name: "Daniel Kim", from: 0 }, { name: "Rahim Uddin", from: 0, speak: [20, 25] }], ["class"]),
    cls(2, [{ name: "Ayesha Siddiqua", from: 0, speak: [0, 4] }, { name: "Daniel Kim", from: 15 }], ["class", "lab"]), // Daniel late, Rahim absent
    cls(4, [{ name: "Ayesha Siddiqua", from: 0 }, { name: "Md. Rahim Uddin", from: 0 }, { name: "Guest Speaker", from: 5, speak: [5, 35] }], ["class"]), // Daniel absent
    meeting([{ name: "Ayesha Siddiqua", from: 0 }, { name: "Zoe Park", from: 0, speak: [0, 3] }], { code: "xyz-pqrs-tuv", title: "Club", start: D0 + 5 * DAY, extra: { tags: ["club"] } }),
  ];
}
const settings = { lateThresholdMin: 5 };

test("filterMeetings by date range, days back, tag and code; allTags counts", () => {
  const recs = dataset();
  assert.equal(an.filterMeetings(recs, { from: "2026-10-02", to: "2026-10-05" }).length, 2);
  assert.equal(an.filterMeetings(recs, { to: "2026-10-01" }).length, 1);
  assert.equal(an.filterMeetings(recs, { days: 2, now: D0 + 5 * DAY + 1 }).length, 2);
  assert.equal(an.filterMeetings(recs, { tag: "lab" }).length, 1);
  assert.equal(an.filterMeetings(recs, { code: "xyz-pqrs-tuv" }).length, 1);
  assert.deepEqual(an.allTags(recs), [{ tag: "class", count: 3 }, { tag: "club", count: 1 }, { tag: "lab", count: 1 }]);
});

test("personStats: attendance rate, late/absent counts, averages and trend", () => {
  const people = an.personStats(dataset(), { settings, rosterFor });
  const by = Object.fromEntries(people.map((p) => [p.name, p]));
  assert.equal(by["Ayesha Siddiqua"].attended, 4);
  assert.equal(by["Ayesha Siddiqua"].rate, 1);
  assert.equal(by["Daniel Kim"].expected, 3);
  assert.equal(by["Daniel Kim"].present, 1);
  assert.equal(by["Daniel Kim"].late, 1);
  assert.equal(by["Daniel Kim"].absent, 1);
  assert.equal(Math.round(by["Daniel Kim"].rate * 100), 67);
  // "Md. Rahim Uddin" is matched to the roster's "Rahim Uddin" → one person.
  assert.equal(people.filter((p) => /Rahim/.test(p.name)).length, 1);
  assert.equal(by["Rahim Uddin"].attended, 2);
  assert.equal(by["Rahim Uddin"].absent, 1);
  assert.equal(by["Ayesha Siddiqua"].totalSpeakingMs, 14 * 60000);
  assert.equal(by["Ayesha Siddiqua"].trend.length, 4);
  assert.ok(by["Daniel Kim"].trend.some((p) => p.status === "absent"));
  assert.equal(by["Zoe Park"].expected, 1);
  assert.equal(by["Ayesha Siddiqua"].avgTimeMs, 60 * 60000);
});

test("overview: totals, per-meeting stacks, top speakers and speaking share", () => {
  const o = an.overview(dataset(), { settings, rosterFor });
  assert.equal(o.meetings, 4);
  assert.equal(o.uniquePeople, 5);
  assert.equal(o.totalMs, 4 * 3600000);
  assert.deepEqual(o.perMeeting.map((p) => [p.present, p.late, p.absent]), [[3, 0, 0], [1, 1, 1], [3, 0, 1], [2, 0, 0]]);
  assert.equal(o.topSpeakers[0].label, "Guest Speaker");
  assert.equal(o.speakingShare.reduce((n, s) => n + s.value, 0), o.totalSpeakingMs);
  assert.ok(o.avgRate > 0 && o.avgRate <= 1);
});

test("seriesList groups by meeting code; seriesMatrix lists roster members first with absences", () => {
  const recs = dataset();
  const list = an.seriesList(recs);
  assert.equal(list[0].code, "cse-abcd-301");
  assert.equal(list[0].count, 3);
  const mx = an.seriesMatrix(recs.filter((r) => r.code === "cse-abcd-301"), { settings, rosterFor });
  assert.equal(mx.sessions.length, 3);
  assert.deepEqual(mx.rows.slice(0, 3).map((r) => r.name), ["Ayesha Siddiqua", "Daniel Kim", "Rahim Uddin"]);
  assert.deepEqual(mx.rows[1].cells.map((c) => c.status), ["present", "late", "absent"]);
  assert.equal(mx.rows[1].attended, 2);
  const guest = mx.rows.find((r) => r.name === "Guest Speaker");
  assert.equal(guest.onRoster, false);
  assert.deepEqual(guest.cells.map((c) => c.status), ["absent", "absent", "present"]);
});

test("charts render well-formed, escaped SVG", () => {
  const svgs = [
    charts.stackedBarChart({ labels: ["Oct 1", "<b>"], series: [{ name: "Present", values: [3, 1], color: "#0f766e" }, { name: "Late", values: [0, 1] }], title: "Attendance" }),
    charts.lineChart({ points: [{ label: "a", value: 10 }, { label: "b", value: 25 }, { label: "c", value: 0 }], unit: "m" }),
    charts.hBarChart({ data: [{ label: 'Tom & "Jerry"', value: 5, display: "5m" }, { label: "রহিম উদ্দিন", value: 3 }] }),
    charts.pieChart({ slices: [{ label: "A", value: 3 }, { label: "B", value: 1 }], format: (v) => v + "s" }),
    charts.pieChart({ slices: [{ label: "Only", value: 1 }] }),
    charts.stackedBarChart({ labels: [], series: [] }),
  ];
  for (const s of svgs) {
    assert.match(s, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.ok(s.endsWith("</svg>"));
    assert.ok(!/NaN|undefined|Infinity/.test(s), s.slice(0, 200));
    assert.equal((s.match(/<svg/g) || []).length, (s.match(/<\/svg>/g) || []).length);
  }
  assert.ok(svgs[0].includes("&lt;b&gt;"));
  assert.ok(svgs[2].includes("Tom &amp; &quot;Jerry&quot;"));
  assert.ok(svgs[2].includes("রহিম"));
  assert.equal((svgs[3].match(/class="slice"/g) || []).length || (svgs[3].match(/<path/g) || []).length, 2);
  assert.equal(charts.escapeSvg("<&>"), "&lt;&amp;&gt;");
});
