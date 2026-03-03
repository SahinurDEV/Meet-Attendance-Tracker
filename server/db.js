const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Create Tables ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Anonymous',
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    meeting_code TEXT NOT NULL,
    meeting_url TEXT,
    name TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    attendee_count INTEGER DEFAULT 0,
    is_manual INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_user_url
    ON meetings(user_id, meeting_url)
    WHERE meeting_url IS NOT NULL;

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Anonymous',
    email TEXT,
    avatar_url TEXT,
    join_time TEXT NOT NULL,
    leave_time TEXT,
    duration_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'present',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    auto_track INTEGER DEFAULT 1,
    new_tab_report INTEGER DEFAULT 1,
    late_threshold_minutes INTEGER DEFAULT 5,
    early_threshold_minutes INTEGER DEFAULT 5,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(started_at);
  CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id);
`);

// ── Migration: add meeting_url column if missing (existing DBs) ────
try {
  db.prepare("SELECT meeting_url FROM meetings LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE meetings ADD COLUMN meeting_url TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_user_url
      ON meetings(user_id, meeting_url)
      WHERE meeting_url IS NOT NULL
  `);
}

// ── Migration: add email, avatar_url to participants if missing ────
try {
  db.prepare("SELECT email FROM participants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE participants ADD COLUMN email TEXT");
}
try {
  db.prepare("SELECT avatar_url FROM participants LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE participants ADD COLUMN avatar_url TEXT");
}

module.exports = db;
