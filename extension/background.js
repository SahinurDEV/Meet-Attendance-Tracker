// Background service worker for Meet Attendance Tracker
// Handles auto-auth, sync, CSV exports, and data management.

const API_BASE = "http://localhost:5001";

// ── Auto-setup on install ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  // IMPORTANT: Preserve existing deviceId across extension reloads/updates
  const existing = await chrome.storage.local.get(["deviceId"]);
  const deviceId = existing.deviceId || crypto.randomUUID();

  // Only set defaults — don't overwrite existing settings
  const defaults = {
    deviceId,
    autoStart: true,
    trackingEnabled: true,
    lateThreshold: 5,
    earlyThreshold: 5,
  };

  // Merge: only set keys that don't exist yet
  const current = await chrome.storage.local.get(Object.keys(defaults));
  const toSet = {};
  for (const [key, val] of Object.entries(defaults)) {
    if (current[key] === undefined || current[key] === null) {
      toSet[key] = val;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  // Always re-register to get a fresh token
  await autoRegister(deviceId);
  console.log("[Meet Attendance] Extension installed/updated. deviceId:", deviceId);
});

// On startup, ensure we have a valid token
chrome.runtime.onStartup.addListener(() => {
  ensureAuth();
});

// ── Auto Auth ─────────────────────────────────────────────────────────

async function ensureAuth() {
  const data = await chrome.storage.local.get(["authToken", "deviceId"]);

  // Validate existing token
  if (data.authToken) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${data.authToken}` },
      });
      if (res.ok) return data.authToken;
      // Token invalid — clear and re-register
      await chrome.storage.local.remove(["authToken"]);
    } catch (e) {
      // Server not reachable — use existing token as fallback
      return data.authToken;
    }
  }

  // Get or create deviceId
  let deviceId = data.deviceId;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  }

  return autoRegister(deviceId);
}

async function autoRegister(deviceId) {
  try {
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      await chrome.storage.local.set({ deviceId });
    }
    const res = await fetch(`${API_BASE}/api/auth/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await chrome.storage.local.set({ authToken: data.token });
    console.log("[Meet Attendance] Registered with server. userId:", data.user?.id);
    return data.token;
  } catch (e) {
    console.log("[Meet Attendance] Server not reachable, will retry on sync.");
    return null;
  }
}

// ── Message Listener ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "exportCSV":
      handleCSVExport(message.meetingId).then(sendResponse);
      return true;

    case "clearData":
      handleClearData(message.meetingId).then(sendResponse);
      return true;

    case "clearAllData":
      handleClearAllData().then(sendResponse);
      return true;

    case "getAllMeetings":
      getAllMeetings().then(sendResponse);
      return true;

    case "openDashboard":
      handleOpenDashboard().then(sendResponse);
      return true;

    case "syncToServer":
      handleSyncToServer().then(sendResponse);
      return true;

    case "meetingEnded":
      handleMeetingEnded(message.meetingId).then(sendResponse);
      return true;

    case "getTrackingEnabled":
      chrome.storage.local.get(["trackingEnabled"], (result) => {
        sendResponse({ enabled: result.trackingEnabled !== false });
      });
      return true;

    case "setTrackingEnabled":
      chrome.storage.local.set({ trackingEnabled: message.enabled });
      sendResponse({ success: true });
      return true;
  }
});

// ── Open Dashboard with Auth ──────────────────────────────────────────

async function handleOpenDashboard() {
  await handleSyncToServer();
  await openDashboard("/dashboard/meetings");
  return { success: true };
}

async function openDashboard(path) {
  const data = await chrome.storage.local.get(["authToken"]);
  const token = data.authToken || "";
  const url = `http://localhost:5173${path || "/dashboard/meetings"}${token ? "?token=" + token : ""}`;
  chrome.tabs.create({ url });
}

// ── Sync All Meetings to Server ───────────────────────────────────────

