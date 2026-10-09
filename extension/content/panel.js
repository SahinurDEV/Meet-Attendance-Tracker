/*
 * Meet Attendance Tracker: in-Meet floating button + live attendance panel.
 * Rendered inside a Shadow DOM so Meet's CSS can't break it and our UI is
 * never mistaken for participants by the detector.
 */
(function (root) {
  "use strict";
  const M = root.MAT;

  const ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4v2a1 1 0 0 0 1 1h9.6a6.5 6.5 0 0 1-.5-6.9A12 12 0 0 0 9 13Zm8.5 0a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm2.2 3.4-2.6 3a.75.75 0 0 1-1.1.03l-1.4-1.4a.75.75 0 1 1 1.06-1.06l.83.83 2.07-2.4a.75.75 0 1 1 1.14.98Z"/></svg>`;

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Google Sans", Roboto, "Segoe UI", system-ui, sans-serif; }
  .wrap { position: fixed; right: 16px; bottom: 96px; z-index: 2147483000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .fab { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px 0 12px; border: 0; border-radius: 20px;
    background: #0f766e; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); }
  .fab:hover { background: #115e59; }
  .fab:focus-visible { outline: 3px solid #5eead4; outline-offset: 2px; }
  .fab .count { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #fff; color: #0f766e; font-size: 12px;
    display: inline-flex; align-items: center; justify-content: center; }
  .fab .rec { width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 0 0 rgba(251,191,36,.7); animation: pulse 2s infinite; }
  .fab.idle .rec { background: #94a3b8; animation: none; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(251,191,36,.6);} 70% { box-shadow: 0 0 0 8px rgba(251,191,36,0);} 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0);} }
  .panel { width: 360px; max-height: min(72vh, 600px); display: none; flex-direction: column; background: #fff; color: #0f172a;
    border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.4); overflow: hidden; }
  .panel.open { display: flex; }
  .head { padding: 14px 16px 12px; background: linear-gradient(135deg, #0f766e, #134e4a); color: #fff; }
  .head .row1 { display: flex; align-items: center; gap: 8px; }
  .head h2 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; letter-spacing: .1px; }
  .head .code { font-size: 12px; opacity: .85; margin-top: 2px; }
  .x { border: 0; background: rgba(255,255,255,.15); color: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1; }
  .x:hover { background: rgba(255,255,255,.28); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
  .stat { background: rgba(255,255,255,.12); border-radius: 10px; padding: 6px 8px; }
  .stat b { display: block; font-size: 16px; }
  .stat span { font-size: 10.5px; opacity: .85; text-transform: uppercase; letter-spacing: .4px; }
  .search { margin: 10px 12px 4px; }
  .search input { width: 100%; height: 34px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0 10px; font-size: 13px; color: #0f172a; background: #f8fafc; }
  .search input:focus { outline: 2px solid #14b8a6; border-color: transparent; background: #fff; }
  .list { overflow-y: auto; padding: 4px 6px 8px; flex: 1; min-height: 80px; }
  .empty { padding: 26px 16px; text-align: center; color: #64748b; font-size: 13px; }
  .p { display: flex; align-items: center; gap: 10px; padding: 8px 8px; border-radius: 10px; }
  .p:hover { background: #f1f5f9; }
  .av { position: relative; width: 34px; height: 34px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 13px; }
  .av .dot { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; border: 2px solid #fff; background: #94a3b8; }
  .p.present .av .dot { background: #22c55e; }
  .p.speaking .av { box-shadow: 0 0 0 3px #5eead4; }
  .info { flex: 1; min-width: 0; }
  .nm { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .you { font-size: 10px; font-weight: 700; color: #0f766e; background: #ccfbf1; border-radius: 6px; padding: 1px 5px; margin-left: 4px; vertical-align: 1px; }
  .sub { font-size: 11.5px; color: #64748b; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { text-align: right; flex: none; }
  .num b { font-size: 13px; font-variant-numeric: tabular-nums; }
  .bar { width: 64px; height: 4px; background: #e2e8f0; border-radius: 2px; margin-top: 5px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #14b8a6; }
  .spk { font-size: 10.5px; color: #64748b; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .foot { border-top: 1px solid #e2e8f0; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: #f8fafc; }
  .btns { display: flex; gap: 6px; }
  .btn { flex: 1; height: 32px; border-radius: 9px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: #f1f5f9; }
  .btn.primary { background: #0f766e; border-color: #0f766e; color: #fff; flex: 1.4; }
  .btn.primary:hover { background: #115e59; }
  .status { font-size: 11.5px; color: #64748b; display: flex; justify-content: space-between; gap: 8px; }
  .status a { color: #0f766e; font-weight: 600; cursor: pointer; text-decoration: none; }
  .toast { position: absolute; right: 0; bottom: 50px; background: #0f172a; color: #fff; font-size: 12.5px; padding: 8px 12px; border-radius: 9px;
    opacity: 0; transform: translateY(6px); transition: all .2s; pointer-events: none; white-space: nowrap; }
  .toast.show { opacity: 1; transform: none; }
  `;

  const COLORS = ["#0f766e", "#7c3aed", "#db2777", "#ea580c", "#2563eb", "#059669", "#ca8a04", "#4f46e5", "#be123c", "#0891b2"];
  const colorFor = (s) => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  const initials = (name) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0])
      .join("")
      .toUpperCase();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /**
   * handlers: { onSave(), onExport(fmt), onDashboard() }
   * returns { render(view), toast(msg), setVisible(bool), host }
   */
  function createPanel(handlers) {
    const host = document.createElement("div");
    host.id = "mat-attendance-host";
    host.setAttribute("data-mat-ui", "");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="wrap">
        <div class="panel" role="dialog" aria-label="Attendance">
          <div class="head">
            <div class="row1">${ICON}<h2>Attendance</h2><button class="x" title="Close" aria-label="Close attendance panel">×</button></div>
            <div class="code"></div>
            <div class="stats">
              <div class="stat"><b data-k="present">0</b><span>In call</span></div>
              <div class="stat"><b data-k="total">0</b><span>Total seen</span></div>
              <div class="stat"><b data-k="duration">0s</b><span>Duration</span></div>
            </div>
          </div>
          <div class="search"><input type="search" placeholder="Search participants…" aria-label="Search participants"></div>
          <div class="list" role="list"></div>
          <div class="foot">
            <div class="btns">
              <button class="btn primary" data-act="save">Save now</button>
              <button class="btn" data-act="csv">CSV</button>
              <button class="btn" data-act="xlsx">XLSX</button>
              <button class="btn" data-act="pdf">PDF</button>
            </div>
            <div class="status"><span class="saved"></span><a data-act="dashboard">Open dashboard ↗</a></div>
          </div>
        </div>
        <div class="toast"></div>
        <button class="fab idle" aria-expanded="false" title="Meet Attendance Tracker">${ICON}<span class="rec"></span><span class="lbl">Attendance</span><span class="count">0</span></button>
      </div>`;

    const $ = (s) => shadow.querySelector(s);
    const panel = $(".panel");
    const fab = $(".fab");
    const list = $(".list");
    const search = $("input");
    const toastEl = $(".toast");
    let lastView = null;

    const setOpen = (open) => {
      panel.classList.toggle("open", open);
      fab.setAttribute("aria-expanded", String(open));
      if (open && lastView) render(lastView);
    };
    fab.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
    $(".x").addEventListener("click", () => setOpen(false));
    search.addEventListener("input", () => lastView && render(lastView));
    shadow.addEventListener("click", (e) => {
      const act = e.target.closest && e.target.closest("[data-act]");
      if (!act) return;
      const a = act.getAttribute("data-act");
      if (a === "save") handlers.onSave();
      else if (a === "dashboard") handlers.onDashboard();
      else handlers.onExport(a);
    });
    // Keep Meet's global keyboard shortcuts from firing while typing in our search box.
    ["keydown", "keyup", "keypress"].forEach((t) => search.addEventListener(t, (e) => e.stopPropagation()));

    let toastTimer = null;
    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    }

    /** view: { code, title, active, rows, durationMs, settings, savedLabel } */
    function render(view) {
      lastView = view;
      const rows = view.rows || [];
      const present = rows.filter((r) => r.present).length;
      fab.classList.toggle("idle", !view.active);
      fab.querySelector(".count").textContent = String(view.active ? present : rows.length);
      if (!panel.classList.contains("open")) return;

      $(".code").textContent = [view.title, view.code].filter(Boolean).join(" · ") || "Waiting for the call to start…";
      $('[data-k="present"]').textContent = String(present);
      $('[data-k="total"]').textContent = String(rows.length);
      $('[data-k="duration"]').textContent = M.formatDuration(view.durationMs || 0);
      $(".saved").textContent = view.savedLabel || "";

      const q = search.value.trim().toLowerCase();
      const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
      const maxSpk = Math.max(1, ...rows.map((r) => r.speakingMs));
      const tf = (view.settings && view.settings.timeFormat) || "24h";
      const frag = document.createDocumentFragment();
      if (!shown.length) {
        frag.appendChild(el("div", "empty", rows.length ? "No one matches your search." : "No participants detected yet. Open Meet's People panel to speed up detection."));
      }
      // Present first, then by first seen.
      shown
        .slice()
        .sort((a, b) => (b.present - a.present) || a.firstSeen - b.firstSeen)
        .forEach((r) => {
          const row = el("div", "p" + (r.present ? " present" : "") + (r.speaking ? " speaking" : ""));
          row.setAttribute("role", "listitem");
          row.setAttribute("data-name", r.name);
          const av = el("div", "av", initials(r.name));
          av.style.background = colorFor(r.name);
          av.appendChild(el("span", "dot"));
          const info = el("div", "info");
          const nm = el("div", "nm", r.name);
          if (r.isSelf) nm.appendChild(el("span", "you", "YOU"));
          info.appendChild(nm);
          const status = r.present ? "In call" : `Left ${M.formatTime(r.lastSeen, tf, false)}`;
          info.appendChild(el("div", "sub", `${status} · joined ${M.formatTime(r.firstSeen, tf, false)}${r.joins > 1 ? ` · ${r.joins} joins` : ""}`));
          const num = el("div", "num");
          num.appendChild(el("b", null, M.formatDuration(r.timeInCallMs)));
          const bar = el("div", "bar");
          const fill = el("i");
          fill.style.width = `${Math.round((r.speakingMs / maxSpk) * 100)}%`;
          bar.appendChild(fill);
          num.appendChild(bar);
          num.appendChild(el("div", "spk", `🎙 ${M.formatDuration(r.speakingMs)}`));
          row.append(av, info, num);
          frag.appendChild(row);
        });
      list.replaceChildren(frag);
    }

    function setVisible(v) {
      host.style.display = v ? "" : "none";
    }

    (document.body || document.documentElement).appendChild(host);
    return { render, toast, setVisible, setOpen, host };
  }

  root.MAT = Object.assign(root.MAT || {}, { createPanel });
})(globalThis);
