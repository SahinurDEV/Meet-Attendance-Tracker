# Legacy: v1 server + React dashboard

This folder keeps the original v1 implementation for reference:

- `server/`: Express + SQLite API that the v1 extension synced attendance to (`http://localhost:5001`)
- `client/`: React/Vite web dashboard (`http://localhost:5173`)

**v2 no longer uses any of this.** The extension in [`../extension`](../extension) is fully
self-contained: attendance is stored in `chrome.storage.local`, the dashboard ships inside the extension,
and nothing is ever sent to a server. That keeps the "all data stays on your device" promise and
removes the need to run a backend.

To run the old stack anyway:

```bash
cd legacy
npm install   # installs server deps + client deps (postinstall)
npm run dev   # API on :5001, dashboard on :5173
```

This code isn't maintained and isn't covered by the v2 test suite. It can be deleted once nobody needs it.
