<p align="center">
  <img src="docs/assets/logo.svg" width="88" height="88" alt="Meet Attendance Tracker logo">
</p>

<h1 align="center">Meet Attendance Tracker</h1>

<p align="center">
  🌐 <b>Website: <a href="https://sahinurdev.github.io/Meet-Attendance-Tracker/">sahinurdev.github.io/Meet-Attendance-Tracker</a></b>
</p>

<p align="center">
  <b>Automatic, private attendance for Google Meet.</b><br>
  Join/leave times, time in call and speaking time for every participant. Rosters with Present / Late / Absent,
  analytics, recurring-meeting reports and chat capture. Export to CSV, Excel, PDF or JSON.<br>
  Chrome extension · Manifest V3 · only the <code>storage</code> permission · nothing ever leaves your device · English + বাংলা
</p>

<p align="center">
  <a href="#install-load-unpacked">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#roadmap--coming-soon">Roadmap</a> ·
  <a href="#development">Development</a>
</p>

![The Attendance panel inside a Google Meet call](docs/screenshots/meet-panel.png)

## Features

### Tracking

| | |
|---|---|
| **Automatic saving** | Tracking starts when participants appear in a call. The list is saved every 15 s (configurable) and again when the call ends. |
| **Manual save** | *Save now* in the in-Meet panel, the popup or with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>. Turn auto-save off to keep only the meetings you choose. |
| **Per-participant metrics** | **First Seen**, **Last Seen**, **Time in Call** (gaps between sessions excluded), **Speaking Time**, number of **Joins** and a **Status**. |
| **Joins, leaves and rejoins** | Every leave/rejoin is a separate session. A short grace window (10 s by default) smooths over Meet re-rendering tiles so glitches don't count as leaves. |
| **Speaking time** | Estimated from Meet's on-screen speaking indicator, sampled about once a second. No audio is touched. |
| **Chat capture** | Messages shown in Meet's chat panel (sender, time, text) are stored with the meeting and included in exports. Can be turned off. |
| **Join / leave alerts** | Small pop-ups in the Meet panel when someone joins, rejoins or leaves, with an optional quiet sound (WebAudio, no files). |
| **Resilient detection** | Four detection strategies (People panel, `data-participant-id` tiles, `data-self-name` markers, labelled tiles) driven by a `MutationObserver` plus a 1 s poll. Selectors live in one table in `extension/lib/detect.js`. |
| **Reload-safe** | If the Meet tab reloads, the same meeting is resumed instead of starting a duplicate. |

### Rosters and rules (new in 2.1)

| | |
|---|---|
| **Rosters** | Lists of expected attendees: paste names (one per line, optionally `Name, email`) or import a CSV with a `name` / `first name`+`last name` / `email` / `alias` header. Link a roster to one or more meeting codes, or pick one per meeting. |
| **Flexible matching** | Exact names and aliases, reordered names ("Siddiqua Ayesha"), honorifics ignored ("Md. Rahim Uddin" = "Rahim Uddin") and unambiguous partial names. People not on the roster are marked as guests; you are never a guest. |
| **Present / Late / Too short / Absent** | A configurable **late threshold** (minutes after the start) and a **minimum time in call** (minutes or % of the meeting). Absentees appear in the in-Meet panel ("Not here yet"), the popup, the dashboard and every export. |

### Dashboard

| | |
|---|---|
| **History** | Stats, search (title, code, date, tag or participant), sorting, **tag filter** and absentee counts. |
| **Meeting detail** | Status per person, presence timeline, roster picker, **tags**, **notes**, chat log, rename and delete. |
| **Analytics** | Per-person attendance rate, average time, total speaking and a trend chart; overall charts for attendance over time, top speakers and speaking share. Plain SVG, no chart library. |
| **Recurring meetings** | Meetings with the same code are grouped into a **series** with a who-attended-which-session matrix, exportable to XLSX or CSV. |
| **Settings** | Auto-save and interval, leave delay, chat capture, late and minimum-time rules, notifications and sound, ignore my own name, 12h/24h, **theme** (system / light / dark), shortcut list, JSON backup/restore (now including rosters), delete everything. |

### Exports

| Format | What you get |
|---|---|
| **CSV** | UTF-8 with BOM, RFC 4180 quoting, protected against formula injection. Includes a Status column and absentee rows. |
| **XLSX** | Real Office Open XML: an *Attendance* sheet with meeting info, summary and status-coloured cells, plus a *Chat* sheet. |
| **PDF** | Branded A4 report: logo, meeting info, summary pills (Present, Late, Too short, Absent, attendance %, average time, total speaking, top speaker), roster, tags, notes, status-coloured table and the chat. **Bengali and other non-Latin names render correctly.** |
| **JSON** | Structured export: meeting, summary, participants with sessions, absentees and chat. |
| **Copy as table** | Tab-separated rows on the clipboard, ready to paste into Google Sheets or Excel. |
| **Chat CSV** | Just the chat: time, sender, message. |
| **Bulk export** | Any date range and/or tag into one XLSX (summary sheet + one sheet per meeting), one combined CSV, or one JSON file. |
| **Series export** | The recurring-meeting matrix as XLSX (status-coloured) or CSV. |

