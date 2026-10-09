/* Shared helpers for popup + dashboard pages. */
(function (root) {
  "use strict";
  const COLORS = ["#0f766e", "#7c3aed", "#db2777", "#ea580c", "#2563eb", "#059669", "#ca8a04", "#4f46e5", "#be123c", "#0891b2"];
  function colorFor(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initials(name) {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0])
      .join("")
      .toUpperCase();
  }
  /** Tiny element builder: h("div.card", {onclick}, children...) */
  function h(spec, attrs, ...children) {
    const [tag, ...classes] = spec.split(".");
    const e = document.createElement(tag || "div");
    if (classes.length) e.className = classes.join(" ");
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  function avatar(name, size) {
    const a = h("span.avatar", { style: { background: colorFor(name) } }, initials(name));
    if (size) Object.assign(a.style, { width: size + "px", height: size + "px", fontSize: Math.round(size * 0.4) + "px" });
    return a;
  }
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) document.body.appendChild((t = h("div.toast", { role: "status" })));
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function exportAndDownload(record, fmt, settings, now) {
    const file = root.MAT.exportRecord(record, fmt, settings, now);
    root.MAT.downloadFile(file);
    toast(`Downloaded ${file.filename}`);
    return file;
  }
  root.UI = { h, avatar, colorFor, initials, toast, exportAndDownload };
})(globalThis);
