// Deterministic demo data (used for screenshots only; never shipped in the extension).
const core = require("../extension/lib/core.js");

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const TEAM = ["Sahinur Rahman", "Ayesha Siddiqua", "Daniel Kim", "Priya Natarajan", "Lucas Oliveira", "Fatima Zahra", "Tanvir Hasan", "Emily Carter", "Kenji Watanabe", "Nusrat Jahan"];
const STUDENTS = [
  "Arif Chowdhury", "Grace Liu", "Omar Haddad", "রহিম উদ্দিন", "নুসরাত জাহান", "Marco Rossi", "Sofia Petrova", "Md. Kamrul Islam",
  "Farhana Akter", "Jonas Weber", "Mei Tanaka", "Sabbir Ahmed", "Ritu Das", "Imran Hossain",
];

const ROSTERS = [
  { id: "rdemo-cse301", name: "CSE-301 Section A", codes: ["lec-ture-one"], members: STUDENTS.map((name) => ({ name })) },
  { id: "rdemo-product", name: "Product team", codes: ["pqr-stuv-wxy", "kfp-wnzq-rta"], members: TEAM.map((name) => ({ name })) },
];

const CHAT = {
  product: [
    ["Ayesha Siddiqua", "Morning all, agenda is in the doc 📄"],
    ["Daniel Kim", "Can we start with the release checklist?"],
    ["Sahinur Rahman", "Yes, then the onboarding metrics"],
    ["Priya Natarajan", "Dashboard numbers updated 5 min ago"],
    ["Lucas Oliveira", "I'll take the follow-up on the Safari bug"],
  ],
  lecture: [
    ["Sahinur Rahman", "Slides for today: chapter 7, hash tables"],
    ["রহিম উদ্দিন", "স্যার, আজকের ল্যাব কি অনলাইনে হবে?"],
    ["Sahinur Rahman", "Yes, lab is online this week"],
    ["Grace Liu", "Is the quiz next Tuesday?"],
    ["নুসরাত জাহান", "ধন্যবাদ স্যার!"],
  ],
};

// kind: who attends. absent: chance a member skips; late: chance of joining late.
const MEETINGS = [
  { title: "Weekly Product Sync", code: "pqr-stuv-wxy", daysAgo: 0, hour: 10, min: 0, len: 52, kind: "team", n: 9, absent: 0.08, late: 0.2, tags: ["product", "weekly"], chat: "product", notes: "Ship v2.1 on Friday. Daniel owns the release checklist; Priya to share onboarding metrics." },
  { title: "CSE-301 Lecture 14", code: "lec-ture-one", daysAgo: 1, hour: 9, min: 0, len: 75, kind: "class", absent: 0.15, late: 0.2, tags: ["class", "cse-301"], chat: "lecture", notes: "Covered hash tables. Quiz next Tuesday." },
  { title: "Design Review: Onboarding", code: "dfe-ghij-klm", daysAgo: 2, hour: 15, min: 30, len: 38, kind: "team", n: 6, absent: 0, late: 0.1, tags: ["design"] },
  { title: "CSE-301 Lecture 13", code: "lec-ture-one", daysAgo: 3, hour: 9, min: 0, len: 72, kind: "class", absent: 0.2, late: 0.15, tags: ["class", "cse-301"] },
  { title: "1:1 Ayesha / Sahinur", code: "one-onea-yes", daysAgo: 4, hour: 11, min: 15, len: 27, kind: "team", n: 2, absent: 0, late: 0, tags: ["1on1"] },
  { title: "Weekly Product Sync", code: "pqr-stuv-wxy", daysAgo: 7, hour: 10, min: 0, len: 48, kind: "team", n: 9, absent: 0.15, late: 0.15, tags: ["product", "weekly"] },
  { title: "CSE-301 Lecture 12", code: "lec-ture-one", daysAgo: 8, hour: 9, min: 0, len: 78, kind: "class", absent: 0.12, late: 0.25, tags: ["class", "cse-301"] },
  { title: "Customer Call: Acme Ltd", code: "acm-ecal-lzz", daysAgo: 9, hour: 17, min: 0, len: 41, kind: "team", n: 5, absent: 0, late: 0.1, tags: ["customer"] },
  { title: "CSE-301 Lecture 11", code: "lec-ture-one", daysAgo: 10, hour: 9, min: 0, len: 70, kind: "class", absent: 0.1, late: 0.2, tags: ["class", "cse-301"] },
  { title: "Weekly Product Sync", code: "pqr-stuv-wxy", daysAgo: 14, hour: 10, min: 0, len: 55, kind: "team", n: 9, absent: 0.1, late: 0.2, tags: ["product", "weekly"] },
];

function buildMeeting(def, idx, now = Date.now()) {
  const r = rng(1000 + idx * 7919);
  const d = new Date(now);
  d.setDate(d.getDate() - def.daysAgo);
  d.setHours(def.hour, def.min, 0, 0);
  const start = d.getTime();
  const end = start + def.len * 60000;
  const names = def.kind === "class" ? ["Sahinur Rahman", ...STUDENTS.filter((n) => n !== "Imran Hossain")] : TEAM.slice(0, def.n);
  const cast = [];
  names.forEach((name, i) => {
    if (i > 0 && r() < def.absent) return;
    const isLate = i > 0 && r() < def.late;
    const join = i === 0 ? 0 : isLate ? (6 + Math.floor(r() * 12)) * 60000 : Math.floor(r() * 4) * 60000 + Math.floor(r() * 50) * 1000;
    const leave = i > 0 && r() < 0.12 ? Math.min(end - start, join + Math.floor(r() * 6 + 3) * 60000) : r() < 0.15 ? end - start - Math.floor(r() * 15 + 3) * 60000 : end - start;
    const gap = r() < 0.15 ? { at: Math.floor(r() * 20 + 10) * 60000, len: Math.floor(r() * 5 + 2) * 60000 } : null;
    const talk = i === 0 ? (def.kind === "class" ? 0.55 : 0.22) : r() * (i < 4 ? 0.2 : 0.05);
    cast.push({ name, self: i === 0, join, leave, gap, talk });
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
  if (def.chat) {
    const present = new Set(cast.map((c) => c.name));
    t.addChat(
      CHAT[def.chat].filter(([s]) => present.has(s)).map(([sender, text], i) => ({ id: `demo-${idx}-${i}`, sender, text, time: start + (4 + i * 6) * 60000 })),
      end
    );
  }
  t.finalize(end);
  const rec = Object.assign(t.toRecord(end), { savedAt: end, savedVia: idx === 4 ? "manual" : "auto", tags: def.tags || [] });
  if (def.notes) rec.notes = def.notes;
  return rec;
}

function demoMeetings(now) {
  return MEETINGS.map((m, i) => buildMeeting(m, i, now));
}

module.exports = { demoMeetings, ROSTERS, TEAM, STUDENTS };
if (require.main === module) console.log(JSON.stringify(demoMeetings().map((m) => [m.title, m.participants.length, (m.chat || []).length])));
