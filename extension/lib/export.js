/*
 * Meet Attendance Tracker: export encoders.
 *
 * Self-contained, dependency-free writers for CSV, TSV (copy as table),
 * JSON, XLSX (Office Open XML in a stored ZIP) and PDF (PDF 1.4). Text the
 * standard PDF fonts can't show (Bengali, CJK, …) is embedded as small
 * alpha-masked images rendered by the browser's own text engine, so complex
 * scripts are shaped correctly. Everything runs locally; no remote code.
 */
(function (root, factory) {
  const req = (p) => (typeof require === "function" ? require(p) : null);
  const core = root.MAT && root.MAT.computeRows ? root.MAT : req("./core.js");
  const rules = root.MAT && root.MAT.evaluateAttendance ? root.MAT : req("./rules.js");
  const api = factory(Object.assign({}, core, rules));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const APP_NAME = "Meet Attendance Tracker";
  const APP_VERSION = "2.1.1";
  const utf8 = (s) => new TextEncoder().encode(s);

  // ── Table model shared by all formats ──────────────────────────────
  const HEADERS = ["#", "Name", "Status", "First Seen", "Last Seen", "Time in Call", "Speaking Time", "Joins"];

  /**
   * ctx: { roster } (optional expected-attendee list)
   * Returns a format-neutral table plus summary, chat and per-row status.
   */
  function buildTable(record, settings = {}, now, ctx = {}) {
    const tf = settings.timeFormat || "24h";
    const ev = core.evaluateAttendance(record, { settings, now, roster: ctx.roster || null });
    const s = ev.summary;
    const rows = ev.rows.map((r, i) => [
      String(i + 1),
      r.name + (r.isSelf ? " (You)" : ""),
      core.statusLabel(r),
      core.formatTime(r.firstSeen, tf),
      core.formatTime(r.lastSeen, tf),
      core.formatClock(r.timeInCallMs),
      core.formatClock(r.speakingMs),
      String(r.joins),
    ]);
    const absent = ev.absentees.map((a, i) => [String(rows.length + i + 1), a.name, "Absent", "", "", core.formatClock(0), core.formatClock(0), "0"]);
    const meta = [
      ["Meeting", record.title || record.code || ""],
      ["Meeting code", record.code || ""],
      ["Date", core.formatDate(record.startedAt)],
      ["Started", core.formatTime(record.startedAt, tf)],
      ["Ended", record.endedAt != null ? core.formatTime(record.endedAt, tf) : "In progress"],
      ["Duration", core.formatClock(s.meetingMs)],
      ["Participants", String(s.participants)],
    ];
    if (ev.roster) meta.push(["Roster", `${ev.roster.name} (${s.expected - s.absent}/${s.expected} attended)`]);
    if (record.tags && record.tags.length) meta.push(["Tags", record.tags.join(", ")]);
    return {
      title: record.title || (record.code ? `Google Meet ${record.code}` : "Google Meet"),
      meta,
      headers: HEADERS.slice(),
      rows: rows.concat(absent),
      statuses: ev.rows.map((r) => r.status).concat(ev.absentees.map(() => "absent")),
      summary: s,
      roster: ev.roster ? { id: ev.roster.id, name: ev.roster.name } : null,
      notes: record.notes || "",
      chat: (record.chat || []).map((c) => [core.formatTime(c.at, tf), c.sender, c.text]),
      evaluation: ev,
      timeFormat: tf,
    };
  }

  // ── CSV / TSV ──────────────────────────────────────────────────────
  function csvCell(v) {
    let s = v == null ? "" : String(v);
    // Neutralise spreadsheet formula injection from participant names / chat.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function rowsToCSV(rows) {
    return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  function toCSV(table) {
    return rowsToCSV([table.headers, ...table.rows]);
  }

  /** Tab-separated text: paste straight into Google Sheets / Excel. */
  function toTSV(table) {
    const cell = (v) => {
      let s = String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return s;
    };
    return [table.headers, ...table.rows].map((r) => r.map(cell).join("\t")).join("\n") + "\n";
  }

  function chatToCSV(table) {
    return rowsToCSV([["Time", "Sender", "Message"], ...table.chat]);
  }

  // ── JSON ───────────────────────────────────────────────────────────
  function toJSON(record, table) {
    const ev = table.evaluation;
    const out = {
      app: "meet-attendance-tracker",
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      meeting: {
        id: record.id,
        code: record.code,
        title: record.title || "",
        url: record.url || "",
        startedAt: new Date(record.startedAt).toISOString(),
        endedAt: record.endedAt != null ? new Date(record.endedAt).toISOString() : null,
        durationSeconds: Math.round(table.summary.meetingMs / 1000),
        tags: record.tags || [],
        notes: record.notes || "",
        roster: table.roster,
      },
      summary: Object.assign({}, table.summary, {
        meetingMs: undefined,
        durationSeconds: Math.round(table.summary.meetingMs / 1000),
        avgTimeInCallSeconds: Math.round(table.summary.avgTimeInCallMs / 1000),
        totalSpeakingSeconds: Math.round(table.summary.totalSpeakingMs / 1000),
        avgTimeInCallMs: undefined,
        totalSpeakingMs: undefined,
      }),
      participants: ev.rows.map((r) => ({
        name: r.name,
        isSelf: r.isSelf,
        status: r.status,
        onRoster: r.onRoster,
        firstSeen: new Date(r.firstSeen).toISOString(),
        lastSeen: new Date(r.lastSeen).toISOString(),
        timeInCallSeconds: Math.round(r.timeInCallMs / 1000),
        speakingSeconds: Math.round(r.speakingMs / 1000),
        joins: r.joins,
        sessions: core
          .mergeSessions(((record.participants || []).find((p) => p.key === r.key) || {}).sessions || [])
          .map((x) => ({ start: new Date(x.start).toISOString(), end: x.end != null ? new Date(x.end).toISOString() : null })),
      })),
      absentees: ev.absentees.map((a) => ({ name: a.name, email: a.member.email || undefined, status: "absent" })),
      chat: (record.chat || []).map((c) => ({ at: new Date(c.at).toISOString(), sender: c.sender, text: c.text })),
    };
    return JSON.stringify(out, null, 2);
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
      // eslint-disable-next-line no-control-regex -- strip characters that are illegal in XML
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

  // Style ids in styles.xml: 0 normal, 1 header, 2 title, 3 bold, 4 present, 5 late, 6 short, 7 absent
  const STATUS_STYLE = { present: 4, late: 5, short: 6, absent: 7 };

  function sheetName(name, used) {
    let base = String(name || "Sheet").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Sheet";
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 26)} ${i}`;
    used.add(n.toLowerCase());
    return n;
  }

  /**
   * sheet: { name, rows: [{cells:[...], style?, cellStyles?:[]}], widths?:[], headerRow?: 1-based row to freeze + filter }
   */
  function sheetXml(sheet) {
    const rowsXml = sheet.rows
      .map((row, ri) => {
        if (!row) return "";
        const r = ri + 1;
        const cs = (row.cells || [])
          .map((v, c) => {
            if (v == null || v === "") return "";
            const ref = colName(c) + r;
            const style = (row.cellStyles && row.cellStyles[c]) || row.style || 0;
            const st = style ? ` s="${style}"` : "";
            if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
          })
          .join("");
        return `<row r="${r}">${cs}</row>`;
      })
      .join("");
    const ncols = Math.max(1, ...sheet.rows.filter(Boolean).map((r) => (r.cells || []).length));
    const cols = (sheet.widths || [])
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("");
    const hr = sheet.headerRow;
    const pane = hr ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hr}" topLeftCell="A${hr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const filter = hr ? `<autoFilter ref="A${hr}:${colName(ncols - 1)}${Math.max(hr, sheet.rows.length)}"/>` : "";
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      pane +
      (cols ? `<cols>${cols}</cols>` : "") +
      `<sheetData>${rowsXml}</sheetData>${filter}</worksheet>`
    );
  }

  const STYLES_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="8"><font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><sz val="11"/><color rgb="FF15803D"/><name val="Calibri"/></font>` +
    `<font><sz val="11"/><color rgb="FFB45309"/><name val="Calibri"/></font>` +
    `<font><sz val="11"/><color rgb="FF7C3AED"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFDC2626"/><name val="Calibri"/></font></fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  /** Build an .xlsx from sheet specs (see sheetXml). */
  function workbookXLSX(sheets, title = APP_NAME) {
    const used = new Set();
    const named = sheets.map((s) => Object.assign({}, s, { name: sheetName(s.name, used) }));
    const files = [
      {
        name: "[Content_Types].xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
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
          `<dc:title>${xmlEsc(title)}</dc:title><dc:creator>${APP_NAME}</dc:creator></cp:coreProperties>`,
      },
      {
        name: "xl/workbook.xml",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      },
      { name: "xl/styles.xml", data: STYLES_XML },
      ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ];
    return zip(files);
  }

  /** Attendance (+ Chat) sheets for one meeting table. */
  function tableSheets(table, name = "Attendance") {
    const rows = [];
    rows.push({ cells: [`${APP_NAME}: ${table.title}`], style: 2 });
    for (const [k, v] of table.meta) rows.push({ cells: [k, v], cellStyles: [3, 0] });
    const s = table.summary;
    rows.push({
      cells: ["Summary", `Present ${s.present} · Late ${s.late} · Too short ${s.short}${s.expected != null ? ` · Absent ${s.absent}` : ""}`],
      cellStyles: [3, 0],
    });
    if (table.notes) rows.push({ cells: ["Notes", table.notes], cellStyles: [3, 0] });
    rows.push(null);
    rows.push({ cells: table.headers, style: 1 });
    const headerRow = rows.length;
    table.rows.forEach((r, i) =>
      rows.push({
        cells: r.map((v, c) => (c === 0 || c === 7 ? Number(v) : v)),
        cellStyles: r.map((_, c) => (c === 2 ? STATUS_STYLE[table.statuses[i]] || 0 : 0)),
      })
    );
    const sheets = [{ name, rows, widths: [5, 32, 16, 14, 14, 14, 14, 8], headerRow }];
    if (table.chat.length) {
      sheets.push({
        name: name === "Attendance" ? "Chat" : `${name} chat`,
        rows: [{ cells: ["Time", "Sender", "Message"], style: 1 }, ...table.chat.map((c) => ({ cells: c }))],
        widths: [12, 26, 90],
        headerRow: 1,
      });
    }
    return sheets;
  }

  function toXLSX(table) {
    return workbookXLSX(tableSheets(table), table.title);
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

  const isWinAnsiChar = (c) => (c >= 32 && c <= 126) || (c >= 160 && c <= 255);
  /** True when the base-14 fonts can't show the string faithfully. */
  function needsUnicode(s) {
    for (const ch of String(s == null ? "" : s)) if (!isWinAnsiChar(ch.codePointAt(0))) return true;
    return false;
  }

  /** Map text into the WinAnsi (≈Latin-1) range used by the base-14 fonts. */
  function toWinAnsi(s) {
    let out = "";
    for (const ch of String(s == null ? "" : s)) {
      const c = ch.codePointAt(0);
      if (isWinAnsiChar(c)) out += ch;
      else {
        const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        out += base && /^[\x20-\x7e]+$/.test(base) ? base : "?";
      }
    }
    return out;
  }

  const pdfStr = (s) => "(" + toWinAnsi(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";

  /** PDF RunLengthDecode encoder (PackBits variant). */
  function runLength(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length) {
      let run = 1;
      while (i + run < bytes.length && run < 128 && bytes[i + run] === bytes[i]) run++;
      if (run >= 2) {
        out.push(257 - run, bytes[i]);
        i += run;
        continue;
      }
      const start = i;
      let len = 0;
      while (i < bytes.length && len < 128 && !(i + 1 < bytes.length && bytes[i + 1] === bytes[i])) {
        i++;
        len++;
      }
      if (len === 0) {
        i++;
        len = 1;
      }
      out.push(len - 1);
      for (let k = start; k < start + len; k++) out.push(bytes[k]);
    }
    out.push(128);
    return out;
  }

  const rgb = (c) => c.split(" ").map(Number);

  /**
   * Minimal PDF document builder. `renderer` (optional) = {measure(text,size,bold)→pt,
   * render(text,size,bold)→{w,h,alpha:Uint8Array,widthPt,heightPt,baselinePt}}, used
   * for text outside WinAnsi.
   */
  class PdfDoc {
    constructor(W, H, renderer) {
      this.W = W;
      this.H = H;
      this.renderer = renderer || null;
      this.pages = [];
      this.images = [];
      this.ops = null;
    }
    newPage() {
      this.ops = [];
      this.pages.push(this.ops);
    }
    uni(s) {
      return !!this.renderer && needsUnicode(s);
    }
    measure(s, size, bold) {
      s = String(s == null ? "" : s);
      return this.uni(s) ? this.renderer.measure(s, size, bold) : textWidth(toWinAnsi(s), size, bold);
    }
    fit(s, size, bold, maxW) {
      s = String(s == null ? "" : s);
      if (this.measure(s, size, bold) <= maxW) return s;
      const chars = Array.from(s);
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (this.measure(chars.slice(0, mid).join("") + "...", size, bold) <= maxW) lo = mid;
        else hi = mid - 1;
      }
      return chars.slice(0, Math.max(1, lo)).join("").trimEnd() + "...";
    }
    wrap(s, size, bold, maxW, maxLines = 50) {
      const lines = [];
      for (const para of String(s || "").split(/\r?\n/)) {
        let line = "";
        for (const word of para.split(/(\s+)/)) {
          const next = line + word;
          if (line && this.measure(next.trimEnd(), size, bold) > maxW) {
            lines.push(line.trimEnd());
            line = word.trimStart();
          } else line = next;
          while (this.measure(line, size, bold) > maxW && Array.from(line).length > 1) {
            const cut = this.fit(line, size, bold, maxW).replace(/\.\.\.$/, "");
            lines.push(cut);
            line = line.slice(cut.length);
          }
        }
        lines.push(line.trimEnd());
        if (lines.length >= maxLines) break;
      }
      return lines.slice(0, maxLines);
    }
    text(x, y, s, size, bold, color = "0.12 0.16 0.22") {
      s = String(s == null ? "" : s);
      if (!s) return;
      if (this.uni(s)) {
        const img = this.renderer.render(s, size, bold);
        if (img && img.w > 0 && img.h > 0) {
          const id = this.images.length;
          this.images.push({ img, color: rgb(color) });
          this.ops.push(`q ${img.widthPt.toFixed(2)} 0 0 ${img.heightPt.toFixed(2)} ${x.toFixed(2)} ${(y - img.baselinePt).toFixed(2)} cm /Im${id} Do Q`);
          return;
        }
      }
      this.ops.push(`BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
    }
    rect(x, y, w, h, color) {
      this.ops.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    }
    raw(op) {
      this.ops.push(op);
    }
    build(info) {
      const objs = [];
      const nPages = this.pages.length;
      const firstImg = 6 + nPages * 2;
      objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
      objs.push(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ")}] /Count ${nPages} >>`);
      objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
      objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
      objs.push(`<< /Title ${pdfStr(info.title || "")} /Producer ${pdfStr(APP_NAME)} /Creator ${pdfStr(APP_NAME)} >>`);
      const xobjs = this.images.map((_, i) => `/Im${i} ${firstImg + i * 2} 0 R`).join(" ");
      const res = `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjs ? ` /XObject << ${xobjs} >>` : ""} >>`;
      this.pages.forEach((p, i) => {
        const stream = p.join("\n");
        objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] ${res} /Contents ${7 + i * 2} 0 R >>`);
        objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      });
      this.images.forEach(({ img, color }, i) => {
        // 1×1 colour pixel + soft mask with the glyph coverage (antialiased text in any colour).
        const base = String.fromCharCode(...color.map((c) => Math.round(c * 255)));
        const smaskRef = firstImg + i * 2 + 1;
        objs.push(`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${smaskRef} 0 R /Length 3 >>\nstream\n${base}\nendstream`);
        const rle = runLength(img.alpha);
        let data = "";
        for (let k = 0; k < rle.length; k += 8192) data += String.fromCharCode.apply(null, rle.slice(k, k + 8192));
        objs.push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /RunLengthDecode /Length ${data.length} >>\nstream\n${data}\nendstream`);
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
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    }
  }

  const BRAND = "0.059 0.463 0.431";
  const MUTED = "0.35 0.4 0.47";
  const STATUS_COLOR = { present: "0.08 0.5 0.24", late: "0.71 0.33 0.04", short: "0.49 0.23 0.93", absent: "0.86 0.15 0.15" };

  function drawLogo(doc, x, y, s) {
    doc.rect(x, y, s, s, BRAND);
    doc.rect(x + s * 0.24, y + s * 0.18, s * 0.44, s * 0.6, "1 1 1");
    doc.rect(x + s * 0.34, y + s * 0.6, s * 0.24, s * 0.04, "0.6 0.96 0.89");
    doc.rect(x + s * 0.34, y + s * 0.46, s * 0.24, s * 0.04, "0.6 0.96 0.89");
    doc.raw(`0.96 0.62 0.04 rg ${(x + s * 0.7).toFixed(2)} ${(y + s * 0.3).toFixed(2)} m ${(x + s * 0.92).toFixed(2)} ${(y + s * 0.3).toFixed(2)} l ${(x + s * 0.92).toFixed(2)} ${(y + s * 0.08).toFixed(2)} l ${(x + s * 0.7).toFixed(2)} ${(y + s * 0.08).toFixed(2)} l f`);
    doc.raw(`1 1 1 RG 1.4 w 1 J 1 j ${(x + s * 0.74).toFixed(2)} ${(y + s * 0.19).toFixed(2)} m ${(x + s * 0.79).toFixed(2)} ${(y + s * 0.13).toFixed(2)} l ${(x + s * 0.88).toFixed(2)} ${(y + s * 0.25).toFixed(2)} l S`);
  }

  function toPDF(table, opts = {}) {
    const W = 842, H = 595, M = 40; // A4 landscape
    const doc = new PdfDoc(W, H, opts.renderer);
    const colW = [26, 220, 80, 82, 82, 82, 82, 44];
    const scale = (W - 2 * M) / colW.reduce((a, b) => a + b, 0);
    const cols = colW.map((w) => w * scale);
    const rowH = 20;
    const generated = opts.generatedAt != null ? opts.generatedAt : Date.now();
    let y = 0;

    const tableHeader = () => {
      doc.rect(M, y - rowH + 6, W - 2 * M, rowH, BRAND);
      let x = M;
      table.headers.forEach((h, i) => {
        doc.text(x + 6, y - 8, doc.fit(h, 9.5, true, cols[i] - 10), 9.5, true, "1 1 1");
        x += cols[i];
      });
      y -= rowH;
    };
    const page = (withHeader) => {
      doc.newPage();
      y = H - M;
      if (withHeader) tableHeader();
    };
    const ensure = (h, withHeader) => {
      if (y - h < M + 24) page(withHeader);
    };

    // Cover block
    doc.newPage();
    doc.rect(0, H - 8, W, 8, BRAND);
    y = H - M;
    drawLogo(doc, M, y - 30, 30);
    doc.text(M + 40, y - 13, "Attendance Report", 20, true);
    doc.text(M + 40, y - 29, doc.fit(table.title, 11, false, W - 2 * M - 220), 11, false, MUTED);
    const brand = `${APP_NAME}`;
    doc.text(W - M - textWidth(brand, 9, true), y - 13, brand, 9, true, BRAND);
    const priv = "Generated on-device · no data leaves your computer";
    doc.text(W - M - textWidth(priv, 7.5, false), y - 25, priv, 7.5, false, MUTED);
    y -= 50;

    const meta = table.meta.filter(([k]) => !["Meeting", "Roster", "Tags"].includes(k));
    const boxW = (W - 2 * M) / meta.length;
    meta.forEach(([k, v], i) => {
      const x = M + i * boxW;
      doc.rect(x + 2, y - 36, boxW - 4, 40, "0.94 0.97 0.96");
      doc.text(x + 10, y - 10, k.toUpperCase(), 7, true, MUTED);
      doc.text(x + 10, y - 27, doc.fit(v, 11, true, boxW - 20), 11, true);
    });
    y -= 50;

    // Summary pills
    const s = table.summary;
    const pills = [
      [`Present ${s.present}`, STATUS_COLOR.present],
      [`Late ${s.late}`, STATUS_COLOR.late],
      [`Too short ${s.short}`, STATUS_COLOR.short],
    ];
    if (s.expected != null) pills.push([`Absent ${s.absent}`, STATUS_COLOR.absent]);
    if (s.attendanceRate != null) pills.push([`Attendance ${Math.round(s.attendanceRate * 100)}%`, BRAND]);
    pills.push([`Avg time ${core.formatDuration(s.avgTimeInCallMs)}`, MUTED]);
    pills.push([`Total speaking ${core.formatDuration(s.totalSpeakingMs)}`, MUTED]);
    let px = M;
    for (const [label, color] of pills) {
      const w = textWidth(label, 9, true) + 18;
      doc.rect(px, y - 14, w, 18, "0.97 0.98 0.98");
      doc.rect(px, y - 14, 3, 18, color);
      doc.text(px + 10, y - 8, label, 9, true, color);
      px += w + 6;
    }
    if (s.topSpeaker && px < W - M - 120) {
      const lbl = "Top speaker: ";
      doc.text(px + 4, y - 8, lbl, 9, false, MUTED);
      doc.text(px + 4 + textWidth(lbl, 9, false), y - 8, doc.fit(s.topSpeaker.name, 9, true, W - M - px - 10 - textWidth(lbl, 9, false)), 9, true);
    }
    y -= 30;
    const extra = [];
    if (table.roster) extra.push(["Roster", (table.meta.find(([k]) => k === "Roster") || [])[1] || table.roster.name]);
    const tags = table.meta.find(([k]) => k === "Tags");
    if (tags) extra.push(tags);
    for (const [k, v] of extra) {
      doc.text(M, y - 4, `${k}:`, 9, true, MUTED);
      doc.text(M + 48, y - 4, doc.fit(v, 9, false, W - 2 * M - 48), 9, false);
      y -= 14;
    }
    if (table.notes) {
      doc.text(M, y - 4, "Notes:", 9, true, MUTED);
      for (const line of doc.wrap(table.notes, 9, false, W - 2 * M - 48, 6)) {
        doc.text(M + 48, y - 4, line, 9, false);
        y -= 12;
      }
      y -= 2;
    }
    if (extra.length || table.notes) y -= 6;

    tableHeader();
    if (!table.rows.length) doc.text(M + 6, y - 14, "No participants recorded.", 10, false, MUTED);
    table.rows.forEach((row, ri) => {
      ensure(rowH, true);
      if (ri % 2 === 1) doc.rect(M, y - rowH + 6, W - 2 * M, rowH, "0.965 0.973 0.98");
      let x = M;
      row.forEach((cell, i) => {
        const color = i === 2 ? STATUS_COLOR[table.statuses[ri]] : undefined;
        doc.text(x + 6, y - 8, doc.fit(cell, 9.5, i === 1 || i === 2, cols[i] - 10), 9.5, i === 1 || i === 2, color);
        x += cols[i];
      });
      y -= rowH;
    });

    if (table.chat.length) {
      y -= 16;
      ensure(40, false);
      doc.text(M, y - 6, `Chat (${table.chat.length} message${table.chat.length === 1 ? "" : "s"})`, 13, true);
      y -= 22;
      for (const [time, sender, text] of table.chat) {
        const head = `${time}  `;
        const senderW = Math.min(170, doc.measure(sender, 9, true) + 8);
        const lines = doc.wrap(text, 9, false, W - 2 * M - 60 - senderW, 12);
        ensure(12 * lines.length + 4, false);
        doc.text(M, y - 4, head, 8.5, false, MUTED);
        doc.text(M + 60, y - 4, doc.fit(sender, 9, true, 165), 9, true, BRAND);
        lines.forEach((ln, k) => doc.text(M + 60 + senderW, y - 4 - k * 12, ln, 9, false));
        y -= 12 * lines.length + 4;
      }
    }

    const footer = `Generated locally by ${APP_NAME} on ${core.formatDateTime(generated, opts.timeFormat || "24h")}`;
    doc.pages.forEach((p, i) => {
      doc.ops = p;
      doc.text(M, 22, footer, 8, false, "0.5 0.55 0.6");
      const pg = `Page ${i + 1} of ${doc.pages.length}`;
      doc.text(W - M - textWidth(pg, 8, false), 22, pg, 8, false, "0.5 0.55 0.6");
    });
    return doc.build({ title: `Attendance: ${table.title}` });
  }

  // ── Series (recurring meeting) & bulk exports ──────────────────────
  /** matrix from MAT.seriesMatrix() → rows for CSV/XLSX. */
  function seriesRows(matrix, tf = "24h") {
    const head = ["Name", ...matrix.sessions.map((s) => `${core.formatDate(s.startedAt)} ${core.formatTime(s.startedAt, tf, false)}`), "Attended", "Expected", "Rate"];
    const body = matrix.rows.map((r) => [
      r.name,
      ...r.cells.map((c) => (c ? `${core.STATUS_LABEL[c.status]}${c.status === "absent" ? "" : ` ${core.formatDuration(c.timeInCallMs)}`}` : "-")),
      r.attended,
      r.expected,
      r.rate == null ? "" : `${Math.round(r.rate * 100)}%`,
    ]);
    return { head, body };
  }

  function exportSeries(matrix, format, settings = {}) {
    const { head, body } = seriesRows(matrix, settings.timeFormat);
    const base = `meet-attendance_series_${(matrix.code || "series").replace(/[^\w-]+/g, "-")}_${core.formatDate(Date.now())}`;
    if (format === "csv") return { filename: base + ".csv", mime: MIME.csv, data: rowsToCSV([head, ...body.map((r) => r.map(String))]) };
    if (format === "xlsx") {
      const statusOf = (c) => (c ? STATUS_STYLE[c.status] || 0 : 0);
      const rows = [
        { cells: [`${APP_NAME}: ${matrix.title || matrix.code} (series)`], style: 2 },
        { cells: ["Meeting code", matrix.code], cellStyles: [3, 0] },
        { cells: ["Sessions", matrix.sessions.length], cellStyles: [3, 0] },
        null,
        { cells: head, style: 1 },
        ...matrix.rows.map((r, i) => ({ cells: body[i], cellStyles: [3, ...r.cells.map(statusOf)] })),
      ];
      const data = workbookXLSX([{ name: "Series", rows, widths: [28, ...matrix.sessions.map(() => 17), 10, 10, 8], headerRow: 5 }], matrix.title || matrix.code);
      return { filename: base + ".xlsx", mime: MIME.xlsx, data };
    }
    throw new Error("Unknown series export format: " + format);
  }

  /** Many meetings in one file. rosterFor(record) → roster|null */
  function exportBulk(records, format, settings = {}, rosterFor = () => null, range = {}) {
    const list = records.slice().sort((a, b) => a.startedAt - b.startedAt);
    const tables = list.map((r) => ({ record: r, table: buildTable(r, settings, undefined, { roster: rosterFor(r) }) }));
    const from = range.from || (list[0] && core.formatDate(list[0].startedAt)) || "all";
    const to = range.to || (list.length && core.formatDate(list[list.length - 1].startedAt)) || "all";
    const base = `meet-attendance_bulk_${from}_to_${to}`;
    if (format === "json") {
      const data = JSON.stringify({ app: "meet-attendance-tracker", appVersion: APP_VERSION, exportedAt: new Date().toISOString(), meetings: tables.map(({ record, table }) => JSON.parse(toJSON(record, table))) }, null, 2);
      return { filename: base + ".json", mime: MIME.json, data };
    }
    if (format === "csv") {
      const head = ["Date", "Meeting", "Code", ...HEADERS.slice(1)];
      const rows = [head];
      for (const { record, table } of tables) for (const r of table.rows) rows.push([core.formatDate(record.startedAt), table.title, record.code || "", ...r.slice(1)]);
      return { filename: base + ".csv", mime: MIME.csv, data: rowsToCSV(rows) };
    }
    if (format === "xlsx") {
      const sumHead = ["Date", "Start", "Meeting", "Code", "Duration", "Participants", "Present", "Late", "Too short", "Absent", "Tags"];
      const summary = {
        name: "Summary",
        rows: [
          { cells: [`${APP_NAME}: ${list.length} meetings (${from} to ${to})`], style: 2 },
          null,
          { cells: sumHead, style: 1 },
          ...tables.map(({ record, table }) => ({
            cells: [
              core.formatDate(record.startedAt), core.formatTime(record.startedAt, settings.timeFormat, false), table.title, record.code || "",
              core.formatClock(table.summary.meetingMs), table.summary.participants, table.summary.present, table.summary.late, table.summary.short,
              table.summary.expected != null ? table.summary.absent : "", (record.tags || []).join(", "),
            ],
          })),
        ],
        widths: [12, 8, 34, 16, 10, 12, 9, 7, 10, 8, 20],
        headerRow: 3,
      };
      const sheets = [summary];
      for (const { record, table } of tables) sheets.push(...tableSheets(table, `${core.formatDate(record.startedAt)} ${table.title}`));
      return { filename: base + ".xlsx", mime: MIME.xlsx, data: workbookXLSX(sheets, "Bulk attendance export") };
    }
    throw new Error("Unknown bulk export format: " + format);
  }

  const MIME = {
    csv: "text/csv;charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
    json: "application/json",
    tsv: "text/tab-separated-values;charset=utf-8",
  };

  /**
   * Build {filename, mime, data} for a record.
   * format: csv | xlsx | pdf | json | tsv | chat-csv
   * ctx: { roster, renderer } (renderer = PDF Unicode text renderer, browser only)
   */
  function exportRecord(record, format, settings = {}, now, ctx = {}) {
    const table = buildTable(record, settings, now, ctx);
    let data;
    let ext = format;
    if (format === "csv") data = toCSV(table);
    else if (format === "xlsx") data = toXLSX(table);
    else if (format === "pdf") data = toPDF(table, { timeFormat: settings.timeFormat, renderer: ctx.renderer });
    else if (format === "json") data = toJSON(record, table);
    else if (format === "tsv") data = toTSV(table);
    else if (format === "chat-csv") {
      data = chatToCSV(table);
      ext = "csv";
    } else throw new Error("Unknown export format: " + format);
    let filename = core.exportFileName(record, ext);
    if (format === "chat-csv") filename = filename.replace(/^meet-attendance_/, "meet-chat_");
    return { filename, mime: MIME[ext], data, table };
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

  /** Browser-only: copy text to the clipboard (falls back to execCommand). */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  return {
    APP_VERSION,
    buildTable,
    toCSV,
    toTSV,
    toJSON,
    chatToCSV,
    toXLSX,
    workbookXLSX,
    toPDF,
    PdfDoc,
    runLength,
    needsUnicode,
    zip,
    crc32,
    exportRecord,
    exportSeries,
    exportBulk,
    seriesRows,
    downloadFile,
    copyText,
    toWinAnsi,
    EXPORT_HEADERS: HEADERS,
  };
});
