(function () {
  "use strict";
  const M = globalThis.MAT;
  const t = M.t;
  const { h, avatar, toast, exportAndDownload, copyTable, applyTheme, statusBadge, svgNode } = globalThis.UI;
  const view = document.getElementById("view");
  let settings = M.sanitizeSettings({});
  let rosters = [];
  let query = "";
  let sort = "newest";
  let tagFilter = "";
  let range = "30";
  let analyticsTag = "";
  let refreshTimer = null;

  const rosterFor = (record) => M.pickRoster(record, rosters);
  const fmtTime = (ts, sec = false) => M.formatTime(ts, settings.timeFormat, sec);
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;

  // ── Data ───────────────────────────────────────────────────────────
  async function loadAll() {
    const [saved, live, rs] = await Promise.all([M.listMeetings(), M.listLive(), M.listRosters()]);
    rosters = rs;
    const byId = new Map(saved.map((m) => [m.id, { record: m, live: false, saved: true }]));
    for (const l of live) {
      const prev = byId.get(l.record.id);
      // Live data is fresher than the last save; keep the user-edited fields.
      const record = prev
        ? { ...l.record, title: prev.record.titleEdited ? prev.record.title : l.record.title || prev.record.title, tags: prev.record.tags, notes: prev.record.notes, rosterId: prev.record.rosterId, savedAt: prev.record.savedAt, savedVia: prev.record.savedVia }
        : l.record;
      byId.set(l.record.id, { record, live: true, saved: !!prev, tabKey: l.tabKey });
    }
    return [...byId.values()];
  }
  const savedRecords = async () => (await loadAll()).filter((e) => e.saved && !e.live).map((e) => e.record);

  function summarize(entry) {
    const now = entry.live ? Date.now() : undefined;
    const ev = M.evaluateAttendance(entry.record, { settings, now, roster: rosterFor(entry.record) });
    return { ...entry, ev, rows: ev.rows, durationMs: ev.summary.meetingMs, now };
  }

  function matchesQuery(s, q) {
    if (!q) return true;
    const r = s.record;
    const hay = [r.title, r.code, M.formatDate(r.startedAt), r.notes, ...(r.tags || []), ...s.rows.map((x) => x.name)].join(" \u0001 ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((x) => hay.includes(x));
  }

  // ── Modal ──────────────────────────────────────────────────────────
  function openModal({ title, body, okLabel, danger = true }) {
    const modal = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = title;
    const bodyEl = document.getElementById("modalBody");
    bodyEl.replaceChildren(typeof body === "string" ? document.createTextNode(body) : body);
    const ok = document.getElementById("modalOk");
    const cancel = document.getElementById("modalCancel");
    ok.textContent = okLabel || t("btn_delete");
    cancel.textContent = t("btn_cancel");
    ok.className = "btn " + (danger ? "danger solid" : "primary");
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
  const confirmDialog = (title, body, okLabel) => openModal({ title, body, okLabel });

  function statCard(k, v, small) {
    return h("div.card.stat", h("div.k", k), h("div.v", v, small ? h("small", " " + small) : null));
  }
  function pageHead(title, sub, ...actions) {
    return h("div.page-head", h("div", h("h1", title), sub ? h("p", sub) : null), actions.length ? h("div.btn-group", ...actions) : null);
  }
  function rateCell(rate) {
    return h("div.rate", h("div.bar", h("i", { style: { width: pct(rate) } })), h("span.num", pct(rate)));
  }

  // ── Meetings ───────────────────────────────────────────────────────
  async function renderMeetings(welcome) {
    const entries = (await loadAll()).map(summarize);
    const unique = new Set();
    let totalMs = 0;
    for (const s of entries) {
      s.rows.forEach((r) => unique.add(r.key));
      totalMs += s.durationMs;
    }
    const avg = entries.length ? Math.round(entries.reduce((n, s) => n + s.rows.length, 0) / entries.length) : 0;
    const tags = M.allTags(entries.map((e) => e.record));
    if (tagFilter && !tags.some((x) => x.tag === tagFilter)) tagFilter = "";

    const sorters = {
      newest: (a, b) => b.record.startedAt - a.record.startedAt,
      oldest: (a, b) => a.record.startedAt - b.record.startedAt,
      people: (a, b) => b.rows.length - a.rows.length,
      longest: (a, b) => b.durationMs - a.durationMs,
    };
    const visible = () => entries.filter((s) => matchesQuery(s, query) && (!tagFilter || (s.record.tags || []).includes(tagFilter))).sort(sorters[sort]);

    const search = h("input", { type: "search", placeholder: t("meetings_search"), value: query, "aria-label": t("meetings_searchAria") });
    search.addEventListener("input", () => {
      query = search.value;
      renderTable();
    });
    const sortSel = h("select", { "aria-label": t("meetings_sort") },
      [["newest", t("sort_newest")], ["oldest", t("sort_oldest")], ["people", t("sort_people")], ["longest", t("sort_longest")]].map(([v, l]) => h("option", { value: v, selected: v === sort }, l)));
    sortSel.addEventListener("change", () => {
      sort = sortSel.value;
      renderTable();
    });

    const tagBar = tags.length
      ? h("div.tagchips", { role: "group", "aria-label": t("meetings_filterByTag") },
          h("button.tagchip" + (tagFilter ? "" : ".on"), { onclick: () => { tagFilter = ""; renderMeetings(); } }, t("meetings_allTags")),
          tags.map(({ tag, count }) => h("button.tagchip" + (tagFilter === tag ? ".on" : ""), { "data-tag": tag, onclick: () => { tagFilter = tagFilter === tag ? "" : tag; renderMeetings(); } }, `#${tag}`, h("small", String(count)))))
      : null;

    const tableBox = h("div.card", { id: "meetingTable" });
    function renderTable() {
      const rows = visible();
      tableBox.replaceChildren();
      if (!rows.length) {
        tableBox.append(h("div.empty", entries.length ? t("meetings_noMatch") : t("meetings_empty")));
        return;
      }
      tableBox.append(
        h("table",
          h("thead", h("tr", h("th", t("col_meeting")), h("th", t("col_date")), h("th.hide-sm", t("col_duration")), h("th", t("col_people")), h("th.hide-sm", t("col_saved")), h("th", ""))),
          h("tbody", rows.map((s) => {
            const r = s.record;
            const open = () => (location.hash = `#/meeting/${encodeURIComponent(r.id)}`);
            const absent = s.ev.summary.expected != null ? s.ev.summary.absent : null;
            return h("tr.click", { "data-id": r.id, onclick: open },
              h("td", h("div.mtitle", r.title || r.code || "Google Meet", s.live ? [" ", h("span.chip.live", t("chip_live"))] : null,
                (r.tags || []).length ? h("span.mtags", r.tags.map((x) => h("span", `#${x}`))) : null), h("div.msub", r.code)),
              h("td.num", M.formatDate(r.startedAt), h("div.msub", fmtTime(r.startedAt))),
              h("td.num.hide-sm", M.formatClock(s.durationMs)),
              h("td.num", h("b", String(s.rows.length)), absent ? h("div.msub", t("meetings_absentCount", String(absent))) : null),
              h("td.hide-sm", h("span.chip.gray", !s.saved ? t("saved_not") : r.savedVia === "manual" ? t("saved_manual") : t("saved_auto"))),
              h("td", h("div.row-actions",
                h("button.btn.sm", { onclick: (e) => { e.stopPropagation(); open(); } }, t("btn_view")),
                h("button.btn.sm", { title: "CSV", onclick: (e) => { e.stopPropagation(); exportAndDownload(r, "csv", settings, s.now, { roster: rosterFor(r) }); } }, "CSV"),
                s.live ? null : h("button.btn.sm.danger", { "aria-label": `${t("btn_delete")} ${r.title || r.code}`, onclick: (e) => { e.stopPropagation(); remove(r); } }, t("btn_delete")))));
          })))
      );
    }
    renderTable();

    view.replaceChildren(...[
      welcome
        ? h("div.card.welcome", h("div", h("h2", t("welcome_title")), h("p", t("welcome_body"))), h("button.btn", { onclick: () => (location.hash = "#/meetings") }, t("btn_gotIt")))
        : null,
      pageHead(t("nav_meetings"), t("meetings_sub"), h("button.btn", { id: "bulkExport", onclick: () => bulkExport(entries.filter((e) => !e.live).map((e) => e.record)) }, t("btn_bulkExport"))),
      h("div.stats",
        statCard(t("nav_meetings"), String(entries.length)),
        statCard(t("stat_uniquePeople"), String(unique.size)),
        statCard(t("stat_totalMeetingTime"), M.formatDuration(totalMs)),
        statCard(t("stat_avgAttendance"), String(avg), t("stat_perMeeting"))),
      tagBar,
      h("div.toolbar", h("div.search", search), sortSel),
      tableBox,
    ].filter(Boolean));
  }

  async function bulkExport(records) {
    const dates = records.map((r) => r.startedAt).sort((a, b) => a - b);
    const from = h("input", { type: "date", id: "bulkFrom", value: dates.length ? M.formatDate(dates[0]) : "" });
    const to = h("input", { type: "date", id: "bulkTo", value: dates.length ? M.formatDate(dates[dates.length - 1]) : "" });
    const tag = h("select", { id: "bulkTag" }, h("option", { value: "" }, t("meetings_allTags")), M.allTags(records).map(({ tag }) => h("option", { value: tag }, `#${tag}`)));
    const fmt = h("select", { id: "bulkFormat" }, [["xlsx", t("bulk_xlsx")], ["csv", t("bulk_csv")], ["json", t("bulk_json")]].map(([v, l]) => h("option", { value: v }, l)));
    const count = h("p.muted");
    const pick = () => M.filterMeetings(records, { from: from.value, to: to.value, tag: tag.value });
    const upd = () => (count.textContent = t("bulk_count", String(pick().length)));
    [from, to, tag].forEach((x) => x.addEventListener("change", upd));
    upd();
    const body = h("div", h("p", t("bulk_help")),
      h("div.form-grid", h("label", t("bulk_from"), from), h("label", t("bulk_to"), to), h("label", t("bulk_tag"), tag), h("label", t("bulk_format"), fmt)), count);
    if (!(await openModal({ title: t("btn_bulkExport"), body, okLabel: t("btn_export"), danger: false }))) return;
    const list = pick();
    if (!list.length) return toast(t("bulk_none"));
    const file = M.exportBulk(list, fmt.value, settings, rosterFor, { from: from.value, to: to.value });
    M.downloadFile(file);
    toast(t("toast_downloaded", file.filename));
  }

  async function remove(record) {
    const ok = await confirmDialog(t("delete_title"), t("delete_body", [record.title || record.code, M.formatDate(record.startedAt)]));
    if (!ok) return;
    await M.deleteMeeting(record.id);
    toast(t("toast_deleted"));
    if (location.hash.startsWith("#/meeting/")) location.hash = "#/meetings";
    else route();
  }

  // ── Meeting detail ─────────────────────────────────────────────────
  function tagEditor(record, disabled) {
    let tags = [...(record.tags || [])];
    const box = h("div.tag-editor", { id: "tagEditor" });
    const input = h("input", { type: "text", placeholder: t("tags_add"), "aria-label": t("tags_add"), disabled });
    const save = async () => {
      await M.updateMeeting(record.id, { tags });
      toast(t("toast_tagsSaved"));
    };
    const draw = () => {
      box.replaceChildren(
        ...tags.map((x) => h("span.t", `#${x}`, disabled ? null : h("button", { "aria-label": t("tags_remove", x), onclick: () => { tags = tags.filter((y) => y !== x); draw(); save(); } }, "×"))),
        input
      );
      if (!disabled) input.focus();
    };
    input.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
        e.preventDefault();
        const v = input.value.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase().slice(0, 32);
        input.value = "";
        if (v && !tags.includes(v)) {
          tags.push(v);
          draw();
          save();
        }
      } else if (e.key === "Backspace" && !input.value && tags.length) {
        tags.pop();
        draw();
        save();
      }
    });
    box.replaceChildren(...tags.map((x) => h("span.t", `#${x}`, disabled ? null : h("button", { "aria-label": t("tags_remove", x), onclick: () => { tags = tags.filter((y) => y !== x); draw(); save(); } }, "×"))), input);
    return box;
  }

  async function renderDetail(id) {
    const entry = (await loadAll()).find((e) => e.record.id === id);
    if (!entry) {
      view.replaceChildren(h("a.back", { href: "#/meetings" }, `← ${t("back_meetings")}`), h("div.card.empty", t("detail_missing")));
      return;
    }
    const s = summarize(entry);
    const r = s.record;
    const now = s.now;
    const sum = s.ev.summary;
    const roster = s.ev.roster;
    const span = Math.max(1, s.durationMs);
    const end = r.startedAt + span;
    const maxSpk = Math.max(1, ...s.rows.map((x) => x.speakingMs));
    const sessionsByKey = new Map((r.participants || []).map((p) => [p.key, M.mergeSessions(p.sessions)]));
    const locked = entry.live || !entry.saved;
    const ctx = { roster };
    // Exports read the latest saved copy so freshly edited tags/notes/roster are included.
    const fresh = async () => {
      if (entry.live) return [r, ctx];
      const rec = (await M.getMeeting(r.id)) || r;
      return [rec, { roster: M.pickRoster(rec, await M.listRosters()) }];
    };

    const title = h("input.title-input", { value: r.title || r.code || "Google Meet", "aria-label": t("detail_titleAria"), disabled: locked });
    title.addEventListener("change", async () => {
      await M.updateMeeting(r.id, { title: title.value.trim().slice(0, 120), titleEdited: true });
      toast(t("toast_titleSaved"));
    });

    const rosterSel = h("select", { id: "rosterSelect", "aria-label": t("detail_roster"), disabled: locked },
      h("option", { value: "", selected: !r.rosterId }, t("roster_auto")),
      h("option", { value: "none", selected: r.rosterId === "none" }, t("roster_none")),
      rosters.map((x) => h("option", { value: x.id, selected: r.rosterId === x.id }, `${x.name} (${x.members.length})`)));
    rosterSel.addEventListener("change", async () => {
      await M.updateMeeting(r.id, { rosterId: rosterSel.value || undefined });
      renderDetail(id);
    });
    const notes = h("textarea.notes", { id: "meetingNotes", placeholder: t("notes_placeholder"), "aria-label": t("notes_label"), disabled: locked });
    notes.value = r.notes || "";
    notes.addEventListener("change", async () => {
      await M.updateMeeting(r.id, { notes: notes.value.slice(0, 5000) });
      toast(t("toast_notesSaved"));
    });

    const participantRows = s.rows.map((p) =>
      h("tr", { "data-name": p.name, "data-status": p.status },
        h("td", h("div.who", avatar(p.name), h("div", h("b", p.name), p.isSelf ? h("span.you", t("tag_you")) : null,
          h("div.msub", p.present ? t("detail_inCallNow") : t(p.joins === 1 ? "detail_session" : "detail_sessions", String(p.joins)))))),
        h("td", statusBadge(p.status, p.onRoster === false)),
        h("td.num", fmtTime(p.firstSeen, true)),
        h("td.num", fmtTime(p.lastSeen, true)),
        h("td.num", h("b", M.formatClock(p.timeInCallMs))),
        h("td", h("div.spk", h("div.bar", h("i", { style: { width: `${Math.round((p.speakingMs / maxSpk) * 100)}%` } })), h("span.num", M.formatClock(p.speakingMs)))),
        h("td.hide-sm", h("div.timeline", { title: t("detail_timelineTitle") },
          (sessionsByKey.get(p.key) || []).map((x) => {
            const a = Math.max(0, (x.start - r.startedAt) / span);
            const b = Math.min(1, ((x.end == null ? now || end : x.end) - r.startedAt) / span);
            return h("i", { style: { left: `${a * 100}%`, width: `${Math.max(0.8, (b - a) * 100)}%` } });
          })))));
    const absentRows = s.ev.absentees.map((a) =>
      h("tr.absent-row", { "data-name": a.name, "data-status": "absent" },
        h("td", h("div.who", avatar(a.name), h("div", h("b", a.name), h("div.msub", a.member.email || t("panel_notJoined"))))),
        h("td", statusBadge("absent")), h("td.num", "–"), h("td.num", "–"), h("td.num", "00:00:00"), h("td"), h("td.hide-sm")));

    const chat = r.chat || [];
    view.replaceChildren(...[
      h("a.back", { href: "#/meetings" }, `← ${t("back_meetings")}`),
      h("div.detail-head",
        h("div", title,
          h("div.chips",
            entry.live ? h("span.chip.live", t("chip_live")) : null,
            h("a.chip.gray", { href: `#/series/${encodeURIComponent(r.code)}`, title: t("detail_seriesLink") }, `🔁 ${r.code}`),
            h("span.chip.gray", `${M.formatDate(r.startedAt)} · ${fmtTime(r.startedAt)} – ${r.endedAt ? fmtTime(r.endedAt) : entry.live ? t("detail_now") : fmtTime(r.updatedAt)}`),
            r.url ? h("a.chip.gray", { href: r.url, target: "_blank", rel: "noopener" }, `${t("detail_openInMeet")} ↗`) : null)),
        h("div.btn-group",
          ...["csv", "xlsx", "pdf", "json"].map((f) => h("button.btn" + (f === "csv" ? ".primary" : ""), { "data-export": f, onclick: async () => { const [rec, c] = await fresh(); exportAndDownload(rec, f, settings, now, c); } }, f.toUpperCase())),
          h("button.btn", { id: "copyTable", onclick: async () => { const [rec, c] = await fresh(); copyTable(rec, settings, now, c); } }, t("btn_copyTable")),
          entry.live ? null : h("button.btn.danger", { onclick: () => remove(r) }, t("btn_delete")))),
      h("div.stats",
        roster ? statCard(t("stat_attendance"), `${sum.expected - sum.absent}/${sum.expected}`, pct(sum.attendanceRate)) : statCard(t("stat_participants"), String(s.rows.length)),
        statCard(t("col_duration"), M.formatDuration(s.durationMs)),
        statCard(t("stat_avgTimeInCall"), M.formatDuration(sum.avgTimeInCallMs)),
        statCard(t("stat_totalSpeaking"), M.formatDuration(sum.totalSpeakingMs))),
      h("div.meta-grid",
        h("div.card.meta-card",
          h("label.lbl", { for: "rosterSelect" }, t("detail_roster")), rosterSel,
          h("label.lbl", { style: { marginTop: "12px" } }, t("tags_label")), tagEditor(r, locked)),
        h("div.card.meta-card", h("label.lbl", { for: "meetingNotes" }, t("notes_label")), notes)),
      h("div.status-summary",
        h("span.st.present", `${t("status_present")} ${sum.present}`),
        h("span.st.late", `${t("status_late")} ${sum.late}`),
        h("span.st.short", `${t("status_short")} ${sum.short}`),
        roster ? h("span.st.absent", `${t("status_absent")} ${sum.absent}`) : null,
        roster && sum.guests ? h("span.st.guest", `${t("tag_guest")} ${sum.guests}`) : null),
      h("div.card",
        s.rows.length || absentRows.length
          ? h("table", { id: "participantsTable" },
              h("thead", h("tr", h("th", t("col_name")), h("th", t("col_status")), h("th", t("col_firstSeen")), h("th", t("col_lastSeen")), h("th", t("col_timeInCall")), h("th", t("col_speaking")), h("th.hide-sm", t("col_timeline")))),
              h("tbody", participantRows, absentRows))
          : h("div.empty", t("detail_noParticipants"))),
      chat.length
        ? h("div.card.chat", { id: "chatLog" },
            h("h2", `💬 ${t("chat_title")} (${chat.length})`, h("button.btn.sm", { onclick: () => exportAndDownload(r, "chat-csv", settings, now, ctx) }, t("btn_chatCsv"))),
            chat.map((c) => h("div.msg", h("span.tm", fmtTime(c.at)), h("span.sd", c.sender), h("span.tx", c.text))))
        : null,
    ].filter(Boolean));
  }

  // ── Analytics ──────────────────────────────────────────────────────
  async function renderAnalytics() {
    const all = await savedRecords();
    const records = M.filterMeetings(all, { days: range === "all" ? 0 : Number(range), tag: analyticsTag });
    const ov = M.overview(records, { settings, rosterFor });
    const rangeSel = h("select", { id: "rangeSelect", "aria-label": t("analytics_range") },
      [["7", t("range_7")], ["30", t("range_30")], ["90", t("range_90")], ["all", t("range_all")]].map(([v, l]) => h("option", { value: v, selected: v === range }, l)));
    rangeSel.addEventListener("change", () => { range = rangeSel.value; renderAnalytics(); });
    const tagSel = h("select", { "aria-label": t("bulk_tag") }, h("option", { value: "" }, t("meetings_allTags")), M.allTags(all).map(({ tag }) => h("option", { value: tag, selected: tag === analyticsTag }, `#${tag}`)));
    tagSel.addEventListener("change", () => { analyticsTag = tagSel.value; renderAnalytics(); });

    const pm = ov.perMeeting;
    const chartAttendance = M.stackedBarChart({
      labels: pm.map((m) => M.formatDate(m.startedAt).slice(5)),
      series: [
        { name: t("status_present"), color: "#16a34a", values: pm.map((m) => m.present) },
        { name: t("status_late"), color: "#f59e0b", values: pm.map((m) => m.late) },
        { name: t("status_short"), color: "#8b5cf6", values: pm.map((m) => m.short) },
        { name: t("status_absent"), color: "#ef4444", values: pm.map((m) => m.absent) },
      ],
      title: t("analytics_attendanceOverTime"),
    });
    const chartSpeakers = M.hBarChart({ data: ov.topSpeakers.map((s) => ({ label: s.label, value: s.value, display: M.formatDuration(s.value) })), title: t("analytics_topSpeakers") });
    const chartShare = M.pieChart({ slices: ov.speakingShare, title: t("analytics_speakingShare"), format: (v) => M.formatDuration(v) });

    view.replaceChildren(
      pageHead(t("nav_analytics"), t("analytics_sub")),
      h("div.filters", rangeSel, tagSel),
      h("div.stats",
        statCard(t("nav_meetings"), String(ov.meetings)),
        statCard(t("stat_uniquePeople"), String(ov.uniquePeople)),
        statCard(t("stat_totalMeetingTime"), M.formatDuration(ov.totalMs)),
        statCard(t("stat_avgRate"), pct(ov.avgRate))),
      records.length
        ? h("div.chart-grid",
            h("div.card.chart-card.full", { id: "chartAttendance" }, h("h3", t("analytics_attendanceOverTime")), svgNode(chartAttendance)),
            h("div.card.chart-card", { id: "chartSpeakers" }, h("h3", t("analytics_topSpeakers")), ov.topSpeakers.length ? svgNode(chartSpeakers) : h("p.muted", t("analytics_noSpeaking"))),
            h("div.card.chart-card", { id: "chartShare" }, h("h3", t("analytics_speakingShare")), ov.speakingShare.length ? svgNode(chartShare) : h("p.muted", t("analytics_noSpeaking"))))
        : h("div.card.empty", t("analytics_empty")),
      h("div.card", { id: "peopleTable" },
        ov.people.length
          ? h("table",
              h("thead", h("tr", h("th", t("col_name")), h("th", t("col_attended")), h("th", t("col_rate")), h("th.hide-sm", t("col_avgTime")), h("th", t("col_speaking")), h("th.hide-sm", t("status_late")), h("th.hide-sm", t("col_lastSeen")))),
              h("tbody", ov.people.map((p) =>
                h("tr.click", { "data-key": p.key, onclick: () => (location.hash = `#/person/${encodeURIComponent(p.key)}`) },
                  h("td", h("div.who", avatar(p.name), h("b", p.name))),
                  h("td.num", `${p.attended}/${p.expected}`),
                  h("td", rateCell(p.rate)),
                  h("td.num.hide-sm", M.formatDuration(p.avgTimeMs)),
                  h("td.num", M.formatDuration(p.totalSpeakingMs)),
                  h("td.num.hide-sm", String(p.late)),
                  h("td.num.hide-sm", p.lastSeen ? M.formatDate(p.lastSeen) : "–")))))
          : h("div.empty", t("analytics_empty")))
    );
  }

  async function renderPerson(key) {
    const records = await savedRecords();
    const p = M.personStats(records, { settings, rosterFor }).find((x) => x.key === key);
    if (!p) {
      view.replaceChildren(h("a.back", { href: "#/analytics" }, `← ${t("nav_analytics")}`), h("div.card.empty", t("person_missing")));
      return;
    }
    const COLORS = { present: "#16a34a", late: "#f59e0b", short: "#8b5cf6", absent: "#ef4444" };
    const chart = M.lineChart({
      points: p.trend.map((x) => ({
        label: M.formatDate(x.startedAt).slice(5),
        value: Math.round(x.timeInCallMs / 6000) / 10,
        color: COLORS[x.status],
        title: `${M.formatDate(x.startedAt)} · ${x.title}: ${M.tStatus(x.status)}, ${M.formatDuration(x.timeInCallMs)}`,
      })),
      unit: "m",
      title: t("person_trend"),
    });
    view.replaceChildren(
      h("a.back", { href: "#/analytics" }, `← ${t("nav_analytics")}`),
      h("div.person-head", avatar(p.name, 48), h("div", h("h1", { style: { margin: 0 } }, p.name), h("p.muted", { style: { margin: 0 } }, t("person_sub", [String(p.attended), String(p.expected)])))),
      h("div.stats",
        statCard(t("col_rate"), pct(p.rate)),
        statCard(t("col_avgTime"), M.formatDuration(p.avgTimeMs)),
        statCard(t("stat_totalSpeaking"), M.formatDuration(p.totalSpeakingMs)),
        statCard(t("person_lateAbsent"), `${p.late} / ${p.absent}`)),
      h("div.card.chart-card", { id: "personTrend", style: { marginBottom: "18px" } }, h("h3", t("person_trend")),
        h("div.legend-row", ["present", "late", "short", "absent"].map((st) => h("span", h("span.mx." + st, { style: { width: "12px", height: "12px" } }), " ", M.tStatus(st)))),
        svgNode(chart)),
      h("div.card",
        h("table",
          h("thead", h("tr", h("th", t("col_date")), h("th", t("col_meeting")), h("th", t("col_status")), h("th", t("col_timeInCall")), h("th", t("col_speaking")))),
          h("tbody", p.trend.slice().reverse().map((x) =>
            h("tr.click", { onclick: () => (location.hash = `#/meeting/${encodeURIComponent(x.id)}`) },
              h("td.num", `${M.formatDate(x.startedAt)} ${fmtTime(x.startedAt)}`),
              h("td", h("div.mtitle", x.title), h("div.msub", x.code)),
              h("td", statusBadge(x.status)),
              h("td.num", M.formatClock(x.timeInCallMs)),
              h("td.num", M.formatClock(x.speakingMs)))))))
    );
  }

  // ── Series ─────────────────────────────────────────────────────────
  async function renderSeriesList() {
    const records = await savedRecords();
    const list = M.seriesList(records);
    view.replaceChildren(
      pageHead(t("nav_series"), t("series_sub")),
      h("div.card", { id: "seriesTable" },
        list.length
          ? h("table",
              h("thead", h("tr", h("th", t("col_meeting")), h("th", t("series_sessions")), h("th", t("series_range")), h("th", ""))),
              h("tbody", list.map((s) =>
                h("tr.click", { "data-code": s.code, onclick: () => (location.hash = `#/series/${encodeURIComponent(s.code)}`) },
                  h("td", h("div.mtitle", s.title, s.count > 1 ? [" ", h("span.chip", t("series_recurring"))] : null), h("div.msub", s.code)),
                  h("td.num", h("b", String(s.count))),
                  h("td.num", `${M.formatDate(s.first)} → ${M.formatDate(s.last)}`),
                  h("td", h("div.row-actions", h("button.btn.sm", t("btn_view"))))))))
          : h("div.empty", t("meetings_empty")))
    );
  }

  async function renderSeries(code) {
    const records = M.filterMeetings(await savedRecords(), { code });
    if (!records.length) {
      view.replaceChildren(h("a.back", { href: "#/series" }, `← ${t("nav_series")}`), h("div.card.empty", t("series_missing")));
      return;
    }
    const mx = M.seriesMatrix(records, { settings, rosterFor });
    const SYM = { present: "✓", late: "L", short: "⧗", absent: "✗" };
    view.replaceChildren(
      h("a.back", { href: "#/series" }, `← ${t("nav_series")}`),
      pageHead(mx.title, t("series_detailSub", [code, String(mx.sessions.length)]),
        h("button.btn.primary", { "data-export": "series-xlsx", onclick: () => { const f = M.exportSeries(mx, "xlsx", settings); M.downloadFile(f); toast(t("toast_downloaded", f.filename)); } }, "Export XLSX"),
        h("button.btn", { "data-export": "series-csv", onclick: () => { const f = M.exportSeries(mx, "csv", settings); M.downloadFile(f); toast(t("toast_downloaded", f.filename)); } }, "Export CSV")),
      h("div.legend-row", ["present", "late", "short", "absent"].map((st) => h("span", h("span.mx." + st, SYM[st]), " ", M.tStatus(st)))),
      h("div.card.matrix-wrap",
        h("table.matrix", { id: "seriesMatrix" },
          h("thead", h("tr", h("th", t("col_name")),
            mx.sessions.map((s) => h("th.sess", h("a", { href: `#/meeting/${encodeURIComponent(s.id)}` }, M.formatDate(s.startedAt).slice(5), h("br"), fmtTime(s.startedAt)))),
            h("th", t("col_attended")), h("th", t("col_rate")))),
          h("tbody", mx.rows.map((r) =>
            h("tr", { "data-name": r.name },
              h("td", h("div.who", avatar(r.name), h("div", h("b", r.name), r.onRoster ? null : h("div.msub", t("tag_guest"))))),
              r.cells.map((c, i) => h("td.cell", h("span.mx." + c.status, { title: `${M.formatDate(mx.sessions[i].startedAt)}: ${M.tStatus(c.status)}${c.timeInCallMs ? ` · ${M.formatDuration(c.timeInCallMs)}` : ""}` }, SYM[c.status]))),
              h("td.num", `${r.attended}/${r.expected}`),
              h("td", rateCell(r.rate)))))))
    );
  }

  // ── Rosters ────────────────────────────────────────────────────────
  async function renderRosters() {
    rosters = await M.listRosters();
    view.replaceChildren(
      pageHead(t("nav_rosters"), t("rosters_sub"), h("a.btn.primary", { href: "#/roster/new", id: "newRoster" }, `+ ${t("rosters_new")}`)),
      rosters.length
        ? h("div.roster-cards", rosters.map((r) =>
            h("div.card.roster-card", { "data-roster": r.name },
              h("h3", r.name),
              h("div.muted", t("rosters_members", String(r.members.length))),
              h("div", (r.codes || []).length ? r.codes.map((c) => h("span.chip.gray", { style: { marginRight: "4px" } }, `🔗 ${c}`)) : h("span.muted", t("rosters_noCodes"))),
              h("div.actions",
                h("a.btn.sm", { href: `#/roster/${encodeURIComponent(r.id)}` }, t("btn_edit")),
                h("button.btn.sm.danger", { onclick: async () => {
                  if (!(await confirmDialog(t("rosters_deleteTitle"), t("rosters_deleteBody", r.name)))) return;
                  await M.deleteRoster(r.id);
                  toast(t("toast_deleted"));
                  renderRosters();
                } }, t("btn_delete"))))))
        : h("div.card.empty", t("rosters_empty"))
    );
  }

  async function renderRosterEditor(id) {
    rosters = await M.listRosters();
    const existing = id === "new" ? null : rosters.find((r) => r.id === id);
    const name = h("input", { type: "text", id: "rosterName", value: existing ? existing.name : "", placeholder: t("roster_namePh") });
    const codes = h("input", { type: "text", id: "rosterCodes", value: existing ? (existing.codes || []).join(", ") : "", placeholder: "abc-defg-hij, xyz-abcd-efg" });
    const members = h("textarea", { id: "rosterMembers", placeholder: "Ayesha Siddiqua\nDaniel Kim, daniel@example.com\nরহিম উদ্দিন" });
    members.value = existing ? existing.members.map((m) => (m.email ? `${m.name}, ${m.email}` : m.name)).join("\n") : "";
    const count = h("small", { id: "rosterCount" });
    const updCount = () => (count.textContent = t("rosters_members", String(M.parseRosterText(members.value).length)));
    members.addEventListener("input", updCount);
    updCount();
    const file = h("input", { type: "file", accept: ".csv,.tsv,.txt,text/csv,text/plain", hidden: true, id: "rosterFile" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      const parsed = M.parseRosterText(await f.text());
      members.value = parsed.map((m) => (m.email ? `${m.name}, ${m.email}` : m.name)).join("\n");
      if (!name.value) name.value = f.name.replace(/\.[^.]+$/, "");
      updCount();
      toast(t("rosters_imported", String(parsed.length)));
      file.value = "";
    });
    view.replaceChildren(
      h("a.back", { href: "#/rosters" }, `← ${t("nav_rosters")}`),
      pageHead(existing ? t("rosters_edit") : t("rosters_new")),
      h("div.card.editor",
        h("label", h("b", t("roster_name")), name),
        h("label", h("b", t("roster_codes")), codes, h("small", t("roster_codesHelp"))),
        h("label", h("b", t("roster_members")), members, h("small", t("roster_membersHelp"))),
        h("div.btn-group", count),
        h("div.btn-group",
          file,
          h("button.btn", { onclick: () => file.click() }, t("roster_importCsv")),
          h("button.btn.primary", { id: "saveRoster", onclick: async () => {
            const list = M.parseRosterText(members.value);
            if (!list.length) return toast(t("roster_needMembers"));
            await M.saveRoster({ id: existing ? existing.id : undefined, name: name.value.trim() || t("roster_untitled"), codes: codes.value.split(/[\s,;]+/), members: list });
            toast(t("toast_rosterSaved"));
            location.hash = "#/rosters";
          } }, t("btn_save"))))
    );
  }

  // ── Settings ───────────────────────────────────────────────────────
  function field(label, help, control, id) {
    return h("div.field", id ? { id } : null, h("div.lbl", h("b", label), help ? h("small", help) : null), control);
  }
  function toggle(key) {
    const input = h("input", { type: "checkbox", id: `set-${key}`, checked: settings[key] });
    input.addEventListener("change", () => save({ [key]: input.checked }));
    return h("label.switch", input, h("span"));
  }
  function numberInput(key, min, max, id) {
    const i = h("input", { type: "number", id, min, max, value: settings[key] });
    i.addEventListener("change", () => save({ [key]: Number(i.value) }));
    return i;
  }
  function seg(key, options) {
    return h("span.seg", { id: `seg-${key}` }, options.map(([v, l]) =>
      h("button" + (settings[key] === v ? ".on" : ""), { "data-v": v, onclick: async () => { await save({ [key]: v }); renderSettings(); } }, l)));
  }
  async function save(patch) {
    settings = await M.setSettings(patch);
    applyTheme(settings.theme);
    toast(t("toast_settingsSaved"));
  }

  async function renderSettings() {
    const selfName = h("input", { type: "text", id: "set-selfName", placeholder: "e.g. Jane Doe", value: settings.selfName });
    selfName.addEventListener("change", () => save({ selfName: selfName.value.trim() }));
    const minMode = h("select", { id: "set-minMode" }, [["minutes", t("set_minutes")], ["percent", t("set_percent")]].map(([v, l]) => h("option", { value: v, selected: settings.minPresenceMode === v }, l)));
    minMode.addEventListener("change", () => save({ minPresenceMode: minMode.value }));
    const minVal = numberInput("minPresenceValue", 0, 600, "set-minValue");

    const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    importInput.addEventListener("change", async () => {
      const f = importInput.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data.meetings) ? data.meetings : [];
        let n = 0;
        for (const m of list) if (m && m.id && Number.isFinite(m.startedAt) && Array.isArray(m.participants)) { await M.saveMeeting(m, m.savedVia, { preserveUserFields: false }); n++; }
        for (const r of Array.isArray(data.rosters) ? data.rosters : []) if (r && r.id && Array.isArray(r.members)) await M.saveRoster(r);
        toast(t("toast_imported", String(n)));
      } catch (e) {
        toast(t("toast_badBackup"));
      }
      importInput.value = "";
    });

    let shortcuts = [];
    try {
      shortcuts = await chrome.commands.getAll();
    } catch (_) {}

    view.replaceChildren(
      pageHead(t("nav_settings"), t("settings_sub")),
      h("div.card.section",
        h("h2", t("set_recording")),
        field(t("set_autoSave"), t("set_autoSaveHelp"), toggle("autoSave")),
        field(t("set_interval"), t("set_intervalHelp"), numberInput("autoSaveIntervalSec", 5, 300, "set-interval")),
        field(t("set_showButton"), t("set_showButtonHelp"), toggle("showMeetButton")),
        field(t("set_grace"), t("set_graceHelp"), numberInput("leaveGraceSec", 1, 120, "set-grace")),
        field(t("set_chat"), t("set_chatHelp"), toggle("captureChat"))),
      h("div.card.section",
        h("h2", t("set_rules")),
        field(t("set_late"), t("set_lateHelp"), numberInput("lateThresholdMin", 0, 600, "set-late")),
        field(t("set_minPresence"), t("set_minPresenceHelp"), h("div.btn-group", minVal, minMode))),
      h("div.card.section",
        h("h2", t("set_notifications")),
        field(t("set_notify"), t("set_notifyHelp"), toggle("notifyJoinLeave")),
        field(t("set_sound"), t("set_soundHelp"), toggle("notifySound"))),
      h("div.card.section",
        h("h2", t("set_display")),
        field(t("set_ignoreSelf"), t("set_ignoreSelfHelp"), toggle("ignoreSelf")),
        field(t("set_selfName"), t("set_selfNameHelp"), selfName),
        field(t("set_timeFormat"), t("set_timeFormatHelp"), seg("timeFormat", [["24h", t("set_24h")], ["12h", t("set_12h")]])),
        field(t("set_theme"), t("set_themeHelp"), seg("theme", [["system", t("theme_system")], ["light", t("theme_light")], ["dark", t("theme_dark")]])),
        field(t("set_language"), t("set_languageHelp"), h("span.chip.gray", M.uiLang()))),
      h("div.card.section",
        h("h2", t("set_shortcuts")),
        ...shortcuts.filter((c) => c.name && !c.name.startsWith("_")).map((c) =>
          field(c.description || c.name, null, h("span.kbd", c.shortcut || t("set_shortcutUnset")))),
        field(t("set_customize"), t("set_customizeHelp"), h("button.btn", { onclick: () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }) }, t("set_openShortcuts")))),
      h("div.card.section",
        h("h2", t("set_data")),
        field(t("set_backup"), t("set_backupHelp"), h("button.btn", { onclick: backup }, t("set_exportBackup"))),
        field(t("set_restore"), t("set_restoreHelp"), h("div", importInput, h("button.btn", { onclick: () => importInput.click() }, t("set_importBackup")))),
        field(t("set_deleteAll"), t("set_deleteAllHelp"), h("button.btn.danger", { onclick: wipe }, t("set_deleteAllBtn"))))
    );
  }

  async function backup() {
    const [meetings, rs] = await Promise.all([M.listMeetings(), M.listRosters()]);
    M.downloadFile({
      filename: `meet-attendance-backup_${M.formatDate(Date.now())}.json`,
      mime: "application/json",
      data: JSON.stringify({ app: "meet-attendance-tracker", version: M.RECORD_VERSION, appVersion: M.APP_VERSION, exportedAt: Date.now(), meetings, rosters: rs }, null, 2),
    });
  }

  async function wipe() {
    if (!(await confirmDialog(t("wipe_title"), t("wipe_body"), t("set_deleteAllBtn")))) return;
    const n = await M.deleteAllMeetings();
    toast(t("toast_deletedN", String(n)));
  }

  function renderPrivacy() {
    const li = (k) => h("li", t(k));
    view.replaceChildren(
      pageHead(t("nav_privacy"), t("privacy_sub")),
      h("div.card.section.prose",
        h("h2", t("privacy_collectedTitle")), h("ul", li("privacy_c1"), li("privacy_c2"), li("privacy_c3"), li("privacy_c4")),
        h("h2", t("privacy_storedTitle")), h("p", t("privacy_stored")),
        h("h2", t("privacy_neverTitle")), h("ul", li("privacy_n1"), li("privacy_n2"), li("privacy_n3")),
        h("h2", t("privacy_permTitle")), h("ul", li("privacy_p1"), li("privacy_p2"), li("privacy_p3")),
        h("p.muted", t("privacy_policy")))
    );
  }

  // ── Router ─────────────────────────────────────────────────────────
  async function route() {
    clearInterval(refreshTimer);
    const hash = location.hash || "#/meetings";
    const [, page, arg] = hash.match(/^#\/([^/]+)\/?(.*)$/) || [null, "meetings", ""];
    const navOf = { meeting: "meetings", welcome: "meetings", person: "analytics", roster: "rosters" };
    document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === (navOf[page] || page)));
    const id = decodeURIComponent(arg || "");
    if (page === "meeting") {
      await renderDetail(id);
      const live = (await M.listLive()).some((l) => l.record.id === id);
      if (live) refreshTimer = setInterval(() => { if (!document.activeElement || !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) renderDetail(id); }, 2000);
    } else if (page === "analytics") await renderAnalytics();
    else if (page === "person") await renderPerson(id);
    else if (page === "series") await (id ? renderSeries(id) : renderSeriesList());
    else if (page === "rosters") await renderRosters();
    else if (page === "roster") await renderRosterEditor(id || "new");
    else if (page === "settings") await renderSettings();
    else if (page === "privacy") renderPrivacy();
    else await renderMeetings(page === "welcome");
    document.title = `${t("extName")}`;
    updateUsage();
  }

  async function updateUsage() {
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      document.getElementById("storageUsed").textContent = t("side_used", (bytes / 1024).toFixed(1));
    } catch (_) {}
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      settings = M.sanitizeSettings(changes.settings.newValue);
      applyTheme(settings.theme);
    }
    const meetingsChanged = Object.keys(changes).some((k) => k.startsWith(M.MEETING_PREFIX));
    const onList = !location.hash || /^#\/(meetings|welcome)?$/.test(location.hash);
    if (meetingsChanged && onList && document.activeElement?.type !== "search" && document.getElementById("modal").hidden) route();
  });
  window.addEventListener("hashchange", () => {
    route();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });

  (async () => {
    M.applyI18n(document);
    settings = await M.getSettings();
    applyTheme(settings.theme);
    route();
  })();
})();
