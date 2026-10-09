const express = require("express");
const cors = require("cors");
const path = require("path");
const authRoutes = require("./routes/auth");
const meetingRoutes = require("./routes/meetings");
const analyticsRoutes = require("./routes/analytics");
const preferencesRoutes = require("./routes/preferences");
const syncRoutes = require("./routes/sync");

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/sync", syncRoutes);

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "..", "client", "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "client", "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[Meet Attendance] Server running on http://localhost:${PORT}`);
});
