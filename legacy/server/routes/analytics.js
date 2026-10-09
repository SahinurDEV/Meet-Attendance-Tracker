const express = require("express");
const db = require("../db");
const { optionalAuth } = require("../middleware");

const router = express.Router();

// GET /api/analytics — works for guests (empty) and logged-in users
router.get("/", optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({
      totals: { totalMeetings: 0, totalParticipants: 0, avgDuration: 0, avgAttendees: 0 },
      dailyData: [],
      durationStats: [],
      topParticipants: [],
      punctualityData: [],
      breakdown: [],
    });
  }

  const userId = req.user.id;
  const { days = 7 } = req.query;

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_meetings,
      COALESCE(SUM(attendee_count), 0) as total_participants,
      COALESCE(AVG(duration_seconds), 0) as avg_duration,
      COALESCE(AVG(attendee_count), 0) as avg_attendees
    FROM meetings WHERE user_id = ?
  `).get(userId);

  const meetingsPerDay = db.prepare(`
    SELECT
      DATE(started_at) as day,
      COUNT(*) as count,
      SUM(CASE WHEN is_manual = 0 THEN 1 ELSE 0 END) as scheduled,
      SUM(CASE WHEN is_manual = 1 THEN 1 ELSE 0 END) as adhoc
    FROM meetings
    WHERE user_id = ? AND started_at >= datetime('now', ?)
    GROUP BY DATE(started_at)
    ORDER BY day ASC
  `).all(userId, `-${days} days`);

  const dayMap = {};
  for (let i = parseInt(days) - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { day: key, count: 0, scheduled: 0, adhoc: 0 };
  }
  for (const row of meetingsPerDay) {
    dayMap[row.day] = row;
  }
  const dailyData = Object.values(dayMap);

  const durationStats = db.prepare(`
    SELECT
      DATE(started_at) as day,
      COALESCE(AVG(duration_seconds), 0) as avg_duration
    FROM meetings
    WHERE user_id = ? AND started_at >= datetime('now', ?)
    GROUP BY DATE(started_at)
    ORDER BY day ASC
  `).all(userId, `-${days} days`);

  const topParticipants = db.prepare(`
    SELECT
      p.name,
      COUNT(DISTINCT p.meeting_id) as meeting_count,
      SUM(p.duration_seconds) as total_seconds
    FROM participants p
    JOIN meetings m ON p.meeting_id = m.id
    WHERE m.user_id = ?
    GROUP BY p.name
    ORDER BY meeting_count DESC
    LIMIT 10
  `).all(userId);

  const punctualityData = db.prepare(`
    SELECT
      p.name,
      COUNT(*) as total_meetings,
      SUM(CASE
        WHEN (julianday(p.join_time) - julianday(m.started_at)) * 1440 > 5 THEN 1
        ELSE 0
      END) as late_count
    FROM participants p
    JOIN meetings m ON p.meeting_id = m.id
    WHERE m.user_id = ?
    GROUP BY p.name
    HAVING late_count > 0
    ORDER BY late_count DESC
    LIMIT 10
  `).all(userId);

  const breakdown = db.prepare(`
    SELECT
      CASE
        WHEN attendee_count <= 5 THEN '1-5'
        WHEN attendee_count <= 10 THEN '6-10'
        WHEN attendee_count <= 20 THEN '11-20'
        WHEN attendee_count <= 50 THEN '21-50'
        ELSE '51+'
      END as bucket,
      COUNT(*) as count
    FROM meetings WHERE user_id = ?
    GROUP BY bucket
  `).all(userId);

  res.json({
    totals: {
      totalMeetings: totals.total_meetings,
      totalParticipants: totals.total_participants,
      avgDuration: Math.round(totals.avg_duration / 60),
      avgAttendees: Math.round(totals.avg_attendees),
    },
    dailyData,
    durationStats,
    topParticipants,
    punctualityData,
    breakdown,
  });
});

module.exports = router;
