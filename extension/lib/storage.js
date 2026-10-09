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
  });

  const MEETING_PREFIX = "m:";
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

  async function saveMeeting(record, via) {
    const rec = Object.assign({}, record, { savedAt: Date.now() });
    if (via) rec.savedVia = via;
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
