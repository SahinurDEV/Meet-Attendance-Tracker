process.env.TZ = "UTC";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../../extension/lib/core.js");
const ex = require("../../extension/lib/export.js");
const { meeting } = require("../helpers/records.cjs");

const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const roster = { id: "r1", name: "CSE-301", codes: ["abc-defg-hij"], members: [{ name: "Ayesha Siddiqua" }, { name: "Daniel Kim" }, { name: "রহিম উদ্দিন" }] };
const settings = { lateThresholdMin: 5, minPresenceValue: 10, timeFormat: "24h" };

function rec(extraPeople = []) {
  const r = meeting(
    [{ name: "Ayesha Siddiqua", from: 0, speak: [0, 5] }, { name: "Daniel Kim", from: 9 }, { name: "Quick Guest", from: 2, to: 5 }, ...extraPeople],
    { extra: { tags: ["class"], notes: "Quiz <b>next</b> week.\nBring laptops." } }
  );
  r.chat = [
    { id: "1", sender: "Ayesha Siddiqua", text: "Good morning!", at: T0 + 60000 },
    { id: "2", sender: "রহিম উদ্দিন", text: "আমি একটু দেরি করব", at: T0 + 700000 },
  ];
  return r;
}

test("HTML report: complete, self-contained document with summary, statuses, absentees and chat", () => {
  const file = ex.exportRecord(rec(), "html", settings, undefined, { roster });
  assert.match(file.filename, /^meet-attendance_.+\.html$/);
  assert.equal(file.mime, "text/html;charset=utf-8");
  const html = file.data;
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"/);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /@media \(max-width:640px\)/);
  assert.match(html, /<li style="--c:var\(--present\)">Present 1<\/li>/);
  assert.match(html, /Absent 1/);
  assert.match(html, /Attendance 67%/);
  assert.match(html, /<td class="st st-late" data-label="Status">Late<\/td>/);
  assert.match(html, /<td class="st st-absent" data-label="Status">Absent<\/td>/);
  assert.match(html, /<td class="name" data-label="Name" dir="auto">রহিম উদ্দিন<\/td>/);
  assert.match(html, /Too short \(guest\)/);
  assert.match(html, /Chat \(2 messages\)/);
  assert.match(html, /আমি একটু দেরি করব/);
  assert.match(html, /CSE-301 \(2\/3 attended\)/);
  assert.match(html, /<b>Tags:<\/b> <span dir="auto">class<\/span>/);
  assert.match(html, /Generated locally by Meet Attendance Tracker on 2026-/);
  // Self-contained: no scripts, no remote resources.
  assert.ok(!/<script/i.test(html));
  assert.ok(!/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html));
  assert.ok(!/@import|url\(/i.test(html));
});

test("HTML report escapes names, chat, notes, tags and titles (no markup injection)", () => {
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
  const r = rec([{ name: evil, from: 1 }]);
  r.title = `</title><script>alert(3)</script>`;
  r.tags = ['"><svg onload=alert(4)>'];
  r.notes = "</p><iframe src=javascript:alert(5)>";
  r.chat.push({ id: "3", sender: "<b>boss</b>", text: "<style>body{display:none}</style>&amp;", at: T0 + 800000 });
  const html = ex.exportRecord(r, "html", settings, undefined, { roster }).data;
  assert.ok(!/<script/i.test(html), "no script tag");
  assert.ok(!/<img|<svg|<iframe/i.test(html), "no injected elements");
  assert.equal((html.match(/<style>/g) || []).length, 1, "only our own <style>");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&gt;&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html, /<title>Attendance: &lt;\/title&gt;&lt;script&gt;/);
  assert.match(html, /&amp;amp;/);
});

test("HTML report handles an empty meeting", () => {
  const r = meeting([], {});
  const html = ex.exportRecord(r, "html", settings).data;
  assert.match(html, /No participants recorded\./);
  assert.ok(!/<table>/.test(html));
  assert.ok(!/Chat \(/.test(html));
});
