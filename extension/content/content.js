/*
 * Meet Attendance Tracker: content script controller for meet.google.com.
 * Wires detection → tracker → storage → in-Meet panel. All data stays in
 * chrome.storage.local; this script makes no network requests.
 */
(function () {
  "use strict";
  if (window.__matContentLoaded) return;
  window.__matContentLoaded = true;

  const M = globalThis.MAT;
  const t = M.t;
  const TICK_MS = 1000;
  const LIVE_EVERY_MS = 2500;
  const END_CHECK_MS = 2000;
  const RESUME_WINDOW_MS = 15 * 60 * 1000;
  const NOTIFY_WARMUP_MS = 5000; // don't toast the initial cast
  const SS_KEY = "mat:state";

  let settings = M.sanitizeSettings({});
  let rosters = [];
  let savedMeta = {}; // user-edited fields of the saved meeting (rosterId, tags, …)
  let tracker = null;
  let trackerSince = 0;
  let persisted = false; // this meeting exists in history → keep it updated
  let lastSaveAt = 0;
  let lastLiveAt = 0;
  let lastEndCheck = 0;
  let panel = null;
  let renderer = null;
  let alive = true;
  let tickTimer = null;
  let observer = null;
  let debounce = null;
  let audioCtx = null;

  const tabKey = (() => {
    try {
      let k = sessionStorage.getItem("mat:tab");
      if (!k) sessionStorage.setItem("mat:tab", (k = Math.random().toString(36).slice(2, 10)));
      return k;
    } catch (_) {
      return Math.random().toString(36).slice(2, 10);
    }
  })();

  const log = (...a) => console.debug("[Meet Attendance]", ...a);

  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function shutdown() {
    alive = false;
    clearInterval(tickTimer);
    if (observer) observer.disconnect();
  }

  const currentRecord = (now) => Object.assign(tracker.toRecord(now), pickUserFields(savedMeta));
  const pickUserFields = (m) => ({ rosterId: m.rosterId, tags: m.tags, notes: m.notes, ...(m.titleEdited ? { title: m.title } : {}) });
  const rosterFor = (record) => M.pickRoster(record, rosters);

  // ── Persistence ────────────────────────────────────────────────────
  function stashSession() {
    if (!tracker) return;
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ record: tracker.toRecord(Date.now()), persisted }));
    } catch (_) {}
  }

  function tryResume(code, now) {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (!raw) return null;
      const { record, persisted: wasPersisted } = JSON.parse(raw);
      if (!record || record.code !== code || record.endedAt != null) return null;
      if (now - (record.updatedAt || 0) > RESUME_WINDOW_MS) return null;
      persisted = !!wasPersisted;
      log("Resuming meeting", record.id);
      return M.AttendanceTracker.fromRecord(record, trackerOpts(), now);
    } catch (_) {
      return null;
    }
  }

  const trackerOpts = () => ({ graceMs: settings.leaveGraceSec * 1000 });

  async function loadSavedMeta() {
    if (!tracker) return;
    try {
      const saved = await M.getMeeting(tracker.meta.id);
      savedMeta = saved || {};
    } catch (_) {}
  }

  async function save(via, now = Date.now()) {
    if (!tracker || !extAlive()) return;
    lastSaveAt = now;
    persisted = true;
    try {
      await M.saveMeeting(tracker.toRecord(now), via);
      stashSession();
    } catch (e) {
      log("Save failed", e);
    }
  }

  async function publishLive(now) {
    if (!tracker || !extAlive()) return;
    lastLiveAt = now;
    const record = currentRecord(now);
    const present = M.computeRows(record, now).filter((r) => r.present).length;
    try {
      await M.setLive(tabKey, { record, persisted, present });
      chrome.runtime.sendMessage({ type: "mat:badge", count: present }).catch(() => {});
    } catch (_) {}
  }

  async function endMeeting(now, reason) {
    if (!tracker || tracker.ended) return;
    log("Meeting ended:", reason);
    if (settings.captureChat) tracker.addChat(M.scanChat(document, now), now);
    tracker.finalize(now);
    if (settings.autoSave || persisted) await save("auto", now);
    try {
      sessionStorage.removeItem(SS_KEY);
      if (extAlive()) {
        await M.clearLive(tabKey);
        chrome.runtime.sendMessage({ type: "mat:badge", count: 0 }).catch(() => {});
      }
    } catch (_) {}
    renderPanel(now);
  }

  // ── Notifications ──────────────────────────────────────────────────
  function beep(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = kind === "leave" ? 520 : 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.26);
    } catch (_) {}
  }

  function notify(ev, now) {
    if (!settings.notifyJoinLeave || !panel || now - trackerSince < NOTIFY_WARMUP_MS) return;
    const skip = (name) => {
      if (!settings.ignoreSelf) return false;
      const p = tracker.participants.get(M.nameKey(name));
      return (p && p.isSelf) || (settings.selfName && M.nameKey(settings.selfName) === M.nameKey(name));
    };
    const items = [
      ...ev.joined.map((n) => [n, "join", t("notify_joined", n)]),
      ...ev.rejoined.map((n) => [n, "join", t("notify_rejoined", n)]),
      ...ev.left.map((n) => [n, "leave", t("notify_left", n)]),
    ].filter(([n]) => !skip(n));
    for (const [, kind, msg] of items) panel.toast(msg, kind);
    if (items.length && settings.notifySound) beep(items[0][1]);
  }

  // ── Main loop ──────────────────────────────────────────────────────
  function tick() {
    if (!alive) return;
    if (!extAlive()) return shutdown(); // extension reloaded/removed: go quiet
    const now = Date.now();
    const code = M.meetingCodeFromUrl(location.href);

    if (tracker && !tracker.ended) {
      if (code !== tracker.meta.code) {
        endMeeting(now, "navigated away");
      } else if (now - lastEndCheck >= END_CHECK_MS) {
        lastEndCheck = now;
        if (M.isEndScreen(document)) endMeeting(now, "end screen");
      }
    }

    if (!code) {
      renderPanel(now);
      return;
    }

    const { participants } = M.scanParticipants(document, { selfName: settings.selfName });

    if (!tracker || (tracker.ended && participants.length && !M.isEndScreen(document))) {
      if (!participants.length) {
        renderPanel(now);
        return;
      }
      persisted = false;
      savedMeta = {};
      tracker =
        tryResume(code, now) ||
        new M.AttendanceTracker(
          { code, title: M.meetingTitle(document), url: location.origin + location.pathname, startedAt: now },
          trackerOpts()
        );
      trackerSince = now;
      lastSaveAt = 0;
      loadSavedMeta();
      log("Tracking", tracker.meta.id);
    }
    if (tracker.ended) {
      renderPanel(now);
      return;
    }

    if (!tracker.meta.title) tracker.meta.title = M.meetingTitle(document);
    const ev = tracker.update(participants, now);
    const chatAdded = settings.captureChat ? tracker.addChat(M.scanChat(document, now), now) : 0;
    const changed = ev.joined.length || ev.left.length || ev.rejoined.length;
    if (changed) {
      log("joined", ev.joined, "left", ev.left, "rejoined", ev.rejoined);
      notify(ev, now);
    }

    if ((settings.autoSave || persisted) && (now - lastSaveAt >= settings.autoSaveIntervalSec * 1000 || ((changed || chatAdded) && now - lastSaveAt > 2000))) {
      save("auto", now);
    } else if (now - lastSaveAt > 5000) {
      stashSession();
    }
    if (changed || chatAdded || now - lastLiveAt >= LIVE_EVERY_MS) publishLive(now);
    renderPanel(now);
  }

  function scheduleTick() {
    if (debounce) return;
    debounce = setTimeout(() => {
      debounce = null;
      tick();
    }, 250);
  }

  // ── Panel ──────────────────────────────────────────────────────────
  function savedLabel(now) {
    if (!tracker) return settings.autoSave ? t("panel_autosaveOn") : t("panel_autosaveOff");
    if (persisted && lastSaveAt) {
      const s = Math.round((now - lastSaveAt) / 1000);
      return s < 2 ? t("panel_savedJustNow") : t("panel_savedAgo", String(s));
    }
    return settings.autoSave ? t("panel_autosaveOn") : t("panel_autosaveOffHint");
  }

  function renderPanel(now) {
    if (!panel) return;
    const inMeet = !!M.meetingCodeFromUrl(location.href);
    panel.setVisible(settings.showMeetButton && inMeet);
    if (!inMeet) return;
    const record = tracker ? currentRecord(now) : null;
    const ev = record ? M.evaluateAttendance(record, { settings, now, roster: rosterFor(record) }) : null;
    panel.render({
      code: record ? record.code : M.meetingCodeFromUrl(location.href),
      title: record ? record.title : "",
      active: !!tracker && !tracker.ended,
      rows: ev ? ev.rows : [],
      absentees: ev ? ev.absentees : [],
      summary: ev ? ev.summary : null,
      durationMs: record ? M.meetingDuration(record, now) : 0,
      settings,
      savedLabel: savedLabel(now),
      chatCount: record && record.chat ? record.chat.length : 0,
    });
  }

  function exportNow(fmt) {
    if (!tracker) return panel.toast(t("toast_nothingToExport"));
    const now = Date.now();
    const record = currentRecord(now);
    if (fmt === "pdf" && !renderer) renderer = M.createTextRenderer();
    const file = M.exportRecord(record, fmt, settings, now, { roster: rosterFor(record), renderer });
    M.downloadFile(file);
    panel.toast(t("toast_exported", file.filename));
  }

  async function copyNow() {
    if (!tracker) return panel.toast(t("toast_nothingToExport"));
    const now = Date.now();
    const record = currentRecord(now);
    const table = M.buildTable(record, settings, now, { roster: rosterFor(record) });
    const ok = await M.copyText(M.toTSV(table));
    panel.toast(ok ? t("toast_copied") : t("toast_copyFailed"));
  }

  async function saveNow() {
    if (!tracker) return panel.toast(t("toast_noParticipants"));
    await save("manual");
    panel.toast(t("toast_saved"));
    renderPanel(Date.now());
  }

  // ── Wiring ─────────────────────────────────────────────────────────
  async function init() {
    try {
      [settings, rosters] = await Promise.all([M.getSettings(), M.listRosters()]);
    } catch (_) {}

    panel = M.createPanel({
      onSave: saveNow,
      onExport: exportNow,
      onCopy: copyNow,
      onDashboard: () => {
        const id = tracker && persisted ? tracker.meta.id : null;
        chrome.runtime.sendMessage({ type: "mat:open-dashboard", id }).catch(() => {});
      },
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.settings) {
        settings = M.sanitizeSettings(changes.settings.newValue);
        if (tracker) tracker.opts.graceMs = settings.leaveGraceSec * 1000;
      }
      if (Object.keys(changes).some((k) => k.startsWith(M.ROSTER_PREFIX))) M.listRosters().then((r) => (rosters = r));
      if (tracker && changes[M.MEETING_PREFIX + tracker.meta.id]) savedMeta = changes[M.MEETING_PREFIX + tracker.meta.id].newValue || {};
      const cmd = changes.cmd && changes.cmd.newValue;
      if (cmd && (!cmd.target || cmd.target === tabKey) && Date.now() - cmd.at < 10000) {
        if (cmd.type === "save" && tracker) save("manual").then(() => panel.toast(t("toast_saved")));
      }
      renderPanel(Date.now());
    });

    // Keyboard shortcuts (chrome.commands → background → this tab).
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "mat:command") return;
      if (msg.command === "toggle-panel") {
        panel.setOpen(!panel.isOpen());
        renderPanel(Date.now());
      } else if (msg.command === "save-now") saveNow();
      sendResponse({ ok: true });
    });

    observer = new MutationObserver(scheduleTick);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-participant-id", "data-self-name", "aria-label", "class", "data-is-speaking", "data-speaking", "data-message-id"],
    });
    tickTimer = setInterval(tick, TICK_MS);

    // Tab closing / reloading: persist a closed copy to history, keep an open
    // copy in sessionStorage so a reload resumes the same meeting.
    window.addEventListener("pagehide", () => {
      if (!tracker || tracker.ended || !extAlive()) return;
      const now = Date.now();
      stashSession();
      if (settings.autoSave || persisted) {
        try {
          M.saveMeeting(M.closeRecord(tracker.toRecord(now), now), "auto");
          M.clearLive(tabKey);
        } catch (_) {}
      }
    });

    tick();
  }

  init();
})();
