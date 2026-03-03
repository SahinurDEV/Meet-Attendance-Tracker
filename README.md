# Meet Attendance Tracker

A full-stack Google Meet attendance tracking system with a Chrome Extension, real-time dashboard, and analytics. Automatically detects participants, records join/leave times, and generates exportable reports.

## Features

- **Automatic Tracking** — Chrome extension auto-detects when you join a Google Meet and starts recording attendance
- **Real-time Participant Detection** — Captures participant names, profile avatars, and emails from the meeting
- **Join/Leave Timestamps** — Records exact join and leave times for each participant with session support
- **Smart Filtering** — Filters out UI artifacts and fake names (e.g., "Backgrounds and effects", "Reframe") using intelligent detection
- **Duplicate Prevention** — Handles "(You)", "(Host)" suffixes and doubled name detection to ensure one entry per participant
- **Auto-Sync** — Meeting data is automatically synced to the server when a meeting ends — no login required
- **New Tab Report** — Automatically opens the meeting detail page after a meeting ends (configurable)
- **Dashboard** — Full web dashboard with meeting list, detail views, search, and pagination
- **Analytics** — Charts and stats: daily meeting counts, duration trends, top participants, punctuality data
- **Export** — Export attendance to CSV, XLSX (Excel), or PDF
- **Preferences** — Configure late/early thresholds, auto-tracking, and new tab behavior
- **No Login Required** — Extension auto-registers with a device ID; works out of the box
- **Privacy First** — All data stored locally on your server. No third-party services, no ads, no tracking

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Extension** | Chrome Manifest V3, Content Scripts, Service Worker |
| **Frontend** | React 18, React Router 6, Tailwind CSS 3, Framer Motion |
| **Backend** | Node.js, Express 4 |
| **Database** | SQLite (better-sqlite3) with WAL mode |
| **Auth** | JWT (30-day tokens), bcryptjs |
| **Build** | Vite 6 |

## Project Structure

```
meet-attendance-tracker/
├── client/                     # React web dashboard
│   ├── src/
│   │   ├── App.jsx             # Routes & app shell
│   │   ├── main.jsx            # Entry point
│   │   ├── index.css           # Tailwind imports
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Auth state & token management
│   │   ├── components/
│   │   │   └── Sidebar.jsx     # Dashboard navigation sidebar
│   │   └── pages/
│   │       ├── Landing.jsx     # Landing/marketing page
│   │       ├── Login.jsx       # Login form
│   │       ├── Register.jsx    # Registration form
│   │       ├── DashboardLayout.jsx  # Dashboard shell with sidebar
│   │       ├── Meetings.jsx    # Meeting list (search, sort, paginate)
│   │       ├── MeetingDetail.jsx    # Meeting detail with participant table
│   │       ├── Analytics.jsx   # Charts & analytics dashboard
│   │       └── Preferences.jsx # User settings
│   ├── vite.config.js          # Vite config with API proxy
│   ├── tailwind.config.js      # Tailwind with custom brand colors
│   └── package.json
│
├── server/                     # Express API backend
│   ├── index.js                # Server entry, middleware, route mounting
│   ├── db.js                   # SQLite setup, tables, migrations
│   ├── middleware.js           # JWT auth middleware
│   └── routes/
│       ├── auth.js             # Register, login, device auth
│       ├── meetings.js         # CRUD meetings & participants
│       ├── analytics.js        # Analytics aggregation queries
│       ├── preferences.js      # User preferences
│       └── sync.js             # Extension data sync endpoint
│
├── extension/                  # Chrome extension (Manifest V3)
│   ├── manifest.json           # Extension config & permissions
│   ├── content.js              # Injected into Google Meet pages
│   ├── background.js           # Service worker for sync & auth
│   ├── popup.html              # Extension popup UI
│   ├── popup.js                # Popup logic & controls
│   ├── popup.css               # Popup styles
│   └── icons/                  # Extension icons (16, 48, 128px)
│
├── package.json                # Root package with server dependencies
└── .gitignore
```

## Prerequisites

- **Node.js** 18+ and npm
- **Google Chrome** browser (for the extension)

## Quick Start

