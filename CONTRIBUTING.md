# Contributing to Meet Attendance Tracker

Thanks for helping. Bug reports, translations, docs fixes and code are all welcome. If you want to work on
a bigger change, please open an issue first so we can agree on the approach before you spend time on it.

Good places to start are the issues labelled
[`good first issue`](https://github.com/SahinurDEV/Meet-Attendance-Tracker/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
and [`help wanted`](https://github.com/SahinurDEV/Meet-Attendance-Tracker/issues?q=is%3Aopen+label%3A%22help+wanted%22).
Questions and ideas can go to [Discussions](https://github.com/SahinurDEV/Meet-Attendance-Tracker/discussions).

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

- **Local-only stays the default.** The extension makes no network requests and has no servers or
  analytics. `npm run lint:manifest` fails the build if extension code uses `fetch`, XHR, WebSockets or
  remote scripts. Any future cloud feature must be strictly opt-in and discussed in an issue first.
- **No new permissions without discussion.** The extension only asks for `storage` plus a content script
  on `https://meet.google.com/*`. Every new permission makes the Chrome Web Store review harder and asks
  users for more trust.
- **No runtime dependencies or CDNs.** `extension/` is plain JavaScript, HTML and CSS with no build step.
  The encoders (ZIP, XLSX, PDF) are hand-written and bundled.
- **Keep it accessible and translatable.** User-facing strings go through `chrome.i18n`. See
  [Translations](#translations).

## Development setup

You need **Node.js 20+** (CI uses 22), **npm**, and a Chromium-based browser for manual testing.

```bash
git clone https://github.com/SahinurDEV/Meet-Attendance-Tracker.git
cd Meet-Attendance-Tracker
npm install
npm run test:setup   # one-time: download Playwright's Chromium
```

To try your changes, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and
select the `extension/` folder. After editing, click the reload icon on the extension card and reload the
Meet tab.

Optional tools: `poppler-utils` (`pdftotext`, `pdfimages`) turns on extra PDF assertions in the unit
tests, and a Bengali font (for example `fonts-noto-core` on Linux) is needed for the Bengali PDF checks.

## Checks to run before a pull request

```bash
npm run lint             # ESLint
npm run lint:manifest    # MV3 / permission / no-remote-code checks
npm run test:unit        # node:test, no browser (fast)
npm run test:integration # Playwright + Chromium with the unpacked extension and a mock Meet page
npm test                 # unit + integration
npm run test:edge        # optional: integration suite in Microsoft Edge (npx playwright install msedge)
npm run package          # → dist/meet-attendance-tracker-v<version>.zip
```

CI runs all of these on every push to `main` and on every pull request, and uploads the packaged zip as a
build artifact.

### Writing tests

- Pure logic in `extension/lib/*.js` is loaded with `require()` in `test/unit`. Add a unit test for every
  bug fix.
- Anything involving the DOM, the panel, the popup or the dashboard belongs in `test/integration`. Those
  tests route `https://meet.google.com/*` to [`test/fixtures/mock-meet.html`](test/fixtures/mock-meet.html),
  which you can drive with `mockMeet.join()`, `leave()`, `speak()` and `chat()`.
- **Meet's DOM changes.** If detection breaks, update the selector table in `extension/lib/detect.js` and
  extend the mock page so it matches the new markup.

## Translations

Strings live in `scripts/locales.py` as `key: (English, Bengali)` pairs. Edit that file, then run:

```bash
python3 scripts/locales.py   # regenerates extension/_locales/{en,bn}/messages.json
```

Don't edit the JSON files by hand. The i18n tests check that both locales have the same keys and
placeholders. They also check that the store-facing strings (name, description) are plain sentences and
not keyword lists, because the Chrome Web Store rejects those. To add a new language, open an issue first;
the generator will need a new column.

## Pull request process

1. Fork the repository and create a branch from `main` (for example `fix/chat-dedup` or `feat/zoom-support`).
2. Make focused commits with clear messages. [Conventional Commits](https://www.conventionalcommits.org/)
   such as `fix:`, `feat:` or `docs:` are appreciated but not required.
3. Run the checks above, and update the README or docs if behaviour changes.
4. Open a pull request against `main` and fill in the template. Include screenshots for UI changes.
5. CI must pass. A maintainer (see [CODEOWNERS](.github/CODEOWNERS)) reviews it, and it is merged once
   approved.

## Releases

Maintainers only:

1. Bump the version: `npm version X.Y.Z --no-git-tag-version`, then set the same version in
   `extension/manifest.json` and `APP_VERSION` in `extension/lib/export.js`. A unit test checks that all
   three match.
2. Merge to `main`, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. [`release.yml`](.github/workflows/release.yml) checks that the tag matches the manifest version, runs
   lint and unit tests, builds the zip and creates a GitHub Release with the zip and its SHA-256 attached.

### Optional: publish to the Chrome Web Store automatically

The release workflow's `chrome-web-store` job uploads the zip and submits it for review with
[chrome-webstore-upload-cli](https://github.com/fregante/chrome-webstore-upload-cli). It **skips cleanly**
unless these repository secrets exist (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
|---|---|
| `CWS_CLIENT_ID` | OAuth client ID from a Google Cloud project with the Chrome Web Store API enabled |
| `CWS_CLIENT_SECRET` | OAuth client secret for that client |
| `CWS_REFRESH_TOKEN` | Refresh token for the publisher account |
| `CWS_PUBLISHER_ID` | Publisher ID from the Chrome Web Store developer dashboard |
| `CWS_EXTENSION_ID` | Optional; defaults to `knhhplmldjejlbhpnhgcbcbnglghoblm` |

[This guide](https://github.com/fregante/chrome-webstore-upload-keys) explains how to create the client and
the refresh token. Don't push a tag while an earlier version is still in review unless you mean to replace it.

## Reporting security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
