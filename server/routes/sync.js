const express = require("express");
const db = require("../db");
const { authenticateToken } = require("../middleware");

const router = express.Router();
router.use(authenticateToken);

// POST /api/sync — Chrome extension pushes meeting data here
router.post("/", (req, res) => {
  const { meetings } = req.body;
  const userId = req.user.id;

  if (!meetings || !Array.isArray(meetings)) {
    return res.status(400).json({ error: "meetings array is required" });
  }

  const insertMeeting = db.prepare(`
    INSERT INTO meetings (user_id, meeting_code, meeting_url, name, started_at, ended_at, duration_seconds, attendee_count, is_manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateMeeting = db.prepare(`
    UPDATE meetings SET ended_at = ?, duration_seconds = ?, attendee_count = ?
    WHERE id = ?
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO participants (meeting_id, name, email, avatar_url, join_time, leave_time, duration_seconds, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteParticipants = db.prepare(
    "DELETE FROM participants WHERE meeting_id = ?"
  );

  const checkByUrl = db.prepare(
    "SELECT id FROM meetings WHERE user_id = ? AND meeting_url = ?"
  );

  const checkByCodeAndTime = db.prepare(
    "SELECT id FROM meetings WHERE user_id = ? AND meeting_code = ? AND started_at = ?"
  );

  let synced = 0;
  let skipped = 0;
  const syncedIds = []; // track meeting IDs for the response

  /**
   * Flatten a participant's sessions into ONE row per person.
   * Uses the first join time, last leave time, and total duration.
   */
  const flattenParticipant = (p, meetingStart) => {
    const sessions = p.sessions || [{ joinTime: p.join_time, leaveTime: p.leave_time }];
    let firstJoin = null;
    let lastLeave = null;
    let totalDuration = 0;

    for (const s of sessions) {
      const joinTime = s.joinTime || s.join_time;
      const leaveTime = s.leaveTime || s.leave_time;
      const join = joinTime ? new Date(joinTime) : null;
      const leave = leaveTime ? new Date(leaveTime) : null;

      if (join && (!firstJoin || join < firstJoin)) firstJoin = join;
      if (leave && (!lastLeave || leave > lastLeave)) lastLeave = leave;
      if (join && leave) totalDuration += Math.round((leave - join) / 1000);
    }

    // Determine status
    let status = "present";
    if (lastLeave) {
      const lateThresholdMs = 5 * 60 * 1000;
      if (firstJoin && meetingStart && (firstJoin - meetingStart) > lateThresholdMs) {
        status = "late";
      } else {
        status = "present";
      }
    }

    return {
      name: p.name || "Anonymous",
      email: p.email || null,
      avatar: p.avatar || p.avatar_url || null,
      joinTime: firstJoin ? firstJoin.toISOString() : null,
      leaveTime: lastLeave ? lastLeave.toISOString() : null,
      duration: totalDuration,
      status,
    };
  };

  const syncAll = db.transaction(() => {
    for (const m of meetings) {
      const meetingUrl = m.meetingUrl || m.meeting_url || null;
      const meetingCode = m.meetingCode || m.meeting_code || m.meetingId || "unknown";
      const startedAt = m.startedAt || m.started_at;
      const participants = m.participants || {};
      const participantArr = Array.isArray(participants) ? participants : Object.values(participants);

      const meetingStart = startedAt ? new Date(startedAt) : null;

      // Calculate overall meeting duration
      let earliest = null;
      let latest = null;

      for (const p of participantArr) {
        const sessions = p.sessions || [{ joinTime: p.join_time, leaveTime: p.leave_time }];
        for (const s of sessions) {
          const join = new Date(s.joinTime || s.join_time);
          const leave = s.leaveTime || s.leave_time ? new Date(s.leaveTime || s.leave_time) : null;
          if (!earliest || join < earliest) earliest = join;
          if (leave && (!latest || leave > latest)) latest = leave;
        }
      }

      const duration = earliest && latest ? Math.round((latest - earliest) / 1000) : 0;

      // Clean participant name: strip tags and fix doubled names
      const cleanName = (n) => {
        let name = (n || "Anonymous")
          .trim()
          .replace(/\s*\(You\)\s*$/i, "")
          .replace(/\s*\(Host\)\s*$/i, "")
          .replace(/\s*\(Organizer\)\s*$/i, "")
          .replace(/\s*\(Presenter\)\s*$/i, "")
          .trim();

        // Fix doubled names: "Mix Gamer BDMix Gamer BD" → "Mix Gamer BD"
        const len = name.length;
        if (len >= 4) {
          for (let i = 3; i <= len / 2 + 1 && i < len - 1; i++) {
            const first = name.slice(0, i);
            if (name === first + first) return first;
          }
        }
        return name;
      };

      const uniqueParticipants = new Map();
      for (const p of participantArr) {
        const name = cleanName(p.name);
        if (uniqueParticipants.has(name)) continue; // skip duplicates
        uniqueParticipants.set(name, flattenParticipant(p, meetingStart));
      }
      const flatParticipants = [...uniqueParticipants.values()];

      // Check for existing meeting
      let existing = null;
      if (meetingUrl) {
        existing = checkByUrl.get(userId, meetingUrl);
      }
      if (!existing) {
        existing = checkByCodeAndTime.get(userId, meetingCode, startedAt);
      }

      const insertAllParticipants = (meetingId) => {
        for (const fp of flatParticipants) {
          insertParticipant.run(
            meetingId,
            fp.name,
            fp.email,
            fp.avatar,
            fp.joinTime || startedAt,
            fp.leaveTime,
            fp.duration,
            fp.status
          );
        }
      };

      if (existing) {
        // Only replace participants if incoming data has >= existing count
        // This prevents losing data if extension re-syncs with partial data
        const existingCount = db.prepare(
          "SELECT COUNT(*) as cnt FROM participants WHERE meeting_id = ?"
        ).get(existing.id).cnt;

        if (flatParticipants.length >= existingCount) {
          updateMeeting.run(
            latest ? latest.toISOString() : null,
            duration,
            flatParticipants.length,
            existing.id
          );
          deleteParticipants.run(existing.id);
          insertAllParticipants(existing.id);
        }
        syncedIds.push({ meetingCode, id: existing.id });
        skipped++;
        continue;
      }

      const result = insertMeeting.run(
        userId,
        meetingCode,
        meetingUrl,
        m.name || `Meet – ${meetingCode}`,
        startedAt,
        latest ? latest.toISOString() : null,
        duration,
        flatParticipants.length,
        0
      );

      insertAllParticipants(result.lastInsertRowid);
      syncedIds.push({ meetingCode, id: result.lastInsertRowid });
      synced++;
    }
  });

  syncAll();
  res.json({ success: true, synced, skipped, syncedIds });
});

module.exports = router;
