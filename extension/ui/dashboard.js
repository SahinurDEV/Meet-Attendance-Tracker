(function () {
  "use strict";
  const M = globalThis.MAT;
  const { h, avatar, toast, exportAndDownload } = globalThis.UI;
  const view = document.getElementById("view");
  let settings = M.sanitizeSettings({});
  let query = "";
  let sort = "newest";
  let refreshTimer = null;

  // ── Data ───────────────────────────────────────────────────────────
  async function loadAll() {
    const [saved, live] = await Promise.all([M.listMeetings(), M.listLive()]);
    const byId = new Map(saved.map((m) => [m.id, { record: m, live: false, saved: true }]));
    for (const l of live) {
      const prev = byId.get(l.record.id);
      // Live data is fresher than the last save; keep the saved title/flags.
      const record = prev ? { ...l.record, title: prev.record.title || l.record.title, savedAt: prev.record.savedAt, savedVia: prev.record.savedVia } : l.record;
      byId.set(l.record.id, { record, live: true, saved: !!prev, tabKey: l.tabKey });
    }
    return [...byId.values()];
  }

  function summarize(entry) {
    const now = entry.live ? Date.now() : undefined;
    const rows = M.filterRows(M.computeRows(entry.record, now), settings);
    return {
      ...entry,
      rows,
      durationMs: M.meetingDuration(entry.record, now),
      speakingMs: rows.reduce((n, r) => n + r.speakingMs, 0),
    };
  }

  function matchesQuery(s, q) {
    if (!q) return true;
    const r = s.record;
    const hay = [r.title, r.code, M.formatDate(r.startedAt), ...s.rows.map((x) => x.name)].join(" \u0001 ").toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((t) => hay.includes(t));
  }

  // ── Modal ──────────────────────────────────────────────────────────
  function confirmDialog(title, body, okLabel = "Delete") {
    const modal = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").textContent = body;
    const ok = document.getElementById("modalOk");
    const cancel = document.getElementById("modalCancel");
    ok.textContent = okLabel;
    modal.hidden = false;
    ok.focus();
    return new Promise((resolve) => {
      const done = (v) => {
        modal.hidden = true;
        ok.onclick = cancel.onclick = modal.onclick = document.onkeydown = null;
        resolve(v);
      };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      modal.onclick = (e) => e.target === modal && done(false);
      document.onkeydown = (e) => e.key === "Escape" && done(false);
    });
  }

  // ── Views ──────────────────────────────────────────────────────────
  function statCard(k, v, small) {
    return h("div.card.stat", h("div.k", k), h("div.v", v, small ? h("small", " " + small) : null));
  }

  async function renderMeetings(welcome) {
    const entries = (await loadAll()).map(summarize);
    const unique = new Set();
    let totalMs = 0;
    for (const s of entries) {
      s.rows.forEach((r) => unique.add(r.key));
      totalMs += s.durationMs;
    }
    const avg = entries.length ? Math.round(entries.reduce((n, s) => n + s.rows.length, 0) / entries.length) : 0;

    const sorters = {
      newest: (a, b) => b.record.startedAt - a.record.startedAt,
      oldest: (a, b) => a.record.startedAt - b.record.startedAt,
      people: (a, b) => b.rows.length - a.rows.length,
      longest: (a, b) => b.durationMs - a.durationMs,
    };

    const search = h("input", { type: "search", placeholder: "Search by meeting, code, date or participant…", value: query, "aria-label": "Search meetings" });
    search.addEventListener("input", () => {
      query = search.value;
      renderTable();
    });
    const sortSel = h("select", { "aria-label": "Sort meetings" },
      [["newest", "Newest first"], ["oldest", "Oldest first"], ["people", "Most participants"], ["longest", "Longest"]].map(([v, l]) =>
        h("option", { value: v, selected: v === sort }, l)));
    sortSel.addEventListener("change", () => {
      sort = sortSel.value;
      renderMeetings();
    });

    const tableBox = h("div.card", { id: "meetingTable" });
    function renderTable() {
      const rows = entries.filter((s) => matchesQuery(s, query)).sort(sorters[sort]);
      tableBox.replaceChildren();
      if (!rows.length) {
        tableBox.append(h("div.empty", entries.length ? "No meetings match your search." : "No meetings yet. Join a Google Meet call and your attendance list will appear here."));
        return;
      }
      tableBox.append(
        h("table",
          h("thead", h("tr", h("th", "Meeting"), h("th", "Date"), h("th.hide-sm", "Duration"), h("th", "People"), h("th.hide-sm", "Saved"), h("th", ""))),
          h("tbody", rows.map((s) => {
            const r = s.record;
            const open = () => (location.hash = `#/meeting/${encodeURIComponent(r.id)}`);
            return h("tr.click", { "data-id": r.id, onclick: open },
              h("td", h("div.mtitle", r.title || r.code || "Google Meet", s.live ? [" ", h("span.chip.live", "Live")] : null), h("div.msub", r.code)),
              h("td.num", M.formatDate(r.startedAt), h("div.msub", M.formatTime(r.startedAt, settings.timeFormat, false))),
              h("td.num.hide-sm", M.formatClock(s.durationMs)),
              h("td.num", h("b", String(s.rows.length))),
              h("td.hide-sm", h("span.chip.gray", !s.saved ? "not saved" : r.savedVia === "manual" ? "manual" : "auto")),
              h("td", h("div.row-actions",
                h("button.btn.sm", { onclick: (e) => { e.stopPropagation(); open(); } }, "View"),
                h("button.btn.sm", { title: "Download CSV", onclick: (e) => { e.stopPropagation(); exportAndDownload(r, "csv", settings); } }, "CSV"),
                s.live ? null : h("button.btn.sm.danger", { "aria-label": `Delete ${r.title || r.code}`, onclick: (e) => { e.stopPropagation(); remove(r); } }, "Delete"))));
          })))
      );
    }
    renderTable();

    view.replaceChildren(
      ...[welcome
        ? h("div.card.welcome", h("div", h("h2", "Welcome to Meet Attendance Tracker 👋"),
            h("p", "Join any Google Meet call: attendance is recorded automatically and saved here. Everything stays on this device.")),
            h("button.btn", { onclick: () => (location.hash = "#/meetings") }, "Got it"))
        : null,
      h("div.page-head", h("div", h("h1", "Meetings"), h("p", "Your attendance history, stored locally in this browser."))),
      h("div.stats",
        statCard("Meetings", String(entries.length)),
        statCard("Unique people", String(unique.size)),
        statCard("Total meeting time", M.formatDuration(totalMs)),
        statCard("Avg. attendance", String(avg), "per meeting")),
      h("div.toolbar", h("div.search", search), sortSel),
      tableBox,
    ].filter(Boolean));
  }

  async function remove(record) {
    const ok = await confirmDialog("Delete this meeting?", `“${record.title || record.code}” on ${M.formatDate(record.startedAt)} will be permanently removed from this device.`);
    if (!ok) return;
    await M.deleteMeeting(record.id);
    toast("Meeting deleted");
    if (location.hash.startsWith("#/meeting/")) location.hash = "#/meetings";
    else route();
  }

  async function renderDetail(id) {
    const entry = (await loadAll()).find((e) => e.record.id === id);
    if (!entry) {
      view.replaceChildren(h("a.back", { href: "#/meetings" }, "← All meetings"), h("div.card.empty", "This meeting no longer exists."));
      return;
    }
    const s = summarize(entry);
    const r = s.record;
    const now = entry.live ? Date.now() : undefined;
    const span = Math.max(1, s.durationMs);
    const end = r.startedAt + span;
    const maxSpk = Math.max(1, ...s.rows.map((x) => x.speakingMs));
    const avgIn = s.rows.length ? s.rows.reduce((n, x) => n + x.timeInCallMs, 0) / s.rows.length : 0;
    const sessionsByKey = new Map((r.participants || []).map((p) => [p.key, M.mergeSessions(p.sessions)]));

    const title = h("input.title-input", { value: r.title || r.code || "Google Meet", "aria-label": "Meeting title", disabled: entry.live });
    title.addEventListener("change", async () => {
      const rec = await M.getMeeting(r.id);
      if (!rec) return;
      rec.title = title.value.trim().slice(0, 120);
      await M.saveMeeting(rec);
      toast("Title updated");
    });

    view.replaceChildren(
      h("a.back", { href: "#/meetings" }, "← All meetings"),
      h("div.detail-head",
        h("div", title,
          h("div.chips",
            entry.live ? h("span.chip.live", "Live") : null,
            h("span.chip.gray", r.code),
            h("span.chip.gray", `${M.formatDate(r.startedAt)} · ${M.formatTime(r.startedAt, settings.timeFormat, false)} – ${r.endedAt ? M.formatTime(r.endedAt, settings.timeFormat, false) : entry.live ? "now" : M.formatTime(r.updatedAt, settings.timeFormat, false)}`),
            r.url ? h("a.chip.gray", { href: r.url, target: "_blank", rel: "noopener" }, "Open in Meet ↗") : null)),
        h("div.btn-group",
          ...["csv", "xlsx", "pdf"].map((f) => h("button.btn" + (f === "csv" ? ".primary" : ""), { "data-export": f, onclick: () => exportAndDownload(r, f, settings, now) }, `Export ${f.toUpperCase()}`)),
          entry.live ? null : h("button.btn.danger", { onclick: () => remove(r) }, "Delete"))),
      h("div.stats",
        statCard("Participants", String(s.rows.length)),
        statCard("Duration", M.formatDuration(s.durationMs)),
        statCard("Avg. time in call", M.formatDuration(avgIn)),
        statCard("Total speaking", M.formatDuration(s.speakingMs))),
      h("div.card",
        s.rows.length
          ? h("table", { id: "participantsTable" },
              h("thead", h("tr", h("th", "Name"), h("th", "First seen"), h("th", "Last seen"), h("th", "Time in call"), h("th", "Speaking"), h("th.hide-sm", "Presence timeline"))),
              h("tbody", s.rows.map((p) =>
                h("tr", { "data-name": p.name },
                  h("td", h("div.who", avatar(p.name), h("div", h("b", p.name), p.isSelf ? h("span.you", "YOU") : null,
                    h("div.msub", p.present ? "In call now" : `${p.joins} ${p.joins === 1 ? "session" : "sessions"}`)))),
                  h("td.num", M.formatTime(p.firstSeen, settings.timeFormat)),
                  h("td.num", M.formatTime(p.lastSeen, settings.timeFormat)),
                  h("td.num", h("b", M.formatClock(p.timeInCallMs))),
                  h("td", h("div.spk", h("div.bar", h("i", { style: { width: `${Math.round((p.speakingMs / maxSpk) * 100)}%` } })), h("span.num", M.formatClock(p.speakingMs)))),
                  h("td.hide-sm", h("div.timeline", { title: "Time in call across the meeting" },
                    (sessionsByKey.get(p.key) || []).map((x) => {
                      const a = Math.max(0, (x.start - r.startedAt) / span);
                      const b = Math.min(1, ((x.end == null ? (now || end) : x.end) - r.startedAt) / span);
                      return h("i", { style: { left: `${a * 100}%`, width: `${Math.max(0.8, (b - a) * 100)}%` } });
                    })))))))
          : h("div.empty", "No participants recorded."))
    );
  }

  function field(label, help, control) {
    return h("div.field", h("div.lbl", h("b", label), help ? h("small", help) : null), control);
  }
  function toggle(key) {
    const input = h("input", { type: "checkbox", id: `set-${key}`, checked: settings[key] });
    input.addEventListener("change", () => save({ [key]: input.checked }));
    return h("label.switch", input, h("span"));
  }
  async function save(patch) {
    settings = await M.setSettings(patch);
    toast("Settings saved");
  }

  async function renderSettings() {
    const tf = h("span.seg", ["24h", "12h"].map((v) =>
      h("button" + (settings.timeFormat === v ? ".on" : ""), { "data-v": v, onclick: async () => { await save({ timeFormat: v }); renderSettings(); } },
        v === "24h" ? "24-hour (14:05)" : "12-hour (2:05 PM)")));
    const selfName = h("input", { type: "text", id: "set-selfName", placeholder: "e.g. Jane Doe", value: settings.selfName });
    selfName.addEventListener("change", () => save({ selfName: selfName.value.trim() }));
    const interval = h("input", { type: "number", id: "set-interval", min: 5, max: 300, value: settings.autoSaveIntervalSec });
    interval.addEventListener("change", () => save({ autoSaveIntervalSec: Number(interval.value) }));
    const grace = h("input", { type: "number", id: "set-grace", min: 1, max: 120, value: settings.leaveGraceSec });
    grace.addEventListener("change", () => save({ leaveGraceSec: Number(grace.value) }));

    const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    importInput.addEventListener("change", async () => {
      const f = importInput.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data.meetings) ? data.meetings : [];
        let n = 0;
        for (const m of list) if (m && m.id && Number.isFinite(m.startedAt) && Array.isArray(m.participants)) { await M.saveMeeting(m, m.savedVia); n++; }
        toast(`Imported ${n} meeting${n === 1 ? "" : "s"}`);
      } catch (e) {
        toast("That file is not a valid backup");
      }
      importInput.value = "";
    });

    view.replaceChildren(
      h("div.page-head", h("div", h("h1", "Settings"), h("p", "Preferences are stored locally and apply to all Meet tabs immediately."))),
      h("div.card.section",
        h("h2", "Recording"),
        field("Auto-save attendance", "Save the list to your history automatically during and at the end of each call.", toggle("autoSave")),
        field("Auto-save interval", "Seconds between automatic saves while a call is running.", interval),
        field("Show the in-Meet button", "Floating Attendance button and live panel inside Google Meet.", toggle("showMeetButton")),
        field("Leave detection delay", "Seconds someone must be gone before a leave is recorded (avoids glitches when Meet re-renders).", grace)),
      h("div.card.section",
        h("h2", "Display & export"),
        field("Ignore my own name", "Hide yourself from lists and exports.", toggle("ignoreSelf")),
        field("My display name", "Optional. Used to recognise you if Meet doesn't label you as “(You)”.", selfName),
        field("Time format", "Used in the dashboard, the in-Meet panel and exported files.", tf)),
      h("div.card.section",
        h("h2", "Your data"),
        field("Back up", "Download every saved meeting as a JSON file.", h("button.btn", { onclick: backup }, "Export backup")),
        field("Restore", "Import meetings from a backup file (existing meetings with the same ID are replaced).", h("div", importInput, h("button.btn", { onclick: () => importInput.click() }, "Import backup"))),
        field("Delete everything", "Permanently remove all saved meetings from this browser.", h("button.btn.danger", { onclick: wipe }, "Delete all meetings")))
    );
  }

  async function backup() {
    const meetings = await M.listMeetings();
    M.downloadFile({
      filename: `meet-attendance-backup_${M.formatDate(Date.now())}.json`,
      mime: "application/json",
      data: JSON.stringify({ app: "meet-attendance-tracker", version: M.RECORD_VERSION, exportedAt: Date.now(), meetings }, null, 2),
    });
  }

  async function wipe() {
    const ok = await confirmDialog("Delete all meetings?", "Every saved attendance list will be permanently removed from this browser. This can't be undone.", "Delete all");
    if (!ok) return;
    const n = await M.deleteAllMeetings();
    toast(`Deleted ${n} meeting${n === 1 ? "" : "s"}`);
  }

  function renderPrivacy() {
    view.replaceChildren(
      h("div.page-head", h("div", h("h1", "Privacy"), h("p", "Short version: your attendance data never leaves this device."))),
      h("div.card.section.prose",
        h("h2", "What is collected"),
        h("ul",
          h("li", "Display names of people in Google Meet calls you attend, as shown on screen."),
          h("li", "When each person was first and last seen, their time in the call and approximate speaking time."),
          h("li", "The meeting code, title (if visible) and start/end time.")),
        h("h2", "Where it is stored"),
        h("p", "Only in this browser's extension storage (chrome.storage.local). Uninstalling the extension deletes it. You can also delete meetings individually or all at once in Settings."),
        h("h2", "What is never done"),
        h("ul",
          h("li", "No servers, accounts, analytics, ads or trackers. The extension makes no network requests."),
          h("li", "No audio or video is recorded or processed; speaking time comes from Meet's own on-screen speaking indicator."),
          h("li", "Exports (CSV, XLSX, PDF) are generated locally by code bundled inside the extension.")),
        h("h2", "Permissions"),
        h("ul",
          h("li", h("b", "storage"), ": save your settings and attendance history locally."),
          h("li", h("b", "meet.google.com content script"), ": read the participant list on Meet pages only.")),
        h("p.muted", "Please respect your organisation's policies and local laws when recording attendance."))
    );
  }

  // ── Router ─────────────────────────────────────────────────────────
  async function route() {
    clearInterval(refreshTimer);
    const hash = location.hash || "#/meetings";
    const [, page, arg] = hash.match(/^#\/([^/]+)\/?(.*)$/) || [null, "meetings", ""];
    document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === (page === "meeting" || page === "welcome" ? "meetings" : page)));
    if (page === "meeting") {
      const id = decodeURIComponent(arg);
      await renderDetail(id);
      const live = (await M.listLive()).some((l) => l.record.id === id);
      if (live) refreshTimer = setInterval(() => renderDetail(id), 2000);
    } else if (page === "settings") await renderSettings();
    else if (page === "privacy") renderPrivacy();
    else await renderMeetings(page === "welcome");
    updateUsage();
  }

  async function updateUsage() {
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      document.getElementById("storageUsed").textContent = `${(bytes / 1024).toFixed(1)} KB used`;
    } catch (_) {}
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) settings = M.sanitizeSettings(changes.settings.newValue);
    const meetingsChanged = Object.keys(changes).some((k) => k.startsWith(M.MEETING_PREFIX));
    const onList = !location.hash || /^#\/(meetings|welcome)?$/.test(location.hash);
    if (meetingsChanged && onList && document.activeElement?.type !== "search") route();
  });
  window.addEventListener("hashchange", () => {
    route();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });

  (async () => {
    settings = await M.getSettings();
    route();
  })();
})();
