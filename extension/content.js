(() => {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────
  let tracking = false;
  let meetingId = null;
  let observer = null;
  let pollInterval = null;
  let meetingStartTime = null;
  let savedStartedAt = null; // persisted startedAt from first save
  const POLL_MS = 3000;

  // participants Map: name -> { name, avatar, email, sessions[], present }
  let participants = new Map();
  let peakParticipants = 0;

  // ── Helpers ────────────────────────────────────────────────────────
  const now = () => new Date();
  const log = (...args) => console.log("[Meet Attendance]", ...args);

  const getMeetingId = () => {
    const match = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : window.location.pathname.replace(/\//g, "") || "unknown";
  };

  // ── Name validation ────────────────────────────────────────────────
  const normalizeName = (name) => {
    return name
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*\(You\)\s*$/i, "")   // "Name (You)" → "Name"
      .replace(/\s*\(Host\)\s*$/i, "")   // "Name (Host)" → "Name"
      .replace(/\s*\(Organizer\)\s*$/i, "")
      .replace(/\s*\(Presenter\)\s*$/i, "")
      .trim();
  };

  const isRealParticipantName = (name) => {
    if (!name || name.length <= 1 || name.length > 80) return false;
    const lower = name.toLowerCase().trim();

    if (lower === "you") return false;
    if (name.includes("_")) return false;
    if (/^\d+$/.test(name)) return false;

    // Block UI phrases — real names don't contain these words
    const uiIndicators = /\b(and|or|on|off|your|the|this|turn|share|stop|start|open|close|click|enable|disable|apply|cancel|admit|deny|remove|all|background|effect|caption|layout|setting|option|control|breakout|recording|stream|screen|present|companion|joining|asking|waiting|mute|unmute|pin|unpin|more|hand|raise|host|meeting|details|info|activities|chat|reframe|camera|microphone|speaker|volume|tile|grid|spotlight|visual|audio|video)\b/i;
    if (uiIndicators.test(lower)) return false;

    return true;
  };

  // ── Extract participant info from DOM ──────────────────────────────

  /**
   * Get direct text of an element (excluding nested children text).
   * Prevents "NameName" from nested spans like <span><span>Name</span></span>.
   */
  const getDirectText = (el) => {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  };

  /**
   * Check if a name looks like a doubled/concatenated name (e.g. "Mix Gamer BDMix Gamer BD").
   * If so, return the un-doubled version. Otherwise return null.
   */
  const unDoubleName = (name) => {
    if (name.length < 4) return null;
    const len = name.length;
    if (len % 2 === 0) {
      const half = name.slice(0, len / 2);
      if (name === half + half) return half;
    }
    // Also try approximate: "Abc DefAbc Def" where spaces vary
    for (let i = 3; i < len - 2; i++) {
      const first = name.slice(0, i);
      const rest = name.slice(i);
      if (first === rest) return first;
    }
    return null;
  };

  const getVisibleParticipants = () => {
    const found = new Map();

    // ── ONLY trust data-self-name attributes (Google Meet's reliable marker) ──
    document.querySelectorAll("[data-self-name]").forEach((el) => {
      const name = el.getAttribute("data-self-name");
      if (!name || !isRealParticipantName(name)) return;
      const normalized = normalizeName(name);
      if (found.has(normalized)) return;

      const container = el.closest("[data-participant-id]") || el.parentElement;
      found.set(normalized, {
        name: normalized,
        avatar: findAvatar(container || el),
        email: findEmail(container || el),
      });
    });

    // ── Fallback: participant panel with data-participant-id ──
    // Only use aria-label or data-self-name child — NEVER span.textContent
    if (found.size === 0) {
      document.querySelectorAll("[data-participant-id]").forEach((el) => {
        const pid = el.getAttribute("data-participant-id");
        if (!pid || pid === "0" || pid.length < 3) return;

        let name = null;
        const selfNameEl = el.querySelector("[data-self-name]");
        if (selfNameEl) {
          name = selfNameEl.getAttribute("data-self-name");
        }
        if (!name) {
          const aria = el.getAttribute("aria-label");
          if (aria && isRealParticipantName(aria)) name = aria;
        }

        if (!name || !isRealParticipantName(name)) return;
        const normalized = normalizeName(name);
        if (found.has(normalized)) return;

        found.set(normalized, {
          name: normalized,
          avatar: findAvatar(el),
          email: findEmail(el),
        });
      });
    }

    // ── Final dedup pass: fix any doubled names that slipped through ──
    const cleaned = new Map();
    for (const [key, value] of found) {
      const fixed = unDoubleName(key);
      const cleanKey = fixed || key;
      if (!cleaned.has(cleanKey)) {
        cleaned.set(cleanKey, { ...value, name: cleanKey });
      } else {
        // Merge: keep better avatar/email
        const existing = cleaned.get(cleanKey);
        if (value.avatar && !existing.avatar) existing.avatar = value.avatar;
        if (value.email && !existing.email) existing.email = value.email;
      }
    }

    return cleaned;
  };

  const findAvatar = (el) => {
    if (!el) return null;
    const img = el.querySelector("img");
    if (img && img.src && !img.src.startsWith("data:") && img.naturalWidth >= 16) {
      return img.src;
    }
    return null;
  };

  const findEmail = (el) => {
    if (!el) return null;
    const aria = el.getAttribute("aria-label") || "";
    const m1 = aria.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (m1) return m1[0];

    const tipped = el.querySelectorAll("[title], [data-tooltip]");
    for (const t of tipped) {
      const tip = t.getAttribute("title") || t.getAttribute("data-tooltip") || "";
      const m2 = tip.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (m2) return m2[0];
    }
    return null;
  };

  // ── Debounced mutation handler ─────────────────────────────────────
  let mutationTimer = null;
  const debouncedProcess = () => {
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      processParticipants();
    }, 500);
  };

  // ── Tracking Logic ─────────────────────────────────────────────────

  const processParticipants = () => {
    if (!tracking) return;

    const currentParticipants = getVisibleParticipants();
    const timestamp = now();
    const currentNames = new Set(currentParticipants.keys());

    // Mark new joins
    currentParticipants.forEach((info, name) => {
      if (!participants.has(name)) {
        participants.set(name, {
          name: info.name,
          avatar: info.avatar || null,
          email: info.email || null,
          sessions: [{ joinTime: timestamp.toISOString(), leaveTime: null }],
          present: true,
        });
        log("Participant joined:", name);
      } else {
        const p = participants.get(name);
        if (info.avatar && !p.avatar) p.avatar = info.avatar;
        if (info.email && !p.email) p.email = info.email;
        if (!p.present) {
          p.sessions.push({ joinTime: timestamp.toISOString(), leaveTime: null });
          p.present = true;
          log("Participant rejoined:", name);
        }
      }
    });

    // Mark leaves
    participants.forEach((p, name) => {
      if (p.present && !currentNames.has(name)) {
        p.present = false;
        const lastSession = p.sessions[p.sessions.length - 1];
        if (lastSession && !lastSession.leaveTime) {
          lastSession.leaveTime = timestamp.toISOString();
        }
        log("Participant left:", name);
      }
    });

    // Track peak
    const currentPresent = [...participants.values()].filter((p) => p.present).length;
    if (currentPresent > peakParticipants) peakParticipants = currentPresent;

    // Persist to storage
    saveToStorage();
  };

  // ── Storage — returns a Promise so we can await it ─────────────────

  const saveToStorage = () => {
    return new Promise((resolve) => {
      const data = {};
      participants.forEach((p, name) => {
        data[name] = {
          name: p.name,
          avatar: p.avatar || null,
          email: p.email || null,
          present: p.present,
          sessions: p.sessions.map((s) => ({
            joinTime: s.joinTime instanceof Date ? s.joinTime.toISOString() : s.joinTime,
            leaveTime: s.leaveTime
              ? (s.leaveTime instanceof Date ? s.leaveTime.toISOString() : s.leaveTime)
              : null,
          })),
        };
      });

      const storageKey = `meeting_${meetingId}`;
      const meetingData = {
        meetingId,
        meetingUrl: window.location.href.split("?")[0], // clean URL without query params
        startedAt: savedStartedAt || (meetingStartTime ? meetingStartTime.toISOString() : now().toISOString()),
        participants: data,
        peakParticipants,
        totalUniqueParticipants: participants.size,
        lastUpdated: now().toISOString(),
      };

      chrome.storage.local.set({ [storageKey]: meetingData, currentMeetingId: meetingId }, () => {
        if (!savedStartedAt) savedStartedAt = meetingData.startedAt;
        resolve();
      });
    });
  };

  // ── Observer Setup ─────────────────────────────────────────────────

  const startObserver = () => {
    if (observer) observer.disconnect();
    observer = new MutationObserver(debouncedProcess);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  // ── Start / Stop ──────────────────────────────────────────────────

  const startTracking = () => {
    if (tracking) return;
    tracking = true;
    meetingId = getMeetingId();
    meetingStartTime = now();
    savedStartedAt = null;
    participants.clear();
    peakParticipants = 0;

    processParticipants();
    startObserver();
    pollInterval = setInterval(processParticipants, POLL_MS);

    chrome.storage.local.set({ trackingActive: true, currentMeetingId: meetingId });
    log("Tracking started for:", meetingId, "| Participants found:", participants.size);
  };

  const stopTracking = async () => {
    if (!tracking) return;
    tracking = false;

    // Mark all present participants as left
    const timestamp = now().toISOString();
    participants.forEach((p) => {
      if (p.present) {
        p.present = false;
        const lastSession = p.sessions[p.sessions.length - 1];
        if (lastSession && !lastSession.leaveTime) {
          lastSession.leaveTime = timestamp;
        }
      }
    });

    // CRITICAL: Wait for storage write to complete BEFORE notifying background
    await saveToStorage();

    log("Data saved. Participants:", participants.size);

    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (mutationTimer) {
      clearTimeout(mutationTimer);
      mutationTimer = null;
    }

    chrome.storage.local.set({ trackingActive: false });

    // Now notify background — data is guaranteed in storage
    const savedMeetingId = meetingId;
    chrome.runtime.sendMessage({ action: "meetingEnded", meetingId: savedMeetingId }, () => {
      if (chrome.runtime.lastError) {
        log("Could not notify background:", chrome.runtime.lastError.message);
      }
    });

    log("Tracking stopped for:", savedMeetingId);
  };

  // ── Auto-detect meeting ────────────────────────────────────────────

  const isMeetingActive = () => {
    const path = window.location.pathname;
    return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.test(path);
  };

  const autoStart = () => {
    if (!isMeetingActive()) return;

    // Wait for participants to become visible before starting
    let attempts = 0;
    const checkReady = setInterval(() => {
      attempts++;
      const visible = getVisibleParticipants();
      log("Auto-start check #" + attempts + " - found", visible.size, "participants");

      if (visible.size > 0 || attempts > 15) {
        clearInterval(checkReady);

        // Even if no participants found after 30s, start tracking anyway
        // (we'll pick them up via polling)
        chrome.storage.local.get(["autoStart", "trackingEnabled"], (result) => {
          if (result.autoStart !== false && result.trackingEnabled !== false) {
            startTracking();
          }
        });
      }
    }, 2000);

    setTimeout(() => clearInterval(checkReady), 120000);
  };

  // ── Detect "meeting ended" screen ──────────────────────────────────
  let meetingEndDetected = false;

  const detectMeetingEnd = () => {
    if (meetingEndDetected || !tracking) return false;

    const endIndicators = [
      '[data-call-ended]',
      '[jsname="r4nke"]',
    ];

    for (const sel of endIndicators) {
      if (document.querySelector(sel)) {
        meetingEndDetected = true;
        stopTracking();
        return true;
      }
    }

    // Text-based detection
    const bodyText = document.body.innerText || "";
    if (
      bodyText.includes("You left the meeting") ||
      bodyText.includes("Meeting ended") ||
      bodyText.includes("You've been removed from the meeting") ||
      bodyText.includes("Return to home screen")
    ) {
      meetingEndDetected = true;
      stopTracking();
      return true;
    }

    return false;
  };

  // ── Message Listener ───────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case "startTracking":
        startTracking();
        sendResponse({ success: true, meetingId });
        break;

      case "stopTracking":
        stopTracking().then(() => {
          sendResponse({ success: true });
        });
        return true; // async response

      case "getStatus":
        sendResponse({
          tracking,
          meetingId,
          isMeeting: isMeetingActive(),
          participantCount: participants.size,
          peakParticipants,
        });
        break;

      case "ping":
        sendResponse({ alive: true });
        break;

      default:
        sendResponse({ error: "Unknown action" });
    }
    return true;
  });

  // ── Detect meeting end (navigating away) ──────────────────────────
  // beforeunload: save data immediately, notify background
  window.addEventListener("beforeunload", () => {
    if (!tracking) return;
    tracking = false;

    // Mark all as left and do a synchronous-style save
    const timestamp = now().toISOString();
    participants.forEach((p) => {
      if (p.present) {
        p.present = false;
        const lastSession = p.sessions[p.sessions.length - 1];
        if (lastSession && !lastSession.leaveTime) {
          lastSession.leaveTime = timestamp;
        }
      }
    });

    // Fire-and-forget save + notify
    saveToStorage();
    chrome.runtime.sendMessage({ action: "meetingEnded", meetingId });
  });

  // ── Detect URL changes (SPA navigation) & meeting end ─────────────

  let lastUrl = window.location.href;
  let endCheckThrottle = 0;

  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (!isMeetingActive() && tracking) {
        stopTracking();
      } else if (isMeetingActive() && !tracking) {
        meetingEndDetected = false;
        autoStart();
      }
    }

    // Throttle meeting-end detection to once per second
    const t = Date.now();
    if (t - endCheckThrottle > 1000) {
      endCheckThrottle = t;
      detectMeetingEnd();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // ── Initialize ─────────────────────────────────────────────────────
  log("Content script loaded on:", window.location.href);
  autoStart();
})();
