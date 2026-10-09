const express = require("express");
const db = require("../db");
const { authenticateToken, optionalAuth } = require("../middleware");

const router = express.Router();

// GET /api/meetings — works for guests (empty) and logged-in users
router.get("/", optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({ meetings: [], total: 0, page: 1, totalPages: 1 });
  }

  const { search, sort, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM meetings WHERE user_id = ?";
  const params = [req.user.id];

  if (search) {
    query += " AND (meeting_code LIKE ? OR name LIKE ? OR meeting_url LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (sort === "date-asc") query += " ORDER BY started_at ASC";
  else if (sort === "attendees") query += " ORDER BY attendee_count DESC";
  else query += " ORDER BY started_at DESC";

  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const { total } = db.prepare(countQuery).get(...params);

  query += " LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  const meetings = db.prepare(query).all(...params);

  res.json({
    meetings,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/meetings/:id
router.get("/:id", optionalAuth, (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login to view meeting details" });

  const meeting = db
    .prepare("SELECT * FROM meetings WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  const participants = db
    .prepare("SELECT * FROM participants WHERE meeting_id = ? ORDER BY join_time ASC")
    .all(meeting.id);

  res.json({ meeting, participants });
});

// POST /api/meetings — requires login
router.post("/", authenticateToken, (req, res) => {
  const { meeting_code, meeting_url, name, started_at, ended_at, duration_seconds, attendee_count, is_manual, participants } = req.body;

  if (!meeting_code || !started_at) {
    return res.status(400).json({ error: "meeting_code and started_at are required" });
  }

  // If meeting_url provided, check for duplicates
  if (meeting_url) {
    const existing = db.prepare(
      "SELECT id FROM meetings WHERE user_id = ? AND meeting_url = ?"
    ).get(req.user.id, meeting_url);
    if (existing) {
      return res.status(409).json({ error: "Meeting with this URL already exists", meetingId: existing.id });
    }
  }

  const result = db.prepare(`
    INSERT INTO meetings (user_id, meeting_code, meeting_url, name, started_at, ended_at, duration_seconds, attendee_count, is_manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    meeting_code,
    meeting_url || null,
    name || `Meet – ${meeting_code}`,
    started_at,
    ended_at || null,
    duration_seconds || 0,
    attendee_count || 0,
    is_manual ? 1 : 0
  );

  const meetingId = result.lastInsertRowid;

  if (participants && Array.isArray(participants)) {
    const insertParticipant = db.prepare(`
      INSERT INTO participants (meeting_id, name, email, avatar_url, join_time, leave_time, duration_seconds, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((parts) => {
      for (const p of parts) {
        insertParticipant.run(
          meetingId,
          p.name || "Anonymous",
          p.email || null,
          p.avatar_url || null,
          p.join_time || started_at,
          p.leave_time || null,
          p.duration_seconds || 0,
          p.status || "present"
        );
      }
    });

    insertMany(participants);
    db.prepare("UPDATE meetings SET attendee_count = ? WHERE id = ?").run(participants.length, meetingId);
  }

  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ?").get(meetingId);
  res.status(201).json({ meeting });
});

// DELETE /api/meetings/:id — requires login
router.delete("/:id", authenticateToken, (req, res) => {
  const meeting = db
    .prepare("SELECT id FROM meetings WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  db.prepare("DELETE FROM participants WHERE meeting_id = ?").run(meeting.id);
  db.prepare("DELETE FROM meetings WHERE id = ?").run(meeting.id);

  res.json({ success: true });
});

// GET /api/meetings/:id/participants
router.get("/:id/participants", optionalAuth, (req, res) => {
  if (!req.user) return res.json({ participants: [] });

  const meeting = db
    .prepare("SELECT id FROM meetings WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  const participants = db
    .prepare("SELECT * FROM participants WHERE meeting_id = ? ORDER BY join_time ASC")
    .all(meeting.id);

  res.json({ participants });
});

// GET /api/meetings/:id/export/csv
router.get("/:id/export/csv", authenticateToken, (req, res) => {
  const meeting = db
    .prepare("SELECT * FROM meetings WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  const participants = db
    .prepare("SELECT * FROM participants WHERE meeting_id = ? ORDER BY join_time ASC")
    .all(meeting.id);

  const rows = [["Name", "Join Time", "Leave Time", "Duration (min)", "Status"]];

  for (const p of participants) {
    rows.push([
      `"${(p.name || "").replace(/"/g, '""')}"`,
      `"${p.join_time || "N/A"}"`,
      `"${p.leave_time || "Still in meeting"}"`,
      Math.round((p.duration_seconds / 60) * 100) / 100,
      p.status,
    ]);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=attendance_${meeting.meeting_code}.csv`);
  res.send(csv);
});

module.exports = router;