async function handleSyncToServer() {
  let token = await ensureAuth();
  const data = await chrome.storage.local.get(null);
  token = data.authToken || token;

  if (!token) {
    return { success: false, error: "Cannot reach server" };
  }

  // Collect all meetings from local storage
  const meetings = [];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("meeting_") && value.meetingId) {
      const participantData = value.participants || {};
      const participantCount = Object.keys(participantData).length;

      // Skip meetings with no participants — no point syncing empty data
      if (participantCount === 0) continue;

      meetings.push({
        meetingCode: value.meetingId,
        meetingUrl: value.meetingUrl || null,
        startedAt: value.startedAt,
        name: `Meet – ${value.meetingId}`,
        participants: participantData,
      });
    }
  }

  if (meetings.length === 0) {
    return { success: true, synced: 0, skipped: 0 };
  }

  try {
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ meetings }),
    });

    if (res.status === 401 || res.status === 403) {
      // Token expired — re-register with SAME deviceId
      await chrome.storage.local.remove(["authToken"]);
      const newToken = await ensureAuth();
      if (!newToken) return { success: false, error: "Auth failed" };
      const retry = await fetch(`${API_BASE}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify({ meetings }),
      });
      return await retry.json();
    }

    return await res.json();
  } catch (e) {
    return { success: false, error: "Cannot reach server" };
  }
}

// ── Meeting Ended — auto-sync + optionally open meeting detail page ───

async function handleMeetingEnded(meetingId) {
  console.log("[Meet Attendance] Meeting ended:", meetingId);

  // Wait for storage write to definitely complete
  await new Promise((r) => setTimeout(r, 2000));

  // Verify data exists in storage before syncing
  const storageKey = `meeting_${meetingId}`;
  const stored = await chrome.storage.local.get([storageKey]);
  const meetingData = stored[storageKey];

  if (!meetingData || Object.keys(meetingData.participants || {}).length === 0) {
    console.log("[Meet Attendance] No participant data yet, waiting longer...");
    await new Promise((r) => setTimeout(r, 3000));
  }

  const syncResult = await handleSyncToServer();
  console.log("[Meet Attendance] Auto-sync result:", syncResult);

  // Check if user wants auto-open (New Tab Report preference)
  const shouldOpenTab = await getNewTabReportPref();

  if (shouldOpenTab) {
    let detailPath = "/dashboard/meetings";
    if (syncResult.syncedIds && syncResult.syncedIds.length > 0) {
      const match = syncResult.syncedIds.find((m) => m.meetingCode === meetingId);
      if (match) {
        detailPath = `/dashboard/meetings/${match.id}`;
      } else {
        detailPath = `/dashboard/meetings/${syncResult.syncedIds[syncResult.syncedIds.length - 1].id}`;
      }
    }
    await openDashboard(detailPath);
  }

  return { success: true, syncResult };
}

// ── Fetch New Tab Report preference from server ──────────────────────

async function getNewTabReportPref() {
  try {
    const data = await chrome.storage.local.get(["authToken"]);
    const token = data.authToken;
    if (!token) return true; // default ON

    const res = await fetch(`${API_BASE}/api/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return true; // default ON

    const prefs = await res.json();
    return prefs.newTabReport !== false; // default ON unless explicitly OFF
  } catch (e) {
    return true; // default ON if server unreachable
  }
}

// ── Get All Meetings ─────────────────────────────────────────────────

async function getAllMeetings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      const meetings = [];
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("meeting_") && value.meetingId) {
          meetings.push({
            key,
            meetingId: value.meetingId,
            meetingUrl: value.meetingUrl,
            startedAt: value.startedAt,
            lastUpdated: value.lastUpdated,
            participantCount: Object.keys(value.participants || {}).length,
            peakParticipants: value.peakParticipants || 0,
            totalUniqueParticipants: value.totalUniqueParticipants || 0,
          });
        }
      }
      meetings.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
      resolve({ success: true, meetings });
    });
  });
}

// ── CSV Export ────────────────────────────────────────────────────────

async function handleCSVExport(meetingId) {
  return new Promise((resolve) => {
    const storageKey = `meeting_${meetingId}`;
    chrome.storage.local.get([storageKey, "lateThreshold"], (result) => {
      const meeting = result[storageKey];
      const lateThreshold = result.lateThreshold || 5;

      if (!meeting || !meeting.participants) {
        resolve({ success: false, error: "No data found for this meeting." });
        return;
      }

      const meetingStart = new Date(meeting.startedAt);
      const lateMs = lateThreshold * 60000;
      const rows = [["Name", "Join Time", "Leave Time", "Duration (min)", "Status"]];

      for (const [name, participant] of Object.entries(meeting.participants)) {
        for (const session of participant.sessions) {
          const joinDate = session.joinTime ? new Date(session.joinTime) : null;
          const leaveDate = session.leaveTime ? new Date(session.leaveTime) : null;

          const joinTime = joinDate ? joinDate.toLocaleString() : "N/A";
          const leaveTime = leaveDate ? leaveDate.toLocaleString() : "Still in meeting";
          const duration = joinDate && leaveDate
            ? (Math.round(((leaveDate - joinDate) / 60000) * 100) / 100).toString()
            : "Ongoing";
          const isLate = joinDate && (joinDate - meetingStart) > lateMs;
          const status = !leaveDate ? "Present" : isLate ? "Late" : "Left";

          rows.push([
            escapeCSV(participant.name),
            escapeCSV(joinTime),
            escapeCSV(leaveTime),
            duration,
            status,
          ]);
        }
      }

      const csvContent = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const reader = new FileReader();

      reader.onload = () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `meet-attendance_${meetingId}_${dateStr}.csv`;

        chrome.downloads.download(
          { url: reader.result, filename, saveAs: true },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve({ success: true, downloadId });
            }
          }
        );
      };

      reader.readAsDataURL(blob);
    });
  });
}

function escapeCSV(str) {
  if (!str) return '""';
  return `"${str.replace(/"/g, '""')}"`;
}

// ── Clear Data ───────────────────────────────────────────────────────

async function handleClearData(meetingId) {
  return new Promise((resolve) => {
    const storageKey = `meeting_${meetingId}`;
    chrome.storage.local.remove([storageKey], () => {
      resolve({ success: true });
    });
  });
}

async function handleClearAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      const meetingKeys = Object.keys(data).filter((k) => k.startsWith("meeting_"));
      chrome.storage.local.remove(meetingKeys, () => {
        chrome.storage.local.set({ currentMeetingId: null, trackingActive: false });
        resolve({ success: true, removed: meetingKeys.length });
      });
    });
  });
}
