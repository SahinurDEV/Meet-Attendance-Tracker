<p align="center">
  <img src="docs/assets/logo.svg" width="88" height="88" alt="Meet Attendance Tracker logo">
</p>

<h1 align="center">Meet Attendance Tracker</h1>

<p align="center">
  <b>Automatic, private attendance for Google Meet.</b><br>
  First seen, last seen, time in call and speaking time for every participant, exported to CSV, Excel or PDF.<br>
  Chrome extension · Manifest V3 · only the <code>storage</code> permission · nothing ever leaves your device.
</p>

<p align="center">
  <a href="#install-load-unpacked">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#development">Development</a> ·
  <a href="https://sahinurdev.github.io/Meet-Attendance-Tracker/">Landing page</a>
</p>

![The Attendance panel inside a Google Meet call](docs/screenshots/meet-panel.png)

## Features

| | |
|---|---|
| **Automatic saving** | Tracking starts when participants appear in a call. The list is saved every 15 s (configurable) and again when the call ends. |
| **Manual save** | A *Save now* button in the in-Meet panel and in the popup. Turn auto-save off if you only want to keep the meetings you choose. |
| **Per-participant metrics** | **First Seen**, **Last Seen**, **Time in Call** (gaps between sessions excluded), **Speaking Time** and number of **Joins**. |
| **Joins, leaves and rejoins** | Every leave/rejoin is a separate session. A short grace window (10 s by default) smooths over Meet re-rendering tiles so glitches don't count as leaves. |
| **Speaking time** | Estimated from Meet's on-screen speaking indicator, sampled about once a second (no audio is touched). |
| **In-Meet UI** | A floating *Attendance* button with a live count, plus a panel with search, live status, speaking bars and one-click CSV/XLSX/PDF export. |
| **Dashboard** | Meeting history with stats, search (title, code, date or participant name), sorting, a detail view with a presence timeline, renaming and deleting. |
| **Exports** | CSV (UTF-8 with BOM, protected against formula injection), XLSX (real Office Open XML) and PDF (paginated A4 report). File names include the meeting date: `meet-attendance_abc-defg-hij_2026-10-09_1400.xlsx`. |
| **Settings** | Auto-save on/off and interval, ignore my own name (plus an optional display name), 12h/24h time, show/hide the in-Meet button, leave-detection delay, JSON backup/restore, delete everything. |
| **Resilient detection** | Four detection strategies (People panel, `data-participant-id` tiles, `data-self-name` markers, labelled tiles) driven by a `MutationObserver` plus a 1 s poll. Selectors live in one table in `extension/lib/detect.js`. |
| **Reload-safe** | If the Meet tab reloads, the same meeting is resumed instead of starting a duplicate. |

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/dashboard.png" alt="Dashboard"></td>
    <td><img src="docs/screenshots/popup.png" alt="Popup"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/meeting-detail.png" alt="Meeting details"></td>
    <td><img src="docs/screenshots/export-pdf.png" alt="PDF export"></td>
  </tr>
</table>

## Install (load unpacked)

1. Get the code: `git clone https://github.com/SahinurDEV/Meet-Attendance-Tracker.git` (or download the ZIP and extract it).
2. Open `chrome://extensions` (also works in Edge, Brave and other Chromium browsers, v110+).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the **`extension/`** folder.
5. Pin *Meet Attendance Tracker* from the puzzle-piece menu, then join a call on `meet.google.com`.

No build step is needed: `extension/` is plain JavaScript, HTML and CSS.

**Tip:** Meet only renders some video tiles in big calls. Keep the **People** panel open for the most complete list.

## Packaging

```bash
npm install
npm run package      # → dist/meet-attendance-tracker-v2.0.0.zip (ready for the Chrome Web Store)
```

`npm run package` runs the manifest checks first (MV3, allowed permissions, every referenced file exists,
no remote code or network APIs), then zips `extension/` with the bundled zip writer.

## Privacy

