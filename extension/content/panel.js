/*
 * Meet Attendance Tracker: in-Meet floating button + live attendance panel.
 * Rendered inside a Shadow DOM so Meet's CSS can't break it and our UI is
 * never mistaken for participants by the detector.
 */
(function (root) {
  "use strict";
  const M = root.MAT;
  const t = M.t;

  const ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4v2a1 1 0 0 0 1 1h9.6a6.5 6.5 0 0 1-.5-6.9A12 12 0 0 0 9 13Zm8.5 0a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm2.2 3.4-2.6 3a.75.75 0 0 1-1.1.03l-1.4-1.4a.75.75 0 1 1 1.06-1.06l.83.83 2.07-2.4a.75.75 0 1 1 1.14.98Z"/></svg>`;

  const LIGHT = `--bg:#ffffff;--bg2:#f8fafc;--hover:#f1f5f9;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--btn:#ffffff;--btnline:#cbd5e1;--input:#f8fafc;--chip:#ccfbf1;--chipink:#0f766e;`;
  const DARK = `--bg:#111a2b;--bg2:#0b1220;--hover:#1a2538;--ink:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--btn:#162033;--btnline:#2b3a52;--input:#0b1220;--chip:#134e4a;--chipink:#99f6e4;`;

  const CSS = `
  :host { all: initial; ${LIGHT} }
  :host([data-theme="dark"]) { ${DARK} }
  @media (prefers-color-scheme: dark) { :host(:not([data-theme="light"])) { ${DARK} } }
  * { box-sizing: border-box; font-family: "Google Sans", Roboto, "Segoe UI", "Noto Sans Bengali", "Nirmala UI", system-ui, sans-serif; }
  .wrap { position: fixed; right: 16px; bottom: 96px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .fab { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 12px; border: 0; border-radius: 20px;
    background: #0f766e; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  .fab:hover { background: #115e59; }
  .fab:focus-visible { outline: 3px solid #5eead4; outline-offset: 2px; }
  .fab .count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #fff; color: #0f766e; font-size: 12px;
    display: inline-flex; align-items: center; justify-content: center; }
  .fab .rec { width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; animation: pulse 2s infinite; }
  .fab.idle .rec { background: #94a3b8; animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(251,191,36,.6);} 70% { box-shadow: 0 0 0 8px rgba(251,191,36,0);} 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0);} }
  .panel { width: 372px; max-height: min(74vh, 640px); display: none; flex-direction: column; background: var(--bg); color: var(--ink);
    border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.45); overflow: hidden; }
  .panel.open { display: flex; }
  .head { padding: 14px 16px 12px; background: linear-gradient(135deg, #0f766e, #134e4a); color: #fff; }
  .head .row1 { display: flex; align-items: center; gap: 8px; }
  .head h2 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; }
  .head .code { font-size: 12px; opacity: .85; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .x { border: 0; background: rgba(255,255,255,.15); color: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1; }
  .x:hover { background: rgba(255,255,255,.28); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
  .stat { background: rgba(255,255,255,.12); border-radius: 10px; padding: 6px 8px; }
  .stat b { display: block; font-size: 16px; }
  .stat span { font-size: 10.5px; opacity: .85; text-transform: uppercase; letter-spacing: .4px; }
  .search { margin: 10px 12px 4px; }
  .search input { width: 100%; height: 34px; border: 1px solid var(--line); border-radius: 10px; padding: 0 10px; font-size: 13px; color: var(--ink); background: var(--input); }
  .search input:focus { outline: 2px solid #14b8a6; border-color: transparent; }
  .list { overflow-y: auto; padding: 4px 6px 8px; flex: 1; min-height: 80px; }
  .empty { padding: 26px 16px; text-align: center; color: var(--muted); font-size: 13px; }
  .sect { font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); padding: 10px 8px 4px; }
  .p { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 10px; }
  .p:hover { background: var(--hover); }
  .p.absent { opacity: .7; }
  .av { position: relative; width: 34px; height: 34px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 13px; }
  .av .dot { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--bg); background: #94a3b8; }
  .p.present .av .dot { background: #22c55e; }
  .p.absent .av { background: transparent !important; border: 2px dashed #ef4444; color: #ef4444; }
  .p.speaking .av { box-shadow: 0 0 0 3px #5eead4; }
  .info { flex: 1; min-width: 0; }
  .nm { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 10px; font-weight: 700; border-radius: 6px; padding: 1px 5px; margin-left: 4px; vertical-align: 1px; }
  .tag.you { color: var(--chipink); background: var(--chip); }
  .tag.late { color: #b45309; background: #fef3c7; }
  .tag.short { color: #6d28d9; background: #ede9fe; }
  .tag.absent { color: #b91c1c; background: #fee2e2; }
  .tag.guest { color: var(--muted); background: var(--hover); }
  .sub { font-size: 11.5px; color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { text-align: right; flex: none; }
  .num b { font-size: 13px; font-variant-numeric: tabular-nums; }
  .bar { width: 64px; height: 4px; background: var(--line); border-radius: 2px; margin-top: 5px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #14b8a6; }
  .spk { font-size: 10.5px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .foot { border-top: 1px solid var(--line); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--bg2); }
  .btns { display: flex; gap: 6px; }
  .btn { flex: 1; height: 32px; border-radius: 9px; border: 1px solid var(--btnline); background: var(--btn); color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .btn:hover { filter: brightness(.96); }
  .btn.primary { background: #0f766e; border-color: #0f766e; color: #fff; flex: 1.5; }
  .links { display: flex; gap: 12px; font-size: 12px; flex-wrap: wrap; }
  .links a, .status a { color: #14b8a6; font-weight: 600; cursor: pointer; text-decoration: none; }
  .status { font-size: 11.5px; color: var(--muted); display: flex; justify-content: space-between; gap: 8px; }
  .toasts { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: none; }
  .toast { background: #0f172a; color: #fff; font-size: 12.5px; padding: 8px 12px; border-radius: 9px; box-shadow: 0 6px 18px rgba(0,0,0,.3);
    max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: tin .2s ease-out; border-left: 4px solid #14b8a6; }
  .toast.leave { border-left-color: #f59e0b; }
  .toast.info { border-left-color: #94a3b8; }
  @keyframes tin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  `;

  const COLORS = ["#0f766e", "#7c3aed", "#db2777", "#ea580c", "#2563eb", "#059669", "#ca8a04", "#4f46e5", "#be123c", "#0891b2"];
  const colorFor = (s) => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /**
   * handlers: { onSave(), onExport(fmt), onCopy(), onDashboard() }
   */
  function createPanel(handlers) {
    const host = document.createElement("div");
    host.id = "mat-attendance-host";
    host.setAttribute("data-mat-ui", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="wrap">
        <div class="panel" role="dialog">
          <div class="head">
            <div class="row1">${ICON}<h2></h2><button class="x">×</button></div>
            <div class="code"></div>
            <div class="stats">
              <div class="stat"><b data-k="present">0</b><span data-l="present"></span></div>
              <div class="stat"><b data-k="total">0</b><span data-l="total"></span></div>
              <div class="stat"><b data-k="duration">0s</b><span data-l="duration"></span></div>
            </div>
          </div>
          <div class="search"><input type="search"></div>
          <div class="list" role="list"></div>
          <div class="foot">
            <div class="btns">
              <button class="btn primary" data-act="save"></button>
              <button class="btn" data-act="csv">CSV</button>
              <button class="btn" data-act="xlsx">XLSX</button>
              <button class="btn" data-act="pdf">PDF</button>
            </div>
            <div class="links"><a data-act="copy"></a><a data-act="json">JSON</a><a data-act="chat-csv"></a></div>
            <div class="status"><span class="saved"></span><a data-act="dashboard"></a></div>
          </div>
        </div>
        <div class="toasts" aria-live="polite"></div>
        <button class="fab idle" aria-expanded="false">${ICON}<span class="rec"></span><span class="lbl"></span><span class="count">0</span></button>
      </div>`;

    const $ = (s) => shadow.querySelector(s);
    const panel = $(".panel");
    const fab = $(".fab");
    const list = $(".list");
    const search = $("input");
    const toasts = $(".toasts");
    let lastView = null;

    // Localised labels
    panel.setAttribute("aria-label", t("panel_title"));
    $("h2").textContent = t("panel_title");
    $(".x").setAttribute("aria-label", t("panel_close"));
    $(".x").title = t("panel_close");
    $('[data-l="present"]').textContent = t("stat_inCall");
    $('[data-l="total"]').textContent = t("stat_totalSeen");
    $('[data-l="duration"]').textContent = t("stat_duration");
    search.placeholder = t("panel_search");
    search.setAttribute("aria-label", t("panel_search"));
    $('[data-act="save"]').textContent = t("btn_saveNow");
    $('[data-act="copy"]').textContent = t("btn_copyTable");
    $('[data-act="chat-csv"]').textContent = t("btn_chatCsv");
    $('[data-act="dashboard"]').textContent = t("btn_openDashboard") + " ↗";
    $(".lbl").textContent = t("panel_title");
    fab.title = `${t("extName")} (Alt+Shift+M)`;

    const setOpen = (open) => {
      panel.classList.toggle("open", open);
      fab.setAttribute("aria-expanded", String(open));
      if (open && lastView) render(lastView);
    };
    const isOpen = () => panel.classList.contains("open");
    fab.addEventListener("click", () => setOpen(!isOpen()));
    $(".x").addEventListener("click", () => setOpen(false));
    search.addEventListener("input", () => lastView && render(lastView));
    shadow.addEventListener("click", (e) => {
      const act = e.target.closest && e.target.closest("[data-act]");
      if (!act) return;
      const a = act.getAttribute("data-act");
      if (a === "save") handlers.onSave();
      else if (a === "dashboard") handlers.onDashboard();
      else if (a === "copy") handlers.onCopy();
      else handlers.onExport(a);
    });
    // Keep Meet's global keyboard shortcuts from firing while typing in our search box.
    ["keydown", "keyup", "keypress"].forEach((ty) => search.addEventListener(ty, (e) => e.stopPropagation()));

    /** kind: "join" | "leave" | "info" */
    function toast(msg, kind = "info") {
      const n = el("div", `toast ${kind}`, msg);
      toasts.appendChild(n);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      setTimeout(() => n.remove(), 3500);
    }

    function row(r, tf, maxSpk) {
      const absent = r.status === "absent";
      const node = el("div", "p" + (r.present ? " present" : "") + (r.speaking ? " speaking" : "") + (absent ? " absent" : ""));
      node.setAttribute("role", "listitem");
      node.setAttribute("data-name", r.name);
      if (r.status) node.setAttribute("data-status", r.status);
      const av = el("div", "av", initials(r.name));
      if (!absent) av.style.background = colorFor(r.name);
      av.appendChild(el("span", "dot"));
      const info = el("div", "info");
      const nm = el("div", "nm", r.name);
      if (r.isSelf) nm.appendChild(el("span", "tag you", t("tag_you")));
      if (r.status && r.status !== "present") nm.appendChild(el("span", `tag ${r.status}`, M.tStatus(r.status)));
      if (r.onRoster === false) nm.appendChild(el("span", "tag guest", t("tag_guest")));
      info.appendChild(nm);
      if (absent) {
        info.appendChild(el("div", "sub", t("panel_notJoined")));
        node.append(av, info);
        return node;
      }
      const status = r.present ? t("panel_inCall") : t("panel_leftAt", M.formatTime(r.lastSeen, tf, false));
      const joins = r.joins > 1 ? ` · ${t("panel_joins", String(r.joins))}` : "";
      info.appendChild(el("div", "sub", `${status} · ${t("panel_joinedAt", M.formatTime(r.firstSeen, tf, false))}${joins}`));
      const num = el("div", "num");
      num.appendChild(el("b", null, M.formatDuration(r.timeInCallMs)));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = `${Math.round((r.speakingMs / maxSpk) * 100)}%`;
      bar.appendChild(fill);
      num.appendChild(bar);
      num.appendChild(el("div", "spk", `🎙 ${M.formatDuration(r.speakingMs)}`));
      node.append(av, info, num);
      return node;
    }

    /** view: { code, title, active, rows, absentees, summary, durationMs, settings, savedLabel, chatCount } */
    function render(view) {
      lastView = view;
      const rows = view.rows || [];
      const absentees = view.absentees || [];
      const present = rows.filter((r) => r.present).length;
      fab.classList.toggle("idle", !view.active);
      fab.querySelector(".count").textContent = String(view.active ? present : rows.length);
      host.setAttribute("data-theme", (view.settings && view.settings.theme) || "system");
      if (!isOpen()) return;

      $(".code").textContent = [view.title, view.code].filter(Boolean).join(" · ") || t("panel_waiting");
      $('[data-k="present"]').textContent = String(present);
      const expected = view.summary && view.summary.expected;
      $('[data-k="total"]').textContent = expected != null ? `${expected - absentees.length}/${expected}` : String(rows.length);
      $('[data-l="total"]').textContent = expected != null ? t("stat_expected") : t("stat_totalSeen");
      $('[data-k="duration"]').textContent = M.formatDuration(view.durationMs || 0);
      $(".saved").textContent = view.savedLabel + (view.chatCount ? ` · 💬 ${view.chatCount}` : "");

      const q = search.value.trim().toLowerCase();
      const match = (r) => !q || r.name.toLowerCase().includes(q);
      const shown = rows.filter(match);
      const missing = absentees.filter(match);
      const maxSpk = Math.max(1, ...rows.map((r) => r.speakingMs));
      const tf = (view.settings && view.settings.timeFormat) || "24h";
      const frag = document.createDocumentFragment();
      if (!shown.length && !missing.length) {
        frag.appendChild(el("div", "empty", rows.length ? t("panel_noMatch") : t("panel_empty")));
      }
      shown
        .slice()
        .sort((a, b) => b.present - a.present || a.firstSeen - b.firstSeen)
        .forEach((r) => frag.appendChild(row(r, tf, maxSpk)));
      if (missing.length) {
        frag.appendChild(el("div", "sect", `${t("panel_notHere")} (${missing.length})`));
        missing.forEach((a) => frag.appendChild(row(a, tf, maxSpk)));
      }
      list.replaceChildren(frag);
    }

    function setVisible(v) {
      host.style.display = v ? "" : "none";
    }

    (document.body || document.documentElement).appendChild(host);
    return { render, toast, setVisible, setOpen, isOpen, host };
  }

  root.MAT = Object.assign(root.MAT || {}, { createPanel });
})(globalThis);