File names include the meeting date, e.g. `meet-attendance_abc-defg-hij_2026-10-09_1400.xlsx`. All encoders (ZIP, XLSX, PDF) are written from scratch and bundled; nothing is loaded from a CDN.

### Everywhere

- **Dark mode** follows your system by default, or force light or dark. Applies to the in-Meet panel, popup and dashboard.
- **Keyboard shortcuts** via `chrome.commands`: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> toggles the in-Meet panel, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> saves now. Change them at `chrome://extensions/shortcuts`.
- **Languages:** English and Bengali (বাংলা) through `chrome.i18n` (`extension/_locales`). The UI follows the browser language.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard.png" alt="Dashboard"></td>
    <td><img src="docs/screenshots/meeting-detail.png" alt="Meeting details with roster statuses"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/analytics.png" alt="Analytics"></td>
    <td><img src="docs/screenshots/series.png" alt="Recurring meeting series matrix"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/roster-editor.png" alt="Roster editor"></td>
    <td><img src="docs/screenshots/person.png" alt="Person history"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/dark-dashboard.png" alt="Dark mode dashboard"></td>
    <td><img src="docs/screenshots/dark-meet-panel.png" alt="Dark mode in-Meet panel"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/export-pdf.png" alt="Branded PDF export with Bengali names"></td>
    <td align="center"><img src="docs/screenshots/popup.png" alt="Popup" width="300"></td>
  </tr>
</table>

## Install (load unpacked)

1. Get the code: `git clone -b feature/full-extension https://github.com/SahinurDEV/Meet-Attendance-Tracker.git` (or download the ZIP and extract it).
2. Open `chrome://extensions` (also works in Edge, Brave and other Chromium browsers, v110+).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the **`extension/`** folder.
5. Pin *Meet Attendance Tracker* from the puzzle-piece menu, then join a call on `meet.google.com`.

No build step is needed: `extension/` is plain JavaScript, HTML and CSS.

**Tips**
- Meet only renders some video tiles in big calls. Keep the **People** panel open for the most complete list.
- Open the **chat** panel at least once during the call if you want the chat saved.
- Create a roster under **Dashboard → Rosters** and link it to your recurring meeting code to see absentees live.

## Packaging

```bash
npm install
npm run package      # → dist/meet-attendance-tracker-v2.1.0.zip (ready for the Chrome Web Store)
```

`npm run package` runs the manifest checks first (MV3, allowed permissions, every referenced file exists,
no remote code or network APIs), then zips `extension/` with the bundled zip writer.

## Privacy

- **Local only.** Attendance, rosters, chat and settings live in `chrome.storage.local` in your browser. Uninstalling the extension removes them.
- **No network.** No servers, accounts, analytics or third-party scripts. A static check (`npm run lint:manifest`) fails the build if extension code uses `fetch`, XHR, WebSockets or remote scripts, and the integration tests assert that no request leaves the device.
- **No audio or video.** Only names, indicators and chat messages that Meet already shows on screen are read.
- **Minimal permissions.** `storage`, plus a content script on `https://meet.google.com/*`. Version 2.1 adds **no new permissions**: keyboard shortcuts (`commands`) and `chrome.i18n` need none, downloads use `<a download>`, and the clipboard is written from a user click.
- **Your control.** Delete single meetings or everything, or export/import a JSON backup.

Please follow your organisation's policies and local laws when recording attendance.

## How it works

```
meet.google.com tab
 ├─ lib/detect.js     scan the DOM with several strategies → participants + chat messages
 ├─ lib/core.js       AttendanceTracker: sessions, grace-window leave detection, speaking time, chat
 ├─ lib/rules.js      roster parsing + matching, Present/Late/Too short/Absent, summary stats
 ├─ lib/export.js     CSV / TSV / JSON / XLSX / PDF encoders, bulk + series exports (no dependencies)
 ├─ lib/textimage.js  renders non-Latin PDF text through the browser's canvas (correct Bengali shaping)
 ├─ lib/storage.js    chrome.storage.local wrapper (settings, m:<id>, roster:<id>, live:<tab>)
 ├─ lib/i18n.js       chrome.i18n helpers (en, bn)
 └─ content/*.js      controller (MutationObserver + 1 s tick, auto-save, resume, alerts, shortcuts) and shadow-DOM panel
popup.html            live call, expected attendees, quick settings, recent meetings
dashboard.html        meetings, analytics (lib/analytics.js + lib/charts.js), series, rosters, settings, privacy
background.js         defaults on install, toolbar badge, keyboard shortcuts → active Meet tab
```

The popup and dashboard read live state from `live:<tab>` keys that the Meet tab refreshes every few
seconds. *Save now* in the popup is sent to the tab through a `cmd` storage key, and shortcuts are
forwarded with `tabs.sendMessage`, so the extension needs no `tabs` permission.

