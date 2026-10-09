(function () {
  "use strict";
  const M = globalThis.MAT;
  const t = M.t;
  const { h, avatar, toast, exportAndDownload, copyTable, applyTheme } = globalThis.UI;
  let settings = M.sanitizeSettings({});
  let rosters = [];

  const openDashboard = (hash = "#/meetings") => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html" + hash) });
    window.close();
  };

  async function renderLive() {
    const box = document.getElementById("live");
    const live = await M.listLive();
    box.replaceChildren();
    if (!live.length) {
      box.append(h("div.idle", h("div.big", "🎥"), h("b", t("popup_notInCall")), h("p", t("popup_notInCallHelp"))));
      return;
    }
    const cur = live[0];
    const now = Date.now();
    const rec = cur.record;
    const roster = M.pickRoster(rec, rosters);
    const ev = M.evaluateAttendance(rec, { settings, now, roster });
    const rows = ev.rows;
    const present = rows.filter((r) => r.present);
    box.append(
      h("h2", h("span.chip.live", t("chip_live")), rec.title || rec.code),
      h("div.meta", `${rec.code} · ${t("popup_started", M.formatTime(rec.startedAt, settings.timeFormat, false))}${roster ? ` · 👥 ${roster.name}` : ""}`),
      h("div.live-stats",
        h("div", h("b", String(present.length)), h("span", t("stat_inCall"))),
        roster
          ? h("div", h("b", `${ev.summary.expected - ev.summary.absent}/${ev.summary.expected}`), h("span", t("stat_expected")))
          : h("div", h("b", String(rows.length)), h("span", t("stat_totalSeen"))),
        h("div", h("b", M.formatDuration(M.meetingDuration(rec, now))), h("span", t("stat_duration")))),
      h("div.plist", rows
        .slice()
        .sort((a, b) => b.present - a.present || b.timeInCallMs - a.timeInCallMs)
        .map((r) => h("div.prow", h("span" + (r.present ? ".dot.on" : ".dot")), avatar(r.name, 22),
          h("span.n", r.name + (r.isSelf ? ` (${t("tag_you")})` : "")), h("span.t", M.formatDuration(r.timeInCallMs)))),
        ev.absentees.length ? h("div.absent-line", `${t("panel_notHere")}: ${ev.absentees.map((a) => a.name).join(", ")}`) : null),
      h("div.actions",
        h("button.btn.primary", { onclick: async () => { await M.sendCommand("save", cur.tabKey); toast(t("toast_saved")); setTimeout(renderRecent, 600); } }, t("btn_saveNow")),
        ...["csv", "xlsx", "pdf"].map((f) => h("button.btn", { onclick: () => exportAndDownload(rec, f, settings, Date.now(), { roster }) }, f.toUpperCase())),
        h("button.btn", { title: t("btn_copyTable"), "aria-label": t("btn_copyTable"), onclick: () => copyTable(rec, settings, Date.now(), { roster }) }, "⧉"))
    );
  }

  async function renderRecent() {
    const box = document.getElementById("recent");
    const meetings = (await M.listMeetings()).slice(0, 3);
    box.replaceChildren();
    if (!meetings.length) {
      box.append(h("div.card.empty", t("popup_noSaved")));
      return;
    }
    for (const m of meetings) {
      const rows = M.filterRows(M.computeRows(m), settings);
      box.append(
        h("div.card.mrow", { role: "button", tabindex: "0", onclick: () => openDashboard(`#/meeting/${encodeURIComponent(m.id)}`) },
          h("div.info", h("div.title", m.title || m.code || "Google Meet"),
            h("div.sub", `${M.formatDateTime(m.startedAt, settings.timeFormat)} · ${M.formatDuration(M.meetingDuration(m))}`)),
          h("span.cnt", `${rows.length} 👥`))
      );
    }
  }

  function renderSettings() {
    document.getElementById("autoSave").checked = settings.autoSave;
    document.getElementById("ignoreSelf").checked = settings.ignoreSelf;
    document.querySelectorAll("#timeFormat button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings.timeFormat));
    document.querySelectorAll("#theme button").forEach((b) => b.classList.toggle("on", b.dataset.v === settings.theme));
    applyTheme(settings.theme);
  }

  async function update(patch) {
    settings = await M.setSettings(patch);
    renderSettings();
    renderLive();
    renderRecent();
  }

  document.getElementById("autoSave").addEventListener("change", (e) => update({ autoSave: e.target.checked }));
  document.getElementById("ignoreSelf").addEventListener("change", (e) => update({ ignoreSelf: e.target.checked }));
  document.querySelectorAll("#timeFormat button").forEach((b) => b.addEventListener("click", () => update({ timeFormat: b.dataset.v })));
  document.querySelectorAll("#theme button").forEach((b) => b.addEventListener("click", () => update({ theme: b.dataset.v })));
  document.getElementById("openDashboard").addEventListener("click", () => openDashboard());
  document.getElementById("openAnalytics").addEventListener("click", () => openDashboard("#/analytics"));
  document.getElementById("openSettings").addEventListener("click", () => openDashboard("#/settings"));
  document.getElementById("allMeetings").addEventListener("click", (e) => { e.preventDefault(); openDashboard(); });

  (async () => {
    M.applyI18n(document);
    [settings, rosters] = await Promise.all([M.getSettings(), M.listRosters()]);
    renderSettings();
    await Promise.all([renderLive(), renderRecent()]);
    setInterval(renderLive, 1000);
  })();
})();