```bash
git clone https://github.com/devSahinur/Meet-Attendance-Tracker.git
cd Meet-Attendance-Tracker
npm install
npm run dev
```

That's it. `npm install` automatically installs both server and client dependencies. `npm run dev` starts the backend API (port 5001) and React dashboard (port 5173) together. The SQLite database is created automatically on first run — no setup needed.

> **Dashboard:** http://localhost:5173
> **API Server:** http://localhost:5001

## Installation (Step by Step)

### 1. Clone the repository

```bash
git clone https://github.com/devSahinur/Meet-Attendance-Tracker.git
cd Meet-Attendance-Tracker
```

### 2. Install dependencies

```bash
npm install
```

This installs both server and client dependencies automatically via `postinstall`.

### 3. Start the development servers

```bash
npm run dev
```

This runs both the API server and React dashboard concurrently in one terminal.

Or start them separately:

```bash
# Terminal 1: Start the API server (port 5001)
npm run server

# Terminal 2: Start the React dev server (port 5173)
npm run client
```

The API server runs at **http://localhost:5001** and the dashboard at **http://localhost:5173**. The SQLite database (`data.db`) is created automatically when the server starts for the first time.

### 4. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The extension icon appears in your toolbar

### 5. Test it

1. Join any Google Meet call
2. The extension automatically starts tracking participants
3. When you leave the meeting, it auto-syncs and opens the dashboard with your meeting report
4. View participants, join/leave times, duration, and status (Present / Late / Left Early)

## Usage

### Chrome Extension

| Feature | Description |
|---------|-------------|
| **Auto-tracking** | Starts automatically when you join a Google Meet |
| **On/Off toggle** | Use the popup to enable/disable tracking |
| **Sync Now** | Manually sync data to the server |
| **Dashboard** | Opens the web dashboard from the popup |
| **Status indicator** | Shows tracking state and participant count |

### Web Dashboard

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard/meetings` | All meetings with search, sort, pagination |
| `/dashboard/meetings/:id` | Meeting detail: stats cards, participant table with status |
| `/dashboard/analytics` | Charts: daily meetings, duration stats, top participants |
| `/dashboard/preferences` | Settings: thresholds, auto-tracking, new tab report |

### Meeting Detail Page

Shows a dashboard-style view with:

- **Stats cards** — Participants count, Attendance rate, Avg duration, Total time
- **Status summary** — Present / Late / Left Early badges with counts
- **Participant table** — Name (with avatar), Join time, Leave time, Duration, Status
- **Export** — CSV, XLSX (Excel), PDF

### Export Formats

- **CSV** — Comma-separated values, opens in any spreadsheet
- **XLSX** — Excel-compatible XML spreadsheet
- **PDF** — Formatted print-ready report (opens in new tab for printing)

## API Reference

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/register` | Create account | No |
| `POST` | `/api/auth/login` | Login, get token | No |
| `POST` | `/api/auth/device` | Auto-register by device ID | No |
| `GET` | `/api/auth/me` | Get current user | Yes |

### Meetings

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/meetings` | List meetings (paginated, searchable) | Optional |
| `GET` | `/api/meetings/:id` | Meeting detail with participants | Optional |
| `POST` | `/api/meetings` | Create meeting manually | Yes |
| `DELETE` | `/api/meetings/:id` | Delete meeting | Yes |
| `GET` | `/api/meetings/:id/export/csv` | Export as CSV | Yes |

**Query params for `GET /api/meetings`:**

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Items per page |
| `search` | — | Search by name, code, or URL |
| `sort` | `date-desc` | `date-desc`, `date-asc`, `attendees` |

### Sync (Extension)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/sync` | Push meeting data from extension | Yes |

**Request body:**

```json
{
  "meetings": [
    {
      "meetingCode": "abc-defg-hij",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "startedAt": "2024-03-04T10:00:00.000Z",
      "participants": {
        "John Doe": {
          "name": "John Doe",
          "avatar": "https://...",
          "email": "john@example.com",
          "sessions": [
            { "joinTime": "2024-03-04T10:00:00Z", "leaveTime": "2024-03-04T10:45:00Z" }
          ]
        }
      }
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "synced": 1,
  "skipped": 0,
  "syncedIds": [{ "meetingCode": "abc-defg-hij", "id": 1 }]
}
```

### Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/analytics?days=7` | Dashboard analytics data | Optional |

### Preferences

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/preferences` | Get user preferences | Optional |
| `PUT` | `/api/preferences` | Update preferences | Yes |

**Preference fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoTrack` | boolean | `true` | Auto-start tracking in meetings |
| `newTabReport` | boolean | `true` | Open report tab when meeting ends |
| `lateThresholdMinutes` | number | `5` | Minutes after start to mark as "Late" |
| `earlyThresholdMinutes` | number | `5` | Minutes before end to mark as "Left Early" |

## Database Schema

```sql
-- Users (supports email/password and device-based auth)
users (id, name, email, password, created_at)

-- Meetings (one per Google Meet session per user)
meetings (id, user_id, meeting_code, meeting_url, name,
          started_at, ended_at, duration_seconds,
          attendee_count, is_manual, created_at)

-- Participants (one row per person per meeting)
participants (id, meeting_id, name, email, avatar_url,
              join_time, leave_time, duration_seconds,
              status, created_at)

-- User preferences
preferences (id, user_id, auto_track, new_tab_report,
             late_threshold_minutes, early_threshold_minutes)
```

## How It Works

### Data Flow

```
Google Meet (DOM)
       |
       v
  content.js          Detects participants via [data-self-name] attributes
       |               Tracks joins/leaves in real-time
       |               Saves to chrome.storage.local
       v
  background.js        On meeting end: reads storage, sends POST /api/sync
       |               Auto-registers device, manages JWT token
       v
  Express Server       Receives sync data, deduplicates participants
       |               Stores in SQLite database
       v
  React Dashboard      Fetches from /api/meetings, displays stats & table
```

### Participant Detection

The extension uses Google Meet's `data-self-name` attribute — a reliable marker that Google only applies to actual participants, not UI elements. This avoids false positives from buttons, tooltips, and other DOM text.

**Filtering pipeline:**
1. Extract names from `[data-self-name]` attributes
2. Strip suffixes: `(You)`, `(Host)`, `(Organizer)`, `(Presenter)`
3. Block UI phrases via regex: "Backgrounds and effects", "Admit all", etc.
4. Detect and fix doubled names: "NameName" → "Name"
5. Deduplicate by normalized name

### Sync & Dedup

- Meetings are matched by `meeting_url` (unique per user) or `meeting_code + started_at`
- Participants are flattened: multiple sessions merged into first join / last leave / total duration
- Downgrade protection: re-sync with fewer participants won't overwrite existing data
- Server-side dedup catches any edge cases the extension missed

## Production Deployment

### Build the client

```bash
npm run build
```

This creates `client/dist/` with the production bundle.

### Run in production

```bash
NODE_ENV=production node server/index.js
```

In production mode, the Express server serves both the API and the static React build from `client/dist/`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | Server port |
| `JWT_SECRET` | `meet-attendance-secret-key-change-in-production` | JWT signing key (change this!) |
| `NODE_ENV` | — | Set to `production` for static file serving |

## Configuration

### Extension Settings

Open the extension popup to:
- Toggle tracking on/off
- Sync data manually
- Open the dashboard

### Dashboard Settings

Go to **Dashboard > Preferences** to configure:
- **Automatic Attendance Tracking** — Enable/disable auto-tracking
- **New Tab Report** — Auto-open report when meeting ends (default: ON)
- **Late Arrival Threshold** — Minutes after start to mark "Late" (default: 5)
- **Early Departure Threshold** — Minutes before end to mark "Left Early" (default: 5)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension not tracking | Check that tracking is enabled in the popup toggle |
| Empty dashboard after meeting | Reload extension (`chrome://extensions` > refresh icon), rejoin a test meeting |
| "No meetings" on dashboard | Click "Sync Now" in the extension popup, or check that the server is running |
| Duplicate participants | Update to latest version — dedup handles `(You)` suffixes and doubled names |
| Port already in use | Kill existing process: `lsof -ti:5001 \| xargs kill -9` |
| Server won't start | Check Node.js 18+ is installed: `node --version` |

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -m "Add my feature"`)
4. Push to branch (`git push origin feature/my-feature`)
5. Open a Pull Request
