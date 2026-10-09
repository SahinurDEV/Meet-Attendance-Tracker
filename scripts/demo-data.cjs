// Deterministic demo meetings (used for screenshots only; never shipped in the extension).
const core = require("../extension/lib/core.js");

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const PEOPLE = [
  "Sahinur Rahman", "Ayesha Siddiqua", "Daniel Kim", "Priya Natarajan", "Lucas Oliveira", "Fatima Zahra",
  "Tanvir Hasan", "Emily Carter", "Kenji Watanabe", "Nusrat Jahan", "Marco Rossi", "Sofia Petrova",
  "Arif Chowdhury", "Grace Liu", "Omar Haddad",
];

const MEETINGS = [
  { title: "Weekly Product Sync", code: "pqr-stuv-wxy", daysAgo: 0, hour: 10, min: 0, len: 52, n: 9 },
  { title: "Design Review: Onboarding", code: "dfe-ghij-klm", daysAgo: 1, hour: 15, min: 30, len: 38, n: 6 },
  { title: "CSE-301 Lecture 14", code: "lec-ture-one", daysAgo: 2, hour: 9, min: 0, len: 75, n: 15 },
  { title: "1:1 Ayesha / Sahinur", code: "one-onea-yes", daysAgo: 3, hour: 11, min: 15, len: 27, n: 2 },
  { title: "Sprint Planning", code: "spr-intp-lan", daysAgo: 6, hour: 10, min: 0, len: 64, n: 11 },
  { title: "Customer Call: Acme Ltd", code: "acm-ecal-lzz", daysAgo: 8, hour: 17, min: 0, len: 41, n: 5 },
];

function buildMeeting(def, idx, now = Date.now()) {
  const r = rng(1000 + idx * 7919);
  const d = new Date(now);
  d.setDate(d.getDate() - def.daysAgo);
  d.setHours(def.hour, def.min, 0, 0);
  const start = d.getTime();
  const end = start + def.len * 60000;
  const cast = PEOPLE.slice(0, def.n).map((name, i) => {
    const join = i === 0 ? 0 : Math.floor(r() * (i < def.n * 0.7 ? 4 : 12)) * 60000 + Math.floor(r() * 50) * 1000;
    const leave = r() < 0.2 ? end - start - Math.floor(r() * 15 + 3) * 60000 : end - start;
    const gap = r() < 0.18 ? { at: Math.floor(r() * 20 + 10) * 60000, len: Math.floor(r() * 5 + 2) * 60000 } : null;
    return { name, self: i === 0, join, leave, gap, talk: i === 0 ? 0.25 : r() * (i < 4 ? 0.22 : 0.06) };
  });
  const t = new core.AttendanceTracker({ code: def.code, title: def.title, url: `https://meet.google.com/${def.code}`, startedAt: start }, { graceMs: 10000, maxTickMs: 6000 });
  for (let ms = 0; ms <= end - start; ms += 5000) {
    const snap = [];
    for (const c of cast) {
      const inGap = c.gap && ms >= c.gap.at && ms < c.gap.at + c.gap.len;
      if (ms >= c.join && ms < c.leave && !inGap) snap.push({ name: c.name, isSelf: c.self, speaking: r() < c.talk });
    }
    t.update(snap, start + ms);
  }
  t.finalize(end);
  return Object.assign(t.toRecord(end), { savedAt: end, savedVia: idx === 3 ? "manual" : "auto" });
}

function demoMeetings(now) {
  return MEETINGS.map((m, i) => buildMeeting(m, i, now));
}

module.exports = { demoMeetings, PEOPLE };
if (require.main === module) console.log(JSON.stringify(demoMeetings().map((m) => [m.title, m.participants.length])));
