/*
 * Meet Attendance Tracker: tiny dependency-free SVG charts.
 * Each function returns an SVG string. Colours for axes/labels use
 * currentColor and CSS classes, so charts follow light/dark themes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PALETTE = ["#0f766e", "#f59e0b", "#7c3aed", "#db2777", "#2563eb", "#16a34a", "#ea580c", "#94a3b8"];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toString();
  const trunc = (s, n) => (Array.from(String(s)).length > n ? Array.from(String(s)).slice(0, n - 1).join("") + "…" : String(s));

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function svg(w, h, body, label) {
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label || "chart")}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  function yAxis(x0, x1, top, bottom, max, unit) {
    let out = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const y = bottom - ((bottom - top) * i) / 4;
      out += `<line class="grid" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><text class="axis" x="${x0 - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}${esc(unit || "")}</text>`;
    }
    return out;
  }

  /** Stacked vertical bars. labels: string[], series: [{name, color?, values:number[]}] */
  function stackedBarChart({ labels, series, width = 640, height = 240, unit = "", title = "" }) {
    const L = 40, R = 10, T = 10, B = 44;
    const totals = labels.map((_, i) => series.reduce((n, s) => n + (s.values[i] || 0), 0));
    const max = niceMax(Math.max(0, ...totals));
    const bw = (width - L - R) / Math.max(1, labels.length);
    let body = yAxis(L, width - R, T, height - B, max, unit);
    labels.forEach((lab, i) => {
      let y = height - B;
      const x = L + i * bw + bw * 0.18;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        if (!v) return;
        const h = ((height - B - T) * v) / max;
        y -= h;
        body += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color || PALETTE[si % PALETTE.length]}"><title>${esc(`${lab}: ${s.name} ${fmt(v)}${unit}`)}</title></rect>`;
      });
      if (labels.length <= 16 || i % Math.ceil(labels.length / 16) === 0)
        body += `<text class="axis" x="${(L + i * bw + bw / 2).toFixed(1)}" y="${height - B + 16}" text-anchor="middle">${esc(trunc(lab, 10))}</text>`;
    });
    let lx = L;
    series.forEach((s, si) => {
      body += `<rect x="${lx}" y="${height - 16}" width="10" height="10" rx="2" fill="${s.color || PALETTE[si % PALETTE.length]}"/><text class="legend" x="${lx + 14}" y="${height - 7}">${esc(s.name)}</text>`;
      lx += 24 + s.name.length * 7;
    });
    return svg(width, height, body, title);
  }

  /** Line chart with dots. points: [{label, value, color?, title?}] */
  function lineChart({ points, width = 640, height = 220, unit = "", title = "", color = "#0f766e" }) {
    const L = 40, R = 14, T = 12, B = 30;
    const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
    const step = points.length > 1 ? (width - L - R) / (points.length - 1) : 0;
    const xy = points.map((p, i) => [L + (points.length > 1 ? i * step : (width - L - R) / 2), height - B - ((height - B - T) * p.value) / max]);
    let body = yAxis(L, width - R, T, height - B, max, unit);
    if (xy.length > 1) {
      body += `<path class="area" d="M${xy[0][0]},${height - B} ${xy.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} L${xy[xy.length - 1][0]},${height - B} Z" fill="${color}" opacity="0.12"/>`;
      body += `<polyline class="line" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>`;
    }
    points.forEach((p, i) => {
      const [x, y] = xy[i];
      body += `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${p.color || color}" stroke="#fff" stroke-width="1.5"><title>${esc(p.title || `${p.label}: ${fmt(p.value)}${unit}`)}</title></circle>`;
      if (points.length <= 12 || i % Math.ceil(points.length / 12) === 0)
        body += `<text class="axis" x="${x.toFixed(1)}" y="${height - B + 16}" text-anchor="middle">${esc(trunc(p.label, 10))}</text>`;
    });
    return svg(width, height, body, title);
  }

  /** Horizontal bars. data: [{label, value, display?}] */
  function hBarChart({ data, width = 420, rowHeight = 28, title = "", color = "#0f766e" }) {
    const L = 130, R = 64;
    const height = Math.max(rowHeight, data.length * rowHeight) + 6;
    const max = Math.max(1, ...data.map((d) => d.value));
    let body = "";
    data.forEach((d, i) => {
      const y = i * rowHeight + 4;
      const w = ((width - L - R) * d.value) / max;
      body += `<text class="label" x="${L - 8}" y="${y + rowHeight / 2 + 1}" text-anchor="end" dominant-baseline="middle">${esc(trunc(d.label, 18))}</text>`;
      body += `<rect class="track" x="${L}" y="${y + 5}" width="${width - L - R}" height="${rowHeight - 12}" rx="4"/>`;
      body += `<rect class="bar" x="${L}" y="${y + 5}" width="${Math.max(2, w).toFixed(1)}" height="${rowHeight - 12}" rx="4" fill="${d.color || color}"><title>${esc(`${d.label}: ${d.display || fmt(d.value)}`)}</title></rect>`;
      body += `<text class="value" x="${width - R + 8}" y="${y + rowHeight / 2 + 1}" dominant-baseline="middle">${esc(d.display || fmt(d.value))}</text>`;
    });
    return svg(width, height, body, title);
  }

  /** Donut chart with legend. slices: [{label, value, color?}] */
  function pieChart({ slices, size = 200, width = 420, title = "", format }) {
    const total = slices.reduce((n, s) => n + s.value, 0);
    const cx = size / 2, cy = size / 2, r = size / 2 - 6, ri = r * 0.58;
    let body = "";
    let a0 = -Math.PI / 2;
    if (total <= 0) body += `<circle class="track" cx="${cx}" cy="${cy}" r="${r}"/>`;
    slices.forEach((s, i) => {
      if (total <= 0 || s.value <= 0) return;
      const frac = s.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const color = s.color || PALETTE[i % PALETTE.length];
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      const d = frac >= 0.9999
        ? `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 M${cx - ri},${cy} a${ri},${ri} 0 1,1 ${2 * ri},0 a${ri},${ri} 0 1,1 ${-2 * ri},0Z`
        : `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
      body += `<path class="slice" d="${d}" fill="${color}" fill-rule="evenodd"><title>${esc(`${s.label}: ${Math.round(frac * 100)}%`)}</title></path>`;
      a0 = a1;
    });
    body += `<text class="center" x="${cx}" y="${cy + 6}" text-anchor="middle">${esc(format ? format(total) : fmt(total))}</text>`;
    slices.forEach((s, i) => {
      const y = 14 + i * 22;
      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
      body += `<rect x="${size + 18}" y="${y - 9}" width="12" height="12" rx="3" fill="${s.color || PALETTE[i % PALETTE.length]}"/><text class="legend" x="${size + 36}" y="${y + 1}">${esc(trunc(s.label, 20))} · ${pct}%</text>`;
    });
    return svg(width, Math.max(size, slices.length * 22 + 10), body, title);
  }

  return { stackedBarChart, lineChart, hBarChart, pieChart, CHART_PALETTE: PALETTE, escapeSvg: esc };
});
