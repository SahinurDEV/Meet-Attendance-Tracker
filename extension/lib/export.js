/*
 * Meet Attendance Tracker: export encoders.
 *
 * Self-contained, dependency-free writers for CSV, XLSX (Office Open XML in a
 * stored ZIP) and PDF (PDF 1.4 with the standard Helvetica fonts). Everything
 * runs locally; no remote code, no network.
 */
(function (root, factory) {
  const core = root.MAT || (typeof require === "function" ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const APP_NAME = "Meet Attendance Tracker";
  const utf8 = (s) => new TextEncoder().encode(s);

  // ── Table model shared by all formats ──────────────────────────────
  const HEADERS = ["#", "Name", "First Seen", "Last Seen", "Time in Call", "Speaking Time", "Joins"];

  function buildTable(record, settings = {}, now) {
    const tf = settings.timeFormat || "24h";
    const rows = core.filterRows(core.computeRows(record, now), settings);
    const at = now != null ? now : record.endedAt != null ? record.endedAt : record.updatedAt;
    const durationMs = core.meetingDuration(record, at);
    return {
      title: record.title || (record.code ? `Google Meet ${record.code}` : "Google Meet"),
      meta: [
        ["Meeting", record.title || record.code || ""],
        ["Meeting code", record.code || ""],
        ["Date", core.formatDate(record.startedAt)],
        ["Started", core.formatTime(record.startedAt, tf)],
        ["Ended", record.endedAt != null ? core.formatTime(record.endedAt, tf) : "In progress"],
        ["Duration", core.formatClock(durationMs)],
        ["Participants", String(rows.length)],
      ],
      headers: HEADERS.slice(),
      rows: rows.map((r, i) => [
        String(i + 1),
        r.name + (r.isSelf ? " (You)" : ""),
        core.formatTime(r.firstSeen, tf),
        core.formatTime(r.lastSeen, tf),
        core.formatClock(r.timeInCallMs),
        core.formatClock(r.speakingMs),
        String(r.joins),
      ]),
    };
  }

  // ── CSV ────────────────────────────────────────────────────────────
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection from participant names.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(table) {
    const lines = [table.headers, ...table.rows].map((r) => r.map(csvCell).join(","));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  // ── ZIP (store only) ───────────────────────────────────────────────
  let CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** files: [{name, data: Uint8Array|string, date?: Date}] → Uint8Array */
  function zip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = utf8(f.name);
      const data = typeof f.data === "string" ? utf8(f.data) : f.data;
      const d = f.date || new Date(1980, 0, 1);
      const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      const dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 names
      lh.setUint16(8, 0, true); // stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      locals.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(38, f.name.endsWith("/") ? 0x10 : 0, true);
      ch.setUint32(42, offset, true);
      centrals.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = centrals.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return concat([...locals, ...centrals, new Uint8Array(end.buffer)]);
  }

  function concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  // ── XLSX ───────────────────────────────────────────────────────────
  const xmlEsc = (s) =>
    String(s == null ? "" : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function colName(i) {
    let s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function toXLSX(table) {
    const rowsXml = [];
    let r = 0;
    const row = (cells, style) => {
      r++;
      const cs = cells
        .map((v, c) => {
          const ref = colName(c) + r;
          const st = style ? ` s="${style}"` : "";
          if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        })
        .join("");
      rowsXml.push(`<row r="${r}">${cs}</row>`);
    };
    row([`${APP_NAME}: ${table.title}`], 2);
    for (const [k, v] of table.meta) row([k, v], 0);
    r++; // blank spacer row
    const headerRow = r + 1;
    row(table.headers, 1);
    for (const data of table.rows) row(data.map((v, i) => (i === 0 || i === 6 ? Number(v) : v)), 0);

    const widths = [5, 32, 14, 14, 14, 14, 8];
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const lastRef = colName(table.headers.length - 1) + Math.max(headerRow, r);
    const sheet =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${rowsXml.join("")}</sheetData>` +
      `<autoFilter ref="A${headerRow}:${lastRef}"/></worksheet>`;

    const files = [
      {
        name: "[Content_Types].xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `</Types>`,
      },
      {
        name: "_rels/.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `</Relationships>`,
      },
      {
        name: "docProps/core.xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
          `<dc:title>${xmlEsc(table.title)}</dc:title><dc:creator>${APP_NAME}</dc:creator></cp:coreProperties>`,
      },
      {
        name: "xl/workbook.xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="Attendance" sheetId="1" r:id="rId1"/></sheets>` +
          `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Attendance!$A$${headerRow}:$${colName(
            table.headers.length - 1
          )}$${Math.max(headerRow, r)}</definedName></definedNames></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      },
      {
        name: "xl/styles.xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>` +
          `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
          `<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>` +
          `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>` +
          `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
          `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
          `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
          `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      },
      { name: "xl/worksheets/sheet1.xml", data: sheet },
    ];
    return zip(files);
  }

  // ── PDF ────────────────────────────────────────────────────────────
  // Helvetica advance widths (1/1000 em) for ASCII 32..126 (standard AFM).
  const HELV = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
    556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
    556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
    556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
    500, 500, 500, 334, 260, 334, 584,
  ];
  function textWidth(s, size, bold) {
    let w = 0;
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
    }
    return (w * size * (bold ? 1.06 : 1)) / 1000;
  }

  /** Map text into the WinAnsi (≈Latin-1) range used by the base-14 fonts. */
  function toWinAnsi(s) {
    let out = "";
    for (const ch of String(s == null ? "" : s)) {
      const c = ch.codePointAt(0);
      if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) out += ch;
      else {
        const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        out += base && /^[\x20-\x7e]+$/.test(base) ? base : "?";
      }
    }
    return out;
  }

  const pdfStr = (s) => "(" + toWinAnsi(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";

  function fit(s, size, bold, maxW) {
    s = toWinAnsi(s);
    if (textWidth(s, size, bold) <= maxW) return s;
    while (s.length > 1 && textWidth(s + "...", size, bold) > maxW) s = s.slice(0, -1);
    return s + "...";
  }

  function toPDF(table, opts = {}) {
    const W = 842, H = 595, M = 40; // A4 landscape
    const colW = [30, 250, 95, 95, 95, 95, 50];
    const scale = (W - 2 * M) / colW.reduce((a, b) => a + b, 0);
    const cols = colW.map((w) => w * scale);
    const rowH = 20;
    const generated = opts.generatedAt != null ? opts.generatedAt : Date.now();

    const pages = [];
    let ops = null;
    let y = 0;
    const text = (x, yy, s, size, bold, color) =>
      ops.push(`BT ${color || "0.12 0.16 0.22"} rg /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
    const rect = (x, yy, w, h, color) => ops.push(`${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

    const tableHeader = () => {
      rect(M, y - rowH + 6, W - 2 * M, rowH, "0.059 0.463 0.431");
      let x = M;
      table.headers.forEach((h, i) => {
        text(x + 6, y - 8, fit(h, 9.5, true, cols[i] - 10), 9.5, true, "1 1 1");
        x += cols[i];
      });
      y -= rowH;
    };
    const newPage = (first) => {
      ops = [];
      pages.push(ops);
      y = H - M;
      if (first) {
        rect(0, H - 8, W, 8, "0.059 0.463 0.431");
        text(M, y - 14, "Attendance Report", 20, true);
        text(M, y - 32, fit(table.title, 11, false, W - 2 * M), 11, false, "0.35 0.4 0.47");
        y -= 52;
        const meta = table.meta.filter(([k]) => k !== "Meeting");
        const boxW = (W - 2 * M) / meta.length;
        meta.forEach(([k, v], i) => {
          const x = M + i * boxW;
          rect(x + 2, y - 36, boxW - 4, 40, "0.94 0.97 0.96");
          text(x + 10, y - 10, k.toUpperCase(), 7, true, "0.35 0.4 0.47");
          text(x + 10, y - 27, fit(v, 11, true, boxW - 20), 11, true);
        });
        y -= 56;
      }
      tableHeader();
    };

    newPage(true);
    if (!table.rows.length) {
      text(M + 6, y - 14, "No participants recorded.", 10, false, "0.35 0.4 0.47");
    }
    table.rows.forEach((row, ri) => {
      if (y - rowH < M + 24) newPage(false);
      if (ri % 2 === 1) rect(M, y - rowH + 6, W - 2 * M, rowH, "0.965 0.973 0.98");
      let x = M;
      row.forEach((cell, i) => {
        text(x + 6, y - 8, fit(cell, 9.5, i === 1, cols[i] - 10), 9.5, i === 1);
        x += cols[i];
      });
      y -= rowH;
    });

    const footer = `Generated locally by ${APP_NAME} on ${core.formatDateTime(generated, opts.timeFormat || "24h")}`;
    pages.forEach((p, i) => {
      ops = p;
      text(M, 22, footer, 8, false, "0.5 0.55 0.6");
      const pg = `Page ${i + 1} of ${pages.length}`;
      text(W - M - textWidth(pg, 8, false), 22, pg, 8, false, "0.5 0.55 0.6");
    });

    // Assemble objects: 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then page/content pairs.
    const objs = [];
    const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
    objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    objs.push(`<< /Title ${pdfStr(`Attendance: ${table.title}`)} /Producer ${pdfStr(APP_NAME)} /Creator ${pdfStr(APP_NAME)} >>`);
    pages.forEach((p, i) => {
      const stream = p.join("\n");
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`
      );
      objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [];
    objs.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Every char is in 0..255 (WinAnsi), so latin1 → bytes is 1:1.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  const MIME = {
    csv: "text/csv;charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
    json: "application/json",
  };

  /** Build {filename, mime, data} for a record in the given format. */
  function exportRecord(record, format, settings = {}, now) {
    const table = buildTable(record, settings, now);
    let data;
    if (format === "csv") data = toCSV(table);
    else if (format === "xlsx") data = toXLSX(table);
    else if (format === "pdf") data = toPDF(table, { timeFormat: settings.timeFormat });
    else throw new Error("Unknown export format: " + format);
    return { filename: core.exportFileName(record, format), mime: MIME[format], data };
  }

  /** Browser-only: trigger a download through an <a download> link (no permission needed). */
  function downloadFile(file) {
    const blob = new Blob([file.data], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.style.display = "none";
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  return { buildTable, toCSV, toXLSX, toPDF, zip, crc32, exportRecord, downloadFile, toWinAnsi, EXPORT_HEADERS: HEADERS };
});
