/*
 * Meet Attendance Tracker: core attendance logic.
 *
 * Pure, DOM-free code: name normalisation, session merging, the
 * AttendanceTracker state machine (joins, leaves, rejoins, speaking time)
 * and formatting helpers. Loaded as a classic script in the extension
 * (exposed on globalThis.MAT) and via require() in the Node unit tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RECORD_VERSION = 2;

  // ── Names ──────────────────────────────────────────────────────────
  const SUFFIX_RE =
    /\s*[([]\s*(you|host|co-host|organi[sz]er|presenter|presentation|meeting host|guest|external)\s*[)\]]\s*$/i;
  const TRAILING_ROLE_RE = /\s+(meeting host|is presenting|\(presenting\))$/i;

  // Words / phrases that only appear in Meet UI chrome, never in real names.
  const UI_PHRASES = [
    "backgrounds and effects", "turn on", "turn off", "more options", "more actions",
    "present now", "you are presenting", "admit", "deny", "remove", "mute", "unmute",
    "pin", "unpin", "raise hand", "lower hand", "reframe", "captions", "settings",
    "participants", "people", "in call", "contributors", "waiting to join",
    "meeting details", "activities", "chat with everyone", "leave call", "jump to bottom",
    "add people", "frame", "your presentation", "others might still see",
  ];
  const UI_WORD_RE =
    /\b(backgrounds?|effects?|captions?|layout|settings?|breakout|recording|livestream|companion|microphone|camera|spotlight|tiles?|reframe|admit|joining|asking to join|unmute|mute|pin|unpin|keyboard|shortcut|toolbar)\b/i;

  function unDouble(name) {
    const len = name.length;
    if (len < 4) return name;
    if (len % 2 === 0 && name.slice(0, len / 2) === name.slice(len / 2)) return name.slice(0, len / 2);
    // "Jane DoeJane Doe" with no separator but odd length (e.g. stray space)
    const trimmed = name.replace(/\s+/g, "");
    if (trimmed.length % 2 === 0 && trimmed.length >= 4) {
      const half = trimmed.slice(0, trimmed.length / 2);
      if (trimmed === half + half) {
        // Rebuild the first half from the original string (keeps spaces).
        let count = 0;
        for (let i = 0; i < name.length; i++) {
          if (!/\s/.test(name[i])) count++;
          if (count === half.length) return name.slice(0, i + 1).trim();
        }
      }
    }
    return name;
  }

  /** Clean a raw label from the Meet DOM into a display name ("" if unusable). */
  function normalizeName(raw) {
    if (raw == null) return "";
    let name = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, "");
    // Labels sometimes span several lines ("Jane Doe\nMeeting host"); keep the first.
    name = name.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "";
    name = name.replace(/\s+/g, " ").trim();
    let prev;
    do {
      prev = name;
      name = name.replace(SUFFIX_RE, "").replace(TRAILING_ROLE_RE, "").trim();
    } while (name !== prev);
    name = unDouble(name);
    return name;
  }

  /** True when the raw label marks the local user ("Jane (You)", "You"). */
  function isSelfLabel(raw) {
    if (!raw) return false;
    const s = String(raw).trim();
    return /\(\s*you\s*\)/i.test(s) || /^you$/i.test(s);
  }

  function isLikelyName(name) {
    if (!name) return false;
    const n = name.trim();
    if (n.length < 2 || n.length > 80) return false;
    if (/^you$/i.test(n)) return false;
    if (/^[\d\s\p{P}\p{S}_]+$/u.test(n)) return false; // digits / punctuation only
    if (/^(more_vert|mic_off|mic_none|keep|push_pin|frame_person|visual_effects|close|more_horiz)$/i.test(n)) return false;
    if (/_/.test(n) && !/\s/.test(n)) return false; // material icon ligatures
    const lower = n.toLowerCase();
    if (UI_PHRASES.some((p) => lower === p || lower.startsWith(p + " "))) return false;
    if (UI_WORD_RE.test(lower)) return false;
    return true;
  }

  function nameKey(name) {
    return normalizeName(name).normalize("NFKC").toLocaleLowerCase();
  }

  // ── Sessions ───────────────────────────────────────────────────────
  /**
   * Merge overlapping / adjacent sessions. `end: null` means "still open"
   * and is resolved to `openEnd` (defaults to Infinity while merging).
   * Sessions separated by <= gapMs are merged into one.
   */
  function mergeSessions(sessions, gapMs = 0) {
    const list = (sessions || [])
      .filter((s) => s && Number.isFinite(s.start))
      .map((s) => ({ start: s.start, end: s.end == null ? null : s.end }))
      .sort((a, b) => a.start - b.start);
    const out = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (last) {
        const lastEnd = last.end == null ? Infinity : last.end;
        if (s.start - lastEnd <= gapMs) {
          if (last.end != null) last.end = s.end == null ? null : Math.max(last.end, s.end);
          continue;
        }
      }
      out.push({ ...s });
    }
    return out;
  }

  function sessionsDuration(sessions, openEnd) {
    let total = 0;
    for (const s of mergeSessions(sessions)) {
      const end = s.end == null ? openEnd : s.end;
      if (Number.isFinite(end) && end > s.start) total += end - s.start;
    }
    return total;
  }

  // ── Tracker ────────────────────────────────────────────────────────
  function chatHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return "c" + (h >>> 0).toString(36);
  }

  const DEFAULT_TRACKER_OPTS = {
    graceMs: 10000, // absent this long before we record a leave (DOM flicker / tile paging)
    maxTickMs: 5000, // cap per-sample speaking delta (throttled background tabs)
  };

  function makeMeetingId(code, startedAt) {
    const d = new Date(startedAt);
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours()
    )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
    return `${code || "meet"}_${stamp}`;
  }

  class AttendanceTracker {
    constructor(meta = {}, opts = {}) {
      this.opts = Object.assign({}, DEFAULT_TRACKER_OPTS, opts);
      const startedAt = meta.startedAt != null ? meta.startedAt : Date.now();
      this.meta = {
        id: meta.id || makeMeetingId(meta.code, startedAt),
        code: meta.code || "",
        title: meta.title || "",
        url: meta.url || "",
        startedAt,
        endedAt: meta.endedAt != null ? meta.endedAt : null,
      };
      this.participants = new Map();
      this.chat = [];
      this._chatIds = new Set();
      this.lastUpdate = startedAt;
    }

    /**
     * Add chat messages scraped from the Meet chat panel. Messages are
     * de-duplicated by id (or sender+text+time label when Meet gives no id).
     * @param {Array<{id?:string,sender:string,text:string,time?:number,timeLabel?:string}>} msgs
     * @returns {number} number of new messages
     */
    addChat(msgs, now = Date.now()) {
      let added = 0;
      for (const m of msgs || []) {
        const text = String(m.text || "").trim();
        if (!text) continue;
        const sender = normalizeName(m.sender || "") || "Unknown";
        const id = m.id || chatHash(`${sender}|${text}|${m.timeLabel || ""}`);
        if (this._chatIds.has(id)) continue;
        this._chatIds.add(id);
        this.chat.push({ id, sender, text: text.slice(0, 4000), at: Number.isFinite(m.time) ? m.time : now });
        added++;
      }
      if (added) this.chat.sort((a, b) => a.at - b.at);
      return added;
    }

    get ended() {
      return this.meta.endedAt != null;
    }

    /**
     * Feed one observation of the call.
     * @param {Array<{name:string,key?:string,participantId?:string,isSelf?:boolean,speaking?:boolean,avatar?:string}>} snapshot
     * @param {number} now epoch ms
     * @returns {{joined:string[], left:string[], rejoined:string[]}}
     */
    update(snapshot, now = Date.now()) {
      const events = { joined: [], left: [], rejoined: [] };
      if (this.ended) return events;
      const seen = new Set();

      for (const item of snapshot || []) {
        const name = normalizeName(item.name);
        if (!name) continue;
        const key = item.key || nameKey(name);
        if (seen.has(key)) {
          // Same person reported by two strategies: merge the flags.
          const p = this.participants.get(key);
          if (item.speaking && p && !p.speaking) this._setSpeaking(p, true, now);
          continue;
        }
        seen.add(key);
        let p = this.participants.get(key);
        if (!p) {
          p = {
            key,
            name,
            participantId: item.participantId || null,
            avatar: item.avatar || null,
            isSelf: !!item.isSelf,
            firstSeen: now,
            lastSeen: now,
            sessions: [{ start: now, end: null }],
            speakingMs: 0,
            speaking: false,
            speakTick: null,
            present: true,
            missingSince: null,
          };
          this.participants.set(key, p);
          events.joined.push(name);
        } else {
          if (!p.present) {
            // Rejoin after a recorded leave: new session.
            p.sessions.push({ start: now, end: null });
            p.present = true;
            events.rejoined.push(name);
          }
          p.missingSince = null; // reappeared inside grace window: same session continues
          if (name.length > p.name.length && nameKey(name) === key) p.name = name;
          if (item.participantId) p.participantId = item.participantId;
          if (item.avatar && !p.avatar) p.avatar = item.avatar;
          if (item.isSelf) p.isSelf = true;
          p.lastSeen = now;
        }
        this._setSpeaking(p, !!item.speaking, now);
      }

      for (const p of this.participants.values()) {
        if (!p.present || seen.has(p.key)) continue;
        if (p.speaking) this._setSpeaking(p, false, now);
        if (p.missingSince == null) p.missingSince = now;
        if (now - p.missingSince >= this.opts.graceMs) {
          this._closeSession(p, p.lastSeen);
          events.left.push(p.name);
        }
      }
      this.lastUpdate = now;
      return events;
    }

    _setSpeaking(p, speaking, now) {
      // Sample-and-hold: time between two observations counts as speaking
      // when the participant was speaking at the earlier observation.
      if (p.speaking && p.speakTick != null) {
        p.speakingMs += Math.max(0, Math.min(now - p.speakTick, this.opts.maxTickMs));
      }
      p.speaking = speaking;
      p.speakTick = speaking ? now : null;
    }

    _closeSession(p, end) {
      const s = p.sessions[p.sessions.length - 1];
      if (s && s.end == null) s.end = Math.max(s.start, end);
      p.present = false;
      p.missingSince = null;
      p.speaking = false;
      p.speakTick = null;
    }

    /** End of meeting: close every open session. */
    finalize(now = Date.now()) {
      if (this.ended) return;
      for (const p of this.participants.values()) {
        if (p.speaking) this._setSpeaking(p, false, now);
        if (p.present) {
          const end = p.missingSince != null ? p.lastSeen : now;
          if (p.missingSince == null) p.lastSeen = now;
          this._closeSession(p, end);
        }
      }
      this.meta.endedAt = now;
      this.lastUpdate = now;
    }

    toRecord(now = Date.now()) {
      return {
        version: RECORD_VERSION,
        ...this.meta,
        updatedAt: now,
        chat: this.chat.map((c) => ({ ...c })),
        participants: [...this.participants.values()].map((p) => ({
          key: p.key,
          name: p.name,
          participantId: p.participantId,
          avatar: p.avatar,
          isSelf: p.isSelf,
          firstSeen: p.firstSeen,
          lastSeen: p.lastSeen,
          sessions: p.sessions.map((s) => ({ start: s.start, end: s.end })),
          speakingMs: Math.round(p.speakingMs),
          speaking: p.speaking,
          speakTick: p.speakTick,
          present: p.present,
          missingSince: p.missingSince,
        })),
      };
    }

    /**
     * Resume from a stored record (e.g. after the Meet tab reloads).
     * Everyone who was present is treated as "missing since resumeAt" so the
     * normal grace logic decides whether their session continues or closes.
     */
    static fromRecord(record, opts = {}, resumeAt = Date.now()) {
      const t = new AttendanceTracker(record, opts);
      for (const r of record.participants || []) {
        const p = {
          key: r.key || nameKey(r.name),
          name: r.name,
          participantId: r.participantId || null,
          avatar: r.avatar || null,
          isSelf: !!r.isSelf,
          firstSeen: r.firstSeen,
          lastSeen: r.lastSeen,
          sessions: (r.sessions || []).map((s) => ({ start: s.start, end: s.end })),
          speakingMs: r.speakingMs || 0,
          speaking: false,
          speakTick: null,
          present: !!r.present && !record.endedAt,
          missingSince: null,
        };
        // Give everyone a full grace window from the moment we resume; if they
        // don't reappear, their session still closes at their real lastSeen.
        if (p.present) p.missingSince = r.missingSince != null ? r.missingSince : resumeAt;
        t.participants.set(p.key, p);
      }
      for (const c of record.chat || []) {
        t.chat.push({ ...c });
        t._chatIds.add(c.id);
      }
      t.lastUpdate = record.updatedAt || resumeAt;
      return t;
    }
  }

  /**
   * Derived per-participant numbers for a record (live or stored).
   * `now` is used for still-open sessions; defaults to endedAt/updatedAt.
   */
  function computeRows(record, now) {
    const at = now != null ? now : record.endedAt != null ? record.endedAt : record.updatedAt || Date.now();
    const rows = (record.participants || []).map((p) => {
      const inCallNow = p.present && p.missingSince == null && record.endedAt == null;
      const openEnd = p.present ? (p.missingSince != null ? p.lastSeen : at) : null;
      let speakingMs = p.speakingMs || 0;
      if (p.speaking && p.speakTick != null && record.endedAt == null) speakingMs += Math.max(0, at - p.speakTick);
      return {
        key: p.key,
        name: p.name,
        isSelf: !!p.isSelf,
        avatar: p.avatar || null,
        firstSeen: p.firstSeen,
        lastSeen: inCallNow ? Math.max(p.lastSeen, at) : p.lastSeen,
        timeInCallMs: sessionsDuration(p.sessions, openEnd),
        speakingMs,
        joins: mergeSessions(p.sessions).length,
        present: inCallNow,
        speaking: !!p.speaking && inCallNow,
      };
    });
    rows.sort((a, b) => a.firstSeen - b.firstSeen || a.name.localeCompare(b.name));
    return rows;
  }

  /**
   * Copy of a record with every open session closed at `at` (used when a
   * Meet tab disappears without a clean end, e.g. the tab is closed).
   */
  function closeRecord(record, at) {
    const rec = JSON.parse(JSON.stringify(record));
    for (const p of rec.participants || []) {
      if (p.speaking && p.speakTick != null) p.speakingMs = (p.speakingMs || 0) + Math.max(0, at - p.speakTick);
      if (p.present) {
        const end = p.missingSince != null ? p.lastSeen : at;
        if (p.missingSince == null) p.lastSeen = Math.max(p.lastSeen, at);
        const s = p.sessions[p.sessions.length - 1];
        if (s && s.end == null) s.end = Math.max(s.start, end);
      }
      p.present = false;
      p.speaking = false;
      p.speakTick = null;
      p.missingSince = null;
    }
    if (rec.endedAt == null) rec.endedAt = at;
    rec.updatedAt = at;
    return rec;
  }

  /** Apply user settings (ignore own name) to computed rows. */
  function filterRows(rows, settings = {}) {
    if (!settings.ignoreSelf) return rows;
    const selfKey = settings.selfName ? nameKey(settings.selfName) : null;
    return rows.filter((r) => !r.isSelf && (!selfKey || r.key !== selfKey));
  }

  function meetingDuration(record, now) {
    const end = record.endedAt != null ? record.endedAt : now != null ? now : record.updatedAt || Date.now();
    return Math.max(0, end - record.startedAt);
  }

  // ── Formatting ─────────────────────────────────────────────────────
  const pad2 = (n) => String(n).padStart(2, "0");

  /** "01:02:05" (spreadsheet friendly). */
  function formatClock(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  /** "1h 02m", "4m 05s", "12s" (UI friendly). */
  function formatDuration(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${pad2(m)}m`;
    if (m) return `${m}m ${pad2(s)}s`;
    return `${s}s`;
  }

  function formatTime(ts, timeFormat = "24h", withSeconds = true) {
    if (ts == null) return "";
    const d = new Date(ts);
    const s = withSeconds ? `:${pad2(d.getSeconds())}` : "";
    if (timeFormat === "12h") {
      const h = d.getHours() % 12 || 12;
      return `${h}:${pad2(d.getMinutes())}${s} ${d.getHours() < 12 ? "AM" : "PM"}`;
    }
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}${s}`;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatDateTime(ts, timeFormat) {
    return `${formatDate(ts)} ${formatTime(ts, timeFormat, false)}`;
  }

  /** e.g. "meet-attendance_abc-defg-hij_2026-10-09_1405.csv" */
  function exportFileName(record, ext) {
    const d = new Date(record.startedAt);
    const slug = (record.code || record.title || "meeting")
      .toString()
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "meeting";
    return `meet-attendance_${slug}_${formatDate(record.startedAt)}_${pad2(d.getHours())}${pad2(d.getMinutes())}.${ext}`;
  }

  const MEET_CODE_RE = /^\/([a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4})(?:$|[/?#])/i;
  function meetingCodeFromUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(MEET_CODE_RE);
      return m ? m[1].toLowerCase() : null;
    } catch (_) {
      return null;
    }
  }

  return {
    RECORD_VERSION,
    normalizeName,
    isSelfLabel,
    isLikelyName,
    nameKey,
    mergeSessions,
    sessionsDuration,
    AttendanceTracker,
    makeMeetingId,
    computeRows,
    closeRecord,
    filterRows,
    meetingDuration,
    formatClock,
    formatDuration,
    formatTime,
    formatDate,
    formatDateTime,
    exportFileName,
    meetingCodeFromUrl,
  };
});