- **Local only.** Attendance and settings live in `chrome.storage.local` in your browser. Uninstalling the extension removes them.
- **No network.** No servers, accounts, analytics or third-party scripts. A static check (`npm run lint:manifest`) fails the build if extension code uses `fetch`, XHR, WebSockets or remote scripts, and the integration test asserts that no request leaves the device.
- **No audio or video.** Only names and indicators that Meet already shows on screen are read.
- **Minimal permissions.** `storage`, plus a content script on `https://meet.google.com/*`. Downloads use `<a download>`, so no `downloads` permission is needed.
- **Your control.** Delete single meetings or everything, or export/import a JSON backup.

Please follow your organisation's policies and local laws when recording attendance.

## How it works

```
meet.google.com tab
 ├─ lib/detect.js     scan the DOM with several strategies → [{name, speaking, isSelf, participantId}]
 ├─ lib/core.js       AttendanceTracker: sessions, grace-window leave detection, speaking time
 ├─ lib/export.js     CSV / XLSX / PDF encoders (self-written, no dependencies)
 ├─ lib/storage.js    chrome.storage.local wrapper (settings, m:<id> history, live:<tab> heartbeat)
 └─ content/*.js      controller (MutationObserver + 1 s tick, auto-save, resume) and shadow-DOM panel
popup.html            live call, quick settings, recent meetings
dashboard.html        history, details, settings, privacy
background.js         defaults on install, toolbar badge, opens the dashboard
```

The popup and dashboard read live state from `live:<tab>` keys that the Meet tab refreshes every few
seconds. *Save now* in the popup is sent to the tab through a `cmd` storage key, so the extension
needs no `tabs` permission.

## Development

```bash
npm install
npm run test:setup         # one-time: download Playwright's Chromium
npm test                   # unit + integration
npm run test:unit          # node:test, no browser
npm run test:integration   # Playwright + Chromium with the unpacked extension
npm run screenshots        # regenerate docs/screenshots/*.png
npm run icons              # re-render icons from assets/logo.svg
```

**Unit tests** (`test/unit`) cover name normalisation, session merging, join/leave/rejoin and grace
handling, speaking-time accumulation, resume after reload, formatting, storage, and the CSV/XLSX/PDF
encoders. XLSX is read back with SheetJS; the PDF is checked structurally (xref offsets, stream lengths)
and with `pdftotext` when poppler is installed.

**Integration tests** (`test/integration`) launch Chromium with the unpacked extension and route
`https://meet.google.com/*` to [`test/fixtures/mock-meet.html`](test/fixtures/mock-meet.html), a
Meet-like page whose participants join, leave, flicker and speak on command. They check the manifest
(`chrome.developerPrivate` reports no manifest errors, install warnings or runtime errors), the live
in-Meet panel, manual and auto-save, exports, popup *Save now*, settings, the dashboard (search, details,
delete) and that no request leaves the device.

### Project layout

```
extension/         the Chrome extension (load this folder)
docs/              GitHub Pages landing page + screenshots
test/              unit tests, integration tests, mock Meet page
scripts/           package, manifest check, screenshots, icons
assets/            logo source (SVG)
legacy/            v1 Express/SQLite server + React dashboard (unused by v2, see legacy/README.md)
```

### Landing page

`docs/` is a static, dependency-free site. To publish it, go to **Settings → Pages** and set the source
to *Deploy from a branch*, `main`, `/docs`.

## Known limitations

- Google Meet's markup is obfuscated and changes without notice. Detection uses several strategies,
  but a Meet redesign can still break it until the selectors in `extension/lib/detect.js` are updated.
- **Speaking time** depends on Meet showing a speaking indicator for that person. People without a
  visible tile (large calls, or a tile scrolled off-screen) may not have speaking time recorded; keeping
  the People panel open helps.
- Participants are identified by display name, so two people with exactly the same name are merged.
- Times are sampled about once a second, and leaves are recorded after the grace window (default
  10 s), dated to when the person was last seen.
- PDF uses the built-in Helvetica font, so characters outside Latin-1 (for example Bengali, CJK or
  Cyrillic) show as `?` in PDFs. CSV and XLSX keep full Unicode.
- Chrome may throttle background tabs. Speaking-time samples are capped so a throttled tab doesn't
  over-count, but accuracy is lower while the Meet tab is in the background.

## License

MIT
