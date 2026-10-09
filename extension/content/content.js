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
  const TICK_MS = 1000;
  const LIVE_EVERY_MS = 2500;
  const END_CHECK_MS = 2000;
  const RESUME_WINDOW_MS = 15 * 60 * 1000;
  const SS_KEY = "mat:state";

  let settings = M.sanitizeSettings({});
  let tracker = null;
  let persisted = false; // this meeting exists in history → keep it updated
  let lastSaveAt = 0;
  let lastLiveAt = 0;
  let lastEndCheck = 0;
  let panel = null;
  let alive = true;
  let tickTimer = null;
  let observer = null;
  let debounce = null;

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
    const record = tracker.toRecord(now);
    const present = M.computeRows(record, now).filter((r) => r.present).length;
    try {
      await M.setLive(tabKey, { record, persisted, present });
      chrome.runtime.sendMessage({ type: "mat:badge", count: present }).catch(() => {});
    } catch (_) {}
  }

  async function endMeeting(now, reason) {
    if (!tracker || tracker.ended) return;
    log("Meeting ended:", reason);
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
      tracker =
        tryResume(code, now) ||
        new M.AttendanceTracker(
          { code, title: M.meetingTitle(document), url: location.origin + location.pathname, startedAt: now },
          trackerOpts()
        );
      lastSaveAt = 0;
      log("Tracking", tracker.meta.id);
    }
    if (tracker.ended) {
      renderPanel(now);
      return;
    }

    if (!tracker.meta.title) tracker.meta.title = M.meetingTitle(document);
    const ev = tracker.update(participants, now);
    const changed = ev.joined.length || ev.left.length || ev.rejoined.length;
    if (changed) log("joined", ev.joined, "left", ev.left, "rejoined", ev.rejoined);

    if ((settings.autoSave || persisted) && (now - lastSaveAt >= settings.autoSaveIntervalSec * 1000 || (changed && now - lastSaveAt > 2000))) {
      save("auto", now);
    } else if (now - lastSaveAt > 5000) {
      stashSession();
    }
    if (changed || now - lastLiveAt >= LIVE_EVERY_MS) publishLive(now);
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
    if (!tracker) return settings.autoSave ? "Auto-save is on" : "Auto-save is off";
    if (persisted && lastSaveAt) {
      const s = Math.round((now - lastSaveAt) / 1000);
      return `${tracker.ended ? "Saved" : "Auto-saved"} ${s < 2 ? "just now" : s + "s ago"}`;
    }
    return settings.autoSave ? "Auto-save is on" : "Auto-save off · use Save now";
  }

  function renderPanel(now) {
    if (!panel) return;
    const inMeet = !!M.meetingCodeFromUrl(location.href);
    panel.setVisible(settings.showMeetButton && inMeet);
    if (!inMeet) return;
    const record = tracker ? tracker.toRecord(now) : null;
    panel.render({
      code: record ? record.code : M.meetingCodeFromUrl(location.href),
      title: record ? record.title : "",
      active: !!tracker && !tracker.ended,
      rows: record ? M.filterRows(M.computeRows(record, now), settings) : [],
      durationMs: record ? M.meetingDuration(record, now) : 0,
      settings,
      savedLabel: savedLabel(now),
    });
  }

  function exportNow(fmt) {
    if (!tracker) return panel.toast("Nothing to export yet");
    const now = Date.now();
    const file = M.exportRecord(tracker.toRecord(now), fmt, settings, now);
    M.downloadFile(file);
    panel.toast(`Exported ${file.filename}`);
  }

  // ── Wiring ─────────────────────────────────────────────────────────
  async function init() {
    try {
      settings = await M.getSettings();
    } catch (_) {}

    panel = M.createPanel({
      onSave: async () => {
        if (!tracker) return panel.toast("No participants detected yet");
        await save("manual");
        panel.toast("Attendance saved");
        renderPanel(Date.now());
      },
      onExport: exportNow,
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
        renderPanel(Date.now());
      }
      const cmd = changes.cmd && changes.cmd.newValue;
      if (cmd && (!cmd.target || cmd.target === tabKey) && Date.now() - cmd.at < 10000) {
        if (cmd.type === "save" && tracker) save("manual").then(() => panel.toast("Attendance saved"));
      }
    });

    observer = new MutationObserver(scheduleTick);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-participant-id", "data-self-name", "aria-label", "class", "data-is-speaking", "data-speaking"],
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
