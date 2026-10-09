/*
 * Meet Attendance Tracker: canvas text renderer for PDF export.
 *
 * The PDF writer uses the built-in Helvetica font, which only covers Latin-1.
 * For anything else (Bengali, Arabic, CJK, emoji…) it asks this renderer for
 * an alpha mask of the text. The browser's own text engine does the shaping,
 * so conjuncts and vowel signs come out right. It uses whatever fonts are on
 * the user's system: Bengali shows with Nirmala UI / Vrinda on Windows,
 * Kohinoor Bangla on macOS, Noto Sans Bengali on Linux.
 */
(function (root) {
  "use strict";
  const FONT_STACK =
    '"Noto Sans Bengali", "Nirmala UI", "Vrinda", "Kohinoor Bangla", "Bangla Sangam MN", "Hind Siliguri", "Noto Sans", "Segoe UI", "Arial Unicode MS", sans-serif';
  const SCALE = 4; // pixels per PDF point (≈288 dpi)

  function createTextRenderer(opts = {}) {
    const scale = opts.scale || SCALE;
    const make = (w, h) => {
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
    const measureCtx = make(8, 8).getContext("2d");
    const font = (size, bold) => `${bold ? "700" : "400"} ${size * scale}px ${FONT_STACK}`;
    const cache = new Map();

    function measure(text, size, bold) {
      measureCtx.font = font(size, bold);
      return measureCtx.measureText(text).width / scale;
    }

    function render(text, size, bold) {
      const key = `${size}|${bold ? 1 : 0}|${text}`;
      if (cache.has(key)) return cache.get(key);
      measureCtx.font = font(size, bold);
      const m = measureCtx.measureText(text);
      const ascent = Math.max(m.actualBoundingBoxAscent || 0, size * scale * 0.95);
      const descent = Math.max(m.actualBoundingBoxDescent || 0, size * scale * 0.3);
      const w = Math.max(1, Math.ceil(m.width + 2));
      const h = Math.max(1, Math.ceil(ascent + descent + 2));
      const canvas = make(w, h);
      const ctx = canvas.getContext("2d");
      ctx.font = font(size, bold);
      ctx.fillStyle = "#000";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, 1, Math.ceil(ascent) + 1);
      const px = ctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
      const out = { w, h, alpha, widthPt: w / scale, heightPt: h / scale, baselinePt: (h - Math.ceil(ascent) - 1) / scale };
      cache.set(key, out);
      return out;
    }
    return { measure, render };
  }

  root.MAT = Object.assign(root.MAT || {}, { createTextRenderer });
})(globalThis);
