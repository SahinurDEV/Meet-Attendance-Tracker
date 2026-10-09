const express = require("express");
const db = require("../db");
const { authenticateToken, optionalAuth } = require("../middleware");

const router = express.Router();

// GET /api/preferences — works for guests (defaults) and logged-in users
router.get("/", optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({
      autoTrack: true,
      newTabReport: true,
      lateThresholdMinutes: 5,
      earlyThresholdMinutes: 5,
    });
  }

  let prefs = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(req.user.id);

  if (!prefs) {
    db.prepare("INSERT INTO preferences (user_id) VALUES (?)").run(req.user.id);
    prefs = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(req.user.id);
  }

  res.json({
    autoTrack: !!prefs.auto_track,
    newTabReport: !!prefs.new_tab_report,
    lateThresholdMinutes: prefs.late_threshold_minutes,
    earlyThresholdMinutes: prefs.early_threshold_minutes,
  });
});

// PUT /api/preferences — requires login
router.put("/", authenticateToken, (req, res) => {
  const { autoTrack, newTabReport, lateThresholdMinutes, earlyThresholdMinutes } = req.body;

  let prefs = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(req.user.id);
  if (!prefs) {
    db.prepare("INSERT INTO preferences (user_id) VALUES (?)").run(req.user.id);
  }

  db.prepare(`
    UPDATE preferences SET
      auto_track = ?,
      new_tab_report = ?,
      late_threshold_minutes = ?,
      early_threshold_minutes = ?
    WHERE user_id = ?
  `).run(
    autoTrack !== undefined ? (autoTrack ? 1 : 0) : 1,
    newTabReport !== undefined ? (newTabReport ? 1 : 0) : 0,
    lateThresholdMinutes || 5,
    earlyThresholdMinutes || 5,
    req.user.id
  );

  res.json({ success: true });
});

module.exports = router;
