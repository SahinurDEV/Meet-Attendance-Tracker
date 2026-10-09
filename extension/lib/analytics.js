/*
 * Meet Attendance Tracker: analytics across meetings (pure functions).
 * Per-person history, overall stats, recurring-meeting series and the
 * series attendance matrix.
 */
(function (root, factory) {
  const req = (p) => (typeof require === "function" ? require(p) : null);
  const core = root.MAT && root.MAT.computeRows ? root.MAT : req("./core.js");
  const rules = root.MAT && root.MAT.evaluateAttendance ? root.MAT : req("./rules.js");
  const api = factory(Object.assign({}, core, rules));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (M) {
  "use strict";

  const DAY = 86400000;

  /** Filter meetings by {from, to} (YYYY-MM-DD, inclusive, local time), tag, code, or days back. */
  function filterMeetings(records, f = {}) {
    let from = f.from ? new Date(f.from + "T00:00:00").getTime() : -Infinity;
    const to = f.to ? new Date(f.to + "T00:00:00").getTime() + DAY - 1 : Infinity;
    if (f.days) from = Math.max(from, (f.now || Date.now()) - f.days * DAY);
    return records.filter(
      (r) =>
        r.startedAt >= from &&
        r.startedAt <= to &&
        (!f.tag || (r.tags || []).includes(f.tag)) &&
        (!f.code || r.code === f.code)
    );
  }

  function allTags(records) {
    const counts = new Map();
    for (const r of records) for (const t of r.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
  }

  /** Evaluate every meeting once. */
  function evaluateAll(records, opts = {}) {
    const rosterFor = opts.rosterFor || (() => null);
    return records
      .slice()
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((record) => {
        const ev = M.evaluateAttendance(record, { settings: opts.settings || {}, roster: rosterFor(record) });
        return { record, ev };
      });
  }

  const personKey = (row) => M.nameKey(row.member ? row.member.name : row.name);

  /**
   * Per-person stats. A person is "expected" at every meeting of a series
   * (meeting code) they attended at least once, and at every meeting whose
   * roster lists them. Attendance rate = (Present + Late) / expected.
   */
  function personStats(records, opts = {}) {
    const evals = evaluateAll(records, opts);
    const people = new Map();
    const get = (key, name) => {
      if (!people.has(key)) people.set(key, { key, name, attended: new Map(), codes: new Set(), rosterIds: new Set() });
      return people.get(key);
    };
    for (const { record, ev } of evals) {
      for (const r of ev.rows) {
        const p = get(personKey(r), r.member ? r.member.name : r.name);
        p.attended.set(record.id, r);
        if (record.code) p.codes.add(record.code);
        if (r.onRoster) p.rosterIds.add(record.id);
      }
      for (const a of ev.absentees) get(M.nameKey(a.name), a.name).rosterIds.add(record.id);
    }
    const out = [];
    for (const p of people.values()) {
      const expected = evals.filter(({ record }) => p.attended.has(record.id) || p.rosterIds.has(record.id) || (record.code && p.codes.has(record.code)));
      const trend = expected.map(({ record }) => {
        const r = p.attended.get(record.id);
        return {
          id: record.id,
          code: record.code,
          title: record.title || record.code,
          startedAt: record.startedAt,
          status: r ? r.status : "absent",
          timeInCallMs: r ? r.timeInCallMs : 0,
          speakingMs: r ? r.speakingMs : 0,
        };
      });
      const att = trend.filter((t) => t.status !== "absent");
      const counted = att.filter((t) => t.status !== "short");
      out.push({
        key: p.key,
        name: p.name,
        expected: trend.length,
        attended: att.length,
        present: att.filter((t) => t.status === "present").length,
        late: att.filter((t) => t.status === "late").length,
        short: att.filter((t) => t.status === "short").length,
        absent: trend.length - att.length,
        rate: trend.length ? counted.length / trend.length : 0,
        avgTimeMs: att.length ? att.reduce((n, t) => n + t.timeInCallMs, 0) / att.length : 0,
        totalTimeMs: att.reduce((n, t) => n + t.timeInCallMs, 0),
        totalSpeakingMs: att.reduce((n, t) => n + t.speakingMs, 0),
        lastSeen: att.length ? att[att.length - 1].startedAt : null,
        trend,
      });
    }
    return out.sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
  }

  /** Overall dashboard numbers + chart series. */
  function overview(records, opts = {}) {
    const evals = evaluateAll(records, opts);
    const people = personStats(records, opts);
    const totalMs = evals.reduce((n, { ev }) => n + ev.summary.meetingMs, 0);
    const perMeeting = evals.map(({ record, ev }) => ({
      id: record.id,
      title: record.title || record.code,
      code: record.code,
      startedAt: record.startedAt,
      participants: ev.summary.participants,
      present: ev.summary.present,
      late: ev.summary.late,
      short: ev.summary.short,
      absent: ev.summary.absent,
    }));
    const speakers = people.filter((p) => p.totalSpeakingMs > 0).sort((a, b) => b.totalSpeakingMs - a.totalSpeakingMs);
    const totalSpeak = speakers.reduce((n, p) => n + p.totalSpeakingMs, 0);
    const share = speakers.slice(0, 6).map((p) => ({ label: p.name, value: p.totalSpeakingMs }));
    const rest = totalSpeak - share.reduce((n, s) => n + s.value, 0);
    if (rest > 0) share.push({ label: "Others", value: rest });
    return {
      meetings: evals.length,
      uniquePeople: people.length,
      totalMs,
      avgAttendance: evals.length ? perMeeting.reduce((n, m) => n + m.participants, 0) / evals.length : 0,
      avgRate: people.length ? people.reduce((n, p) => n + p.rate, 0) / people.length : 0,
      totalSpeakingMs: totalSpeak,
      perMeeting,
      topSpeakers: speakers.slice(0, 8).map((p) => ({ label: p.name, value: p.totalSpeakingMs, key: p.key })),
      speakingShare: share,
      people,
    };
  }

  /** Group meetings by meeting code (recurring meetings reuse the same code). */
  function seriesList(records) {
    const by = new Map();
    for (const r of records) {
      const code = r.code || "(no code)";
      if (!by.has(code)) by.set(code, []);
      by.get(code).push(r);
    }
    return [...by.entries()]
      .map(([code, list]) => {
        list.sort((a, b) => a.startedAt - b.startedAt);
        const latest = list[list.length - 1];
        return { code, title: latest.title || code, count: list.length, first: list[0].startedAt, last: latest.startedAt, ids: list.map((r) => r.id) };
      })
      .sort((a, b) => b.count - a.count || b.last - a.last);
  }

  /**
   * Who attended which session of a series.
   * @returns {{code,title,sessions:[{id,startedAt,title}],rows:[{key,name,onRoster,cells:[{status,timeInCallMs}],attended,expected,rate}]}}
   */
  function seriesMatrix(records, opts = {}) {
    const evals = evaluateAll(records, opts);
    const rows = new Map();
    const order = [];
    const ensure = (key, name, onRoster) => {
      if (!rows.has(key)) {
        rows.set(key, { key, name, onRoster: !!onRoster, cells: evals.map(() => null) });
        order.push(key);
      } else if (onRoster) rows.get(key).onRoster = true;
      return rows.get(key);
    };
    // Roster members first, in roster order.
    evals.forEach(({ ev }) => (ev.roster ? ev.roster.members : []).forEach((m) => ensure(M.nameKey(m.name), m.name, true)));
    evals.forEach(({ ev }, i) => {
      for (const r of ev.rows) ensure(personKey(r), r.member ? r.member.name : r.name, r.onRoster).cells[i] = { status: r.status, timeInCallMs: r.timeInCallMs };
    });
    const out = order.map((k) => {
      const row = rows.get(k);
      row.cells = row.cells.map((c) => c || { status: "absent", timeInCallMs: 0 });
      row.attended = row.cells.filter((c) => c.status === "present" || c.status === "late").length;
      row.expected = row.cells.length;
      row.rate = row.expected ? row.attended / row.expected : null;
      return row;
    });
    out.sort((a, b) => (b.onRoster - a.onRoster) || (a.onRoster ? 0 : b.attended - a.attended || a.name.localeCompare(b.name)));
    const latest = evals[evals.length - 1];
    return {
      code: latest ? latest.record.code : "",
      title: latest ? latest.record.title || latest.record.code : "",
      sessions: evals.map(({ record }) => ({ id: record.id, startedAt: record.startedAt, title: record.title })),
      rows: out,
    };
  }

  return { filterMeetings, allTags, personStats, overview, seriesList, seriesMatrix };
});
