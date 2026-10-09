(function () {
  "use strict";
  const M = globalThis.MAT;
  const { h, avatar, toast, exportAndDownload } = globalThis.UI;
  let settings = M.sanitizeSettings({});

  const openDashboard = (hash = "#/meetings") => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html" + hash) });
    window.close();
  };

  async function renderLive() {
    const box = document.getElementById("live");
    const live = await M.listLive();
    box.replaceChildren();
    if (!live.length) {
      box.append(
        h("div.idle", h("div.big", "🎥"), h("b", "Not in a Google Meet call"),
          h("p", "Join a call on meet.google.com and attendance is recorded automatically. Look for the Attendance button in the bottom-right corner of Meet."))
      );
      return;
    }
    const cur = live[0];
    const now = Date.now();
    const rec = cur.record;
    const rows = M.filterRows(M.computeRows(rec, now), settings);
    const present = rows.filter((r) => r.present);
    box.append(
      h("h2", h("span.chip.live", "Live"), rec.title || rec.code),
      h("div.meta", `${rec.code} · started ${M.formatTime(rec.startedAt, settings.timeFormat, false)}`),
      h("div.live-stats",
        h("div", h("b", String(present.length)), h("span", "In call")),
        h("div", h("b", String(rows.length)), h("span", "Total seen")),
        h("div", h("b", M.formatDuration(M.meetingDuration(rec, now))), h("span", "Duration"))),
      h("div.plist", rows
        .slice()
        .sort((a, b) => b.present - a.present || b.timeInCallMs - a.timeInCallMs)
        .map((r) => h("div.prow", h("span" + (r.present ? ".dot.on" : ".dot")), avatar(r.name, 22),
          h("span.n", r.name + (r.isSelf ? " (You)" : "")), h("span.t", M.formatDuration(r.timeInCallMs))))),
      h("div.actions",
        h("button.btn.primary", { onclick: async () => { await M.sendCommand("save", cur.tabKey); toast("Saved to history"); setTimeout(renderRecent, 600); } }, "Save now"),
        ...["csv", "xlsx", "pdf"].map((f) => h("button.btn", { onclick: () => exportAndDownload(rec, f, settings, Date.now()) }, f.toUpperCase())))
    );
  }

  async function renderRecent() {
    const box = document.getElementById("recent");
    const meetings = (await M.listMeetings()).slice(0, 3);
    box.replaceChildren();
    if (!meetings.length) {
      box.append(h("div.card.empty", "No saved meetings yet."));
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
  document.getElementById("openDashboard").addEventListener("click", () => openDashboard());
  document.getElementById("openSettings").addEventListener("click", () => openDashboard("#/settings"));
  document.getElementById("allMeetings").addEventListener("click", (e) => { e.preventDefault(); openDashboard(); });

  (async () => {
    settings = await M.getSettings();
    renderSettings();
    await Promise.all([renderLive(), renderRecent()]);
    setInterval(renderLive, 1000);
  })();
})();