**Non-Latin text in PDFs.** The standard PDF fonts only cover Latin-1. Instead of bundling multi-megabyte
fonts, any text outside WinAnsi is drawn by the browser (which shapes Bengali conjuncts correctly) onto a
canvas and embedded as an anti-aliased image mask in the brand colour. Latin text stays real, selectable PDF text.

## Roadmap / Coming soon

> **Planned, not built.** None of the items below exist in the current version. Anything involving a
> cloud service would be strictly opt-in; local-only stays the default.

- [ ] Optional Google Sheets / Google Drive sync
- [ ] Google Classroom integration (import rosters, post attendance)
- [ ] Microsoft Teams and Zoom (web) support
- [ ] Team / organisation workspace with shared rosters and reports
- [ ] Scheduled email reports
- [ ] AI meeting summaries (from chat and notes)
- [ ] Firefox and Edge builds
- [ ] Chrome Web Store listing
- [ ] Mobile-friendly report viewer

## Development

```bash
npm install
npm run test:setup         # one-time: download Playwright's Chromium
npm test                   # unit + integration
npm run test:unit          # node:test, no browser
npm run test:integration   # Playwright + Chromium with the unpacked extension
npm run screenshots        # regenerate docs/screenshots/*.png
npm run icons              # re-render icons from assets/logo.svg
python3 scripts/locales.py # regenerate extension/_locales/{en,bn}/messages.json
```

**Unit tests** (`test/unit`, 53 tests) cover name normalisation, session merging, join/leave/rejoin and
grace handling, speaking time, resume after reload, chat de-duplication, roster CSV parsing and matching,
late / minimum-time rules, analytics (per person, overview, series matrix), SVG charts, storage (rosters,
user fields surviving auto-saves) and every encoder. XLSX is read back with SheetJS; PDFs are checked
structurally (xref offsets, stream lengths, image XObjects with soft masks, RunLength round trip) and with
`pdftotext`/`pdfimages` when poppler is installed. An i18n test checks that every string used in the code
exists in both locales with matching placeholders.

**Integration tests** (`test/integration`, 13 tests) launch Chromium with the unpacked extension and route
`https://meet.google.com/*` to [`test/fixtures/mock-meet.html`](test/fixtures/mock-meet.html), a
Meet-like page whose participants join, leave, flicker, speak and chat on command. They cover the manifest
(no manifest/runtime errors), the live panel, manual and auto-save, roster import, absentees and
late/short statuses in the panel, join/leave toasts, chat capture, both keyboard-shortcut commands, copy as
table, JSON / chat CSV / XLSX / Bengali PDF exports, tags, notes, tag filter, bulk export, analytics,
person history, series matrix exports, dark mode, the Bengali UI, and that no request leaves the device.

### Project layout

```
extension/         the Chrome extension (load this folder)
docs/              GitHub Pages landing page + screenshots
test/              unit tests, integration tests, mock Meet page
scripts/           package, manifest check, screenshots, icons, locales
assets/            logo source (SVG)
legacy/            v1 Express/SQLite server + React dashboard (unused by v2, see legacy/README.md)
```

### Landing page

`docs/` is a static, dependency-free site with relative asset paths, published with GitHub Pages at
**https://sahinurdev.github.io/Meet-Attendance-Tracker/** (source: the `/docs` folder). Until PR #1 is
merged it is served from the `feature/full-extension` branch; after merging, switch Pages to `main` →
`/docs` in **Settings → Pages**.

## Known limitations

- Google Meet's markup is obfuscated and changes without notice. Detection uses several strategies,
  but a Meet redesign can still break it until the selectors in `extension/lib/detect.js` are updated.
  The chat selectors in particular are best-effort.
- **Chat** is only captured while Meet has rendered it (the chat panel was open at some point). Messages
  without an id that have the same sender, text and minute are merged.
- **Speaking time** depends on Meet showing a speaking indicator for that person. People without a
  visible tile may not have speaking time recorded; keeping the People panel open helps.
- Participants are identified by display name, so two people with exactly the same name are merged.
  Roster matching is name-based (Meet doesn't expose emails to the page).
- Times are sampled about once a second, and leaves are recorded after the grace window (default
  10 s), dated to when the person was last seen.
- Non-Latin text in PDFs is drawn as images, so it isn't selectable or searchable in the PDF, and it
  needs a font for that script on the computer (Windows and macOS include Bengali; on Linux install
  e.g. `fonts-noto-core`). Without a browser canvas (e.g. in Node), it falls back to `?`.
- Analytics treat a person as "expected" at every meeting of a series they attended at least once, plus
  every meeting whose roster lists them.
- The Bengali translation was written for this project; native-speaker review is welcome.
- Chrome may throttle background tabs. Speaking-time samples are capped so a throttled tab doesn't
  over-count, but accuracy is lower while the Meet tab is in the background.

## License

MIT
