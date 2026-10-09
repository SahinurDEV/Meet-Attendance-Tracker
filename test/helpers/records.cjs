// Build finished meeting records from a compact description (minutes from start).
const core = require("../../extension/lib/core.js");

/** people: [{name, from, to?, self?, speak?: [fromMin, toMin]}] */
function meeting(people, { endMin = 60, code = "abc-defg-hij", title = "Class", start = Date.UTC(2026, 9, 9, 8, 0, 0), extra = {} } = {}) {
  const t = new core.AttendanceTracker({ code, title, startedAt: start }, { graceMs: 1000, maxTickMs: 60000 });
  const at = (min) => start + min * 60000;
  const times = new Set([0, endMin]);
  people.forEach((p) => {
    times.add(p.from);
    times.add(p.to ?? endMin);
    if (p.speak) p.speak.forEach((x) => times.add(x));
  });
  // sample every minute so speaking time accrues
  for (let i = 0; i <= endMin; i++) times.add(i);
  for (const min of [...times].sort((a, b) => a - b)) {
    const snap = people
      .filter((p) => p.from <= min && min < (p.to ?? endMin + 1))
      .map((p) => ({ name: p.name, isSelf: !!p.self, speaking: !!(p.speak && min >= p.speak[0] && min < p.speak[1]) }));
    t.update(snap, at(min));
  }
  t.finalize(at(endMin));
  return Object.assign(t.toRecord(at(endMin)), extra);
}

module.exports = { meeting };
