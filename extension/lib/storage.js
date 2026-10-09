/*
 * Meet Attendance Tracker: local persistence (chrome.storage.local only).
 *
 * Keys:
 *   settings        user preferences
 *   m:<meetingId>   saved meeting record (history)
 *   live:<tabKey>   live snapshot of a call in progress (heartbeat for the popup)
 *   cmd             last command from popup/dashboard to the Meet tab(s)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    autoSave: true, // save the attendance list automatically during the call
    autoSaveIntervalSec: 15,
    ignoreSelf: false, // hide my own entry in lists and exports
    selfName: "", // optional: my display name, in case Meet doesn't mark "(You)"
    timeFormat: "24h", // "24h" | "12h"
    showMeetButton: true, // in-Meet floating button + panel
    leaveGraceSec: 10, // absence needed before a leave is recorded
    // Attendance rules
    lateThresholdMin: 5, // joined more than N minutes after the start → Late
    minPresenceMode: "minutes", // "minutes" | "percent"
    minPresenceValue: 0, // 0 = off; below this → "Too short"
    // Extras
    captureChat: true, // save Meet chat messages (only those rendered in the chat panel)
    notifyJoinLeave: true, // toast in the Meet panel on joins/leaves
    notifySound: false, // short beep with the toast
    theme: "system", // "system" | "light" | "dark"
  });

  const MEETING_PREFIX = "m:";
  const ROSTER_PREFIX = "roster:";
  const LIVE_PREFIX = "live:";
  const LIVE_STALE_MS = 20000;

  const area = () => chrome.storage.local;

  function sanitizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    out.autoSave = !!out.autoSave;
    out.ignoreSelf = !!out.ignoreSelf;
    out.showMeetButton = !!out.showMeetButton;
    out.timeFormat = out.timeFormat === "12h" ? "12h" : "24h";
    out.selfName = String(out.selfName || "").slice(0, 80);
    out.autoSaveIntervalSec = Math.min(300, Math.max(5, Number(out.autoSaveIntervalSec) || DEFAULT_SETTINGS.autoSaveIntervalSec));
    out.leaveGraceSec = Math.min(120, Math.max(1, Number(out.leaveGraceSec) || DEFAULT_SETTINGS.leaveGraceSec));
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
    out.lateThresholdMin = Math.min(600, Math.max(0, num(out.lateThresholdMin, DEFAULT_SETTINGS.lateThresholdMin)));
    out.minPresenceMode = out.minPresenceMode === "percent" ? "percent" : "minutes";
    out.minPresenceValue = Math.min(out.minPresenceMode === "percent" ? 100 : 600, Math.max(0, num(out.minPresenceValue, 0)));
    out.captureChat = !!out.captureChat;
    out.notifyJoinLeave = !!out.notifyJoinLeave;
    out.notifySound = !!out.notifySound;
    out.theme = ["light", "dark"].includes(out.theme) ? out.theme : "system";
    return out;
  }

  async function getSettings() {
    const { settings } = await area().get("settings");
    return sanitizeSettings(settings);
  }

  async function setSettings(patch) {
    const next = sanitizeSettings(Object.assign(await getSettings(), patch || {}));
    await area().set({ settings: next });
    return next;
  }

  // Fields the user edits in the dashboard; a save coming from the live Meet
  // tab must never overwrite them.
  const USER_FIELDS = ["tags", "notes", "rosterId", "titleEdited"];

  async function saveMeeting(record, via, opts = {}) {
    const rec = Object.assign({}, record, { savedAt: Date.now() });
    if (via) rec.savedVia = via;
    if (opts.preserveUserFields !== false) {
      const prev = await getMeeting(rec.id);
      if (prev) {
        for (const f of USER_FIELDS) if (prev[f] !== undefined) rec[f] = prev[f];
        if (prev.titleEdited) rec.title = prev.title;
        if (prev.savedVia === "manual" && via === "auto") rec.savedVia = "manual";
      }
    }
    await area().set({ [MEETING_PREFIX + rec.id]: rec });
    return rec;
  }

  async function getMeeting(id) {
    const key = MEETING_PREFIX + id;
    const res = await area().get(key);
    return res[key] || null;
  }

  async function listMeetings() {
    const all = await area().get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(MEETING_PREFIX))
      .map((k) => all[k])
      .filter((r) => r && r.id)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async function deleteMeeting(id) {
    await area().remove(MEETING_PREFIX + id);
  }

  async function deleteAllMeetings() {
    const all = await area().get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(MEETING_PREFIX));
    if (keys.length) await area().remove(keys);
    return keys.length;
  }

  /** Shallow-merge a patch (title, tags, notes, rosterId…) into a saved meeting. */
  async function updateMeeting(id, patch) {
    const rec = await getMeeting(id);
    if (!rec) return null;
    const next = Object.assign({}, rec, patch);
    await area().set({ [MEETING_PREFIX + id]: next });
    return next;
  }

  // ── Rosters (expected attendees) ───────────────────────────────────
  async function listRosters() {
    const all = await area().get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(ROSTER_PREFIX))
      .map((k) => all[k])
      .filter((r) => r && r.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function saveRoster(roster) {
    const r = Object.assign({ codes: [], members: [] }, roster);
    if (!r.id) r.id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    r.name = String(r.name || "Untitled roster").slice(0, 120);
    r.codes = [...new Set((r.codes || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean))];
    r.updatedAt = Date.now();
    await area().set({ [ROSTER_PREFIX + r.id]: r });
    return r;
  }

  async function deleteRoster(id) {
    await area().remove(ROSTER_PREFIX + id);
  }

  /** Roster explicitly chosen for the meeting, else the first roster linked to its meeting code. */
  function pickRoster(record, rosters) {
    if (!record) return null;
    if (record.rosterId === "none") return null;
    if (record.rosterId) {
      const r = rosters.find((x) => x.id === record.rosterId);
      if (r) return r;
    }
    const code = (record.code || "").toLowerCase();
    return (code && rosters.find((x) => (x.codes || []).includes(code))) || null;
  }

  async function rosterForMeeting(record) {
    return pickRoster(record, await listRosters());
  }

  async function setLive(tabKey, payload) {
    await area().set({ [LIVE_PREFIX + tabKey]: Object.assign({ heartbeat: Date.now() }, payload) });
  }

  async function clearLive(tabKey) {
    await area().remove(LIVE_PREFIX + tabKey);
  }

  async function listLive(now = Date.now()) {
    const all = await area().get(null);
    const live = [];
    const stale = [];
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith(LIVE_PREFIX)) continue;
      if (v && now - v.heartbeat < LIVE_STALE_MS) live.push(Object.assign({ tabKey: k.slice(LIVE_PREFIX.length) }, v));
      else stale.push(k);
    }
    if (stale.length) area().remove(stale);
    return live.sort((a, b) => b.heartbeat - a.heartbeat);
  }

  /** Ask open Meet tabs to do something (e.g. save now). Delivered via storage.onChanged. */
  async function sendCommand(type, target) {
    await area().set({ cmd: { type, target: target || null, at: Date.now(), nonce: Math.random().toString(36).slice(2) } });
  }

  return {
    DEFAULT_SETTINGS,
    MEETING_PREFIX,
    LIVE_PREFIX,
    ROSTER_PREFIX,
    updateMeeting,
    listRosters,
    saveRoster,
    deleteRoster,
    pickRoster,
    rosterForMeeting,
    sanitizeSettings,
    getSettings,
    setSettings,
    saveMeeting,
    getMeeting,
    listMeetings,
    deleteMeeting,
    deleteAllMeetings,
    setLive,
    clearLive,
    listLive,
    sendCommand,
  };
});
