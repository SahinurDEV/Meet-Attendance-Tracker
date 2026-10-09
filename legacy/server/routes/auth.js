const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { authenticateToken, generateToken } = require("../middleware");

const router = express.Router();

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)").run(
    name || "Anonymous",
    email,
    hash
  );

  // Create default preferences
  db.prepare("INSERT INTO preferences (user_id) VALUES (?)").run(result.lastInsertRowid);

  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(
    result.lastInsertRowid
  );

  const token = generateToken(user);
  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = generateToken(user);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// GET /api/auth/me
router.get("/me", authenticateToken, (req, res) => {
  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(
    req.user.id
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// POST /api/auth/device — auto-register guest from extension (no email/password needed)
router.post("/device", (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  const email = `device_${deviceId}@guest.local`;

  // Return existing user if already registered
  const existing = db.prepare("SELECT id, name, email, created_at FROM users WHERE email = ?").get(email);
  if (existing) {
    const token = generateToken(existing);
    return res.json({ user: existing, token });
  }

  // Create new guest user
  const hash = bcrypt.hashSync(deviceId, 10);
  const result = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)").run(
    "Extension User",
    email,
    hash
  );

  db.prepare("INSERT INTO preferences (user_id) VALUES (?)").run(result.lastInsertRowid);

  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(
    result.lastInsertRowid
  );

  const token = generateToken(user);
  res.status(201).json({ user, token });
});

module.exports = router;
