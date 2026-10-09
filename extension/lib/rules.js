/*
 * Meet Attendance Tracker: rosters and attendance rules.
 *
 * Pure functions: CSV/paste roster parsing, fuzzy roster ↔ participant
 * matching (handles "Md." prefixes, "(You)", reordered names), and the
 * Present / Late / Too short / Absent evaluation used by the panel,
 * dashboard and every export.
 */
(function (root, factory) {
  const core = root.MAT || (typeof require === "function" ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const STATUS = { PRESENT: "present", LATE: "late", SHORT: "short", ABSENT: "absent" };
  const STATUS_LABEL = { present: "Present", late: "Late", short: "Too short", absent: "Absent" };

  // ── CSV ────────────────────────────────────────────────────────────
  /** RFC-4180-ish parser; auto-detects , ; or tab delimiters. */
  function parseCSV(text) {
    text = String(text || "").replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = [];
    let row = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === delim) {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  }

  /**
   * Turn pasted text or a CSV file into roster members.
   * Accepts one name per line, or CSV with a header containing
   * name / first+last name / email / alias columns.
   */
  function parseRosterText(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
    const find = (...names) => header.findIndex((h) => names.includes(h));
    let nameIdx = find("name", "fullname", "student", "studentname", "member", "participant", "displayname");
    const firstIdx = find("firstname", "givenname", "first");
    const lastIdx = find("lastname", "surname", "familyname", "last");
    const emailIdx = find("email", "emailaddress", "mail");
    const aliasIdx = find("alias", "aliases", "nickname", "meetname");
    const idIdx = find("id", "studentid", "roll", "rollno", "rollnumber");
    const hasHeader = nameIdx >= 0 || firstIdx >= 0 || emailIdx >= 0;
    const body = hasHeader ? rows.slice(1) : rows;
    if (!hasHeader) nameIdx = 0;
    const seen = new Set();
    const out = [];
    for (const r of body) {
      let name = nameIdx >= 0 ? r[nameIdx] : [r[firstIdx], r[lastIdx]].filter(Boolean).join(" ");
      let email = emailIdx >= 0 ? (r[emailIdx] || "").toLowerCase() : "";
      if (!hasHeader && !email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[1] || "")) email = r[1].toLowerCase();
      if (!name && email) name = email.split("@")[0].replace(/[._]+/g, " ");
      name = core.normalizeName(name);
      if (!name) continue;
      const key = core.nameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const m = { name };
      if (email) m.email = email;
      if (idIdx >= 0 && r[idIdx]) m.ref = r[idIdx];
      if (aliasIdx >= 0 && r[aliasIdx]) m.aliases = r[aliasIdx].split(/[|/]/).map((a) => a.trim()).filter(Boolean);
      out.push(m);
    }
    return out;
  }

  // ── Matching ───────────────────────────────────────────────────────
  const HONORIFICS = new Set(["md", "mohammad", "mohammed", "muhammad", "mr", "mrs", "ms", "miss", "dr", "prof", "sir", "mst", "most", "sk", "sheikh"]);
  function tokens(name) {
    return core
      .nameKey(name)
      .replace(/[.,'’\-_()]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !HONORIFICS.has(t));
  }

  /**
   * Match roster members to participant rows.
   * 1) exact normalised name or alias, 2) token-set equality (reordered),
   * 3) one token set contained in the other (e.g. "Rahim Uddin" ↔ "Md Rahim Uddin Khan"),
   * each step only accepting unambiguous, not-yet-used candidates.
   * @returns Map<memberIndex, rowKey>
   */
  function matchRoster(members, rows) {
    const result = new Map();
    const used = new Set();
    const rowTokens = rows.map((r) => ({ key: r.key, set: new Set(tokens(r.name)), exact: core.nameKey(r.name) }));
    const memberNames = members.map((m) => [m.name, ...(m.aliases || [])]);

    const pass = (test) => {
      members.forEach((m, i) => {
        if (result.has(i)) return;
        const cands = rowTokens.filter((r) => !used.has(r.key) && memberNames[i].some((n) => test(n, r)));
        if (cands.length === 1) {
          result.set(i, cands[0].key);
          used.add(cands[0].key);
        }
      });
    };
    pass((n, r) => core.nameKey(n) === r.exact);
    const eqSet = (a, b) => a.size === b.size && [...a].every((t) => b.has(t));
    pass((n, r) => {
      const t = new Set(tokens(n));
      return t.size > 0 && eqSet(t, r.set);
    });
    pass((n, r) => {
      const t = new Set(tokens(n));
      if (t.size === 0 || r.set.size === 0) return false;
      const [small, big] = t.size <= r.set.size ? [t, r.set] : [r.set, t];
      return small.size >= Math.min(2, big.size) && [...small].every((x) => big.has(x) && x.length >= 2);
    });
    return result;
  }

  // ── Rules ──────────────────────────────────────────────────────────
  function minPresenceMs(settings, meetingMs) {
    const v = Number(settings.minPresenceValue) || 0;
    if (v <= 0) return 0;
    return settings.minPresenceMode === "percent" ? (Math.min(100, v) / 100) * meetingMs : v * 60000;
  }

  function statusFor(row, record, settings, meetingMs) {
    // While someone is still in a live call they may yet reach the minimum.
    const minMs = minPresenceMs(settings, meetingMs);
    if (minMs > 0 && row.timeInCallMs < minMs && !row.present) return STATUS.SHORT;
    const lateMs = (Number(settings.lateThresholdMin) || 0) * 60000;
    if (lateMs > 0 && row.firstSeen - record.startedAt > lateMs) return STATUS.LATE;
    return STATUS.PRESENT;
  }

  /**
   * Full attendance evaluation for one meeting.
   * @returns {{rows, absentees, summary, roster}} rows = participant rows + {status, onRoster, member}
   */
  function evaluateAttendance(record, opts = {}) {
    const settings = opts.settings || {};
    const at = opts.now != null ? opts.now : record.endedAt != null ? record.endedAt : record.updatedAt;
    const meetingMs = core.meetingDuration(record, at);
    const rows = core.filterRows(core.computeRows(record, opts.now), settings).map((r) => ({
      ...r,
      status: statusFor(r, record, settings, meetingMs),
      onRoster: null,
      member: null,
    }));
    let absentees = [];
    const roster = opts.roster || null;
    if (roster && roster.members && roster.members.length) {
      const matches = matchRoster(roster.members, rows);
      const byKey = new Map(rows.map((r) => [r.key, r]));
      // You (the organiser) are never counted as a guest when you're not on the list.
      rows.forEach((r) => (r.onRoster = r.isSelf ? null : false));
      roster.members.forEach((m, i) => {
        const key = matches.get(i);
        if (key) {
          const r = byKey.get(key);
          r.onRoster = true;
          r.member = m;
        } else {
          absentees.push({ name: m.name, member: m, status: STATUS.ABSENT, key: "roster:" + core.nameKey(m.name) });
        }
      });
    }
    const count = (s) => rows.filter((r) => r.status === s).length;
    const speaking = rows.reduce((n, r) => n + r.speakingMs, 0);
    const top = rows.slice().sort((a, b) => b.speakingMs - a.speakingMs)[0];
    const summary = {
      participants: rows.length,
      present: count(STATUS.PRESENT),
      late: count(STATUS.LATE),
      short: count(STATUS.SHORT),
      absent: absentees.length,
      expected: roster && roster.members ? roster.members.length : null,
      guests: roster ? rows.filter((r) => r.onRoster === false).length : null,
      attendanceRate: roster && roster.members && roster.members.length
        ? rows.filter((r) => r.onRoster && r.status !== STATUS.SHORT).length / roster.members.length
        : null,
      meetingMs,
      avgTimeInCallMs: rows.length ? rows.reduce((n, r) => n + r.timeInCallMs, 0) / rows.length : 0,
      totalSpeakingMs: speaking,
      topSpeaker: top && top.speakingMs > 0 ? { name: top.name, speakingMs: top.speakingMs } : null,
    };
    return { rows, absentees, summary, roster };
  }

  /** "Present", "Late (guest)", … */
  function statusLabel(row) {
    const base = STATUS_LABEL[row.status] || row.status;
    return row.onRoster === false ? `${base} (guest)` : base;
  }

  return { STATUS, STATUS_LABEL, parseCSV, parseRosterText, matchRoster, nameTokens: tokens, minPresenceMs, evaluateAttendance, statusLabel };
});
