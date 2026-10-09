/*
 * Meet Attendance Tracker: participant detection for the Google Meet DOM.
 *
 * Google Meet's markup is obfuscated and changes often, so detection uses
 * several independent strategies and merges their results:
 *   1. People panel        role=list items inside the "Participants"/"People" panel
 *   2. Participant tiles   [data-participant-id] / [data-requested-participant-id]
 *   3. Self-name markers   [data-self-name]
 *   4. Aria-labelled tiles  generic fallback on labelled video/tile containers
 * Every selector lives in SELECTORS below so it can be tuned in one place.
 */
(function (root, factory) {
  const core = root.MAT || (typeof require === "function" ? require("./core.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MAT = Object.assign(root.MAT || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  const SELECTORS = {
    panelLists: [
      '[role="list"][aria-label*="articipant" i]',
      '[role="list"][aria-label*="people" i]',
      '[role="list"][aria-label*="in call" i]',
      '[aria-label*="articipants" i] [role="list"]',
      '[jsname="jrQDbd"]',
    ],
    panelItems: '[role="listitem"]',
    tiles: "[data-participant-id], [data-requested-participant-id]",
    tileName: [
      "[data-self-name]",
      "[data-participant-name]",
      ".zWGUib",
      ".XEazBc",
      ".dwSJ2e",
      '[jsname="EydYod"]',
      ".notranslate",
    ],
    selfName: "[data-self-name]",
    labelledTiles: '[data-tile-media-id], [data-ssrc], div[jscontroller][aria-label][data-resolution-cap]',
    speaking: [
      '[data-is-speaking="true"]',
      '[data-speaking="true"]',
      '[data-audio-active="true"]',
      '[aria-label*="is speaking" i]',
      '[aria-label*="speaking now" i]',
      '[class*="speaking" i]:not([class*="not-speaking" i])',
      ".IisKdb.BbJhmb", // historic Meet "audio level" indicator when active
    ],
    inCall: [
      '[aria-label*="Leave call" i]',
      '[data-tooltip*="Leave call" i]',
      '[jsname="CQylAd"]',
      "[data-participant-id]",
    ],
    endScreen: ["[data-call-ended]", '[jsname="r4nke"]'],
  };

  const END_TEXT_RE = /(you left the meeting|you've left the meeting|the call has ended|meeting ended|you've been removed from the meeting|return to home screen)/i;

  function qsa(rootEl, sel) {
    try {
      return Array.from(rootEl.querySelectorAll(sel));
    } catch (_) {
      return []; // selector unsupported in this engine (e.g. the "i" flag)
    }
  }
  function matches(el, sel) {
    try {
      return el.matches(sel);
    } catch (_) {
      return false;
    }
  }

  function textOf(el) {
    if (!el) return "";
    return (el.getAttribute && (el.getAttribute("data-self-name") || el.getAttribute("data-participant-name"))) || el.textContent || "";
  }

  function isSpeaking(el) {
    if (!el) return false;
    for (const sel of SELECTORS.speaking) {
      if (matches(el, sel) || qsa(el, sel).length) return true;
    }
    return false;
  }

  function findAvatar(el) {
    const img = el && el.querySelector && el.querySelector("img[src]");
    const src = img && img.getAttribute("src");
    return src && /^https:\/\//.test(src) ? src : null;
  }

  function fromLabel(raw) {
    const name = core.normalizeName(raw);
    if (!core.isLikelyName(name)) return null;
    return { name, key: core.nameKey(name), isSelf: core.isSelfLabel(raw) };
  }

  // Strategy 1: the People / Participants side panel.
  function scanPanel(doc) {
    const out = [];
    const lists = new Set();
    for (const sel of SELECTORS.panelLists) qsa(doc, sel).forEach((l) => lists.add(l));
    for (const list of lists) {
      for (const item of qsa(list, SELECTORS.panelItems)) {
        let raw = item.getAttribute("aria-label") || "";
        let nameEl = null;
        for (const sel of SELECTORS.tileName) {
          nameEl = item.querySelector(sel);
          if (nameEl) break;
        }
        if (nameEl) raw = textOf(nameEl) || raw;
        if (!raw) raw = (item.innerText || item.textContent || "").split("\n")[0];
        const info = fromLabel(raw);
        if (!info) continue;
        const fullText = item.textContent || "";
        info.isSelf = info.isSelf || /\(\s*you\s*\)/i.test(fullText);
        info.participantId = item.getAttribute("data-participant-id") || null;
        info.speaking = isSpeaking(item);
        info.avatar = findAvatar(item);
        info.source = "panel";
        out.push(info);
      }
    }
    return out;
  }

  // Strategy 2: video tiles carrying a participant id.
  function scanTiles(doc) {
    const out = [];
    const tiles = qsa(doc, SELECTORS.tiles).filter((t) => !t.parentElement || !t.parentElement.closest(SELECTORS.tiles));
    for (const tile of tiles) {
      const pid = tile.getAttribute("data-participant-id") || tile.getAttribute("data-requested-participant-id");
      let raw = "";
      for (const sel of SELECTORS.tileName) {
        const el = matches(tile, sel) ? tile : tile.querySelector(sel);
        if (el && textOf(el).trim()) {
          raw = textOf(el);
          break;
        }
      }
      if (!raw) raw = tile.getAttribute("aria-label") || "";
      const info = fromLabel(raw);
      if (!info) continue;
      info.isSelf = info.isSelf || /\(\s*you\s*\)/i.test(tile.textContent || "");
      info.participantId = pid;
      info.speaking = isSpeaking(tile);
      info.avatar = findAvatar(tile);
      info.source = "tile";
      out.push(info);
    }
    return out;
  }

  // Strategy 3: [data-self-name] markers anywhere (older Meet builds).
  function scanSelfName(doc) {
    const out = [];
    for (const el of qsa(doc, SELECTORS.selfName)) {
      const info = fromLabel(el.getAttribute("data-self-name"));
      if (!info) continue;
      const container = el.closest(SELECTORS.tiles) || el.parentElement;
      info.participantId = container && container.getAttribute ? container.getAttribute("data-participant-id") : null;
      info.speaking = isSpeaking(container);
      info.isSelf = info.isSelf || /\(\s*you\s*\)/i.test((container && container.textContent) || "");
      info.source = "self-name";
      out.push(info);
    }
    return out;
  }

  // Strategy 4: generic labelled media tiles (last resort).
  function scanLabelled(doc) {
    const out = [];
    for (const el of qsa(doc, SELECTORS.labelledTiles)) {
      const info = fromLabel(el.getAttribute("aria-label") || el.getAttribute("data-name") || "");
      if (!info) continue;
      info.speaking = isSpeaking(el);
      info.source = "labelled";
      out.push(info);
    }
    return out;
  }

  const STRATEGIES = { panel: scanPanel, tiles: scanTiles, selfName: scanSelfName, labelled: scanLabelled };

  /**
   * Scan the document. Returns de-duplicated participants plus which
   * strategies produced results (useful for diagnostics).
   */
  function scanParticipants(doc = document, opts = {}) {
    const byKey = new Map();
    const used = {};
    for (const [name, fn] of Object.entries(STRATEGIES)) {
      let found = [];
      try {
        found = fn(doc);
      } catch (e) {
        found = [];
      }
      used[name] = found.length;
      // The labelled fallback only runs when nothing better worked.
      if (name === "labelled" && byKey.size) continue;
      for (const p of found) {
        const prev = byKey.get(p.key);
        if (!prev) byKey.set(p.key, Object.assign({}, p));
        else {
          prev.speaking = prev.speaking || p.speaking;
          prev.isSelf = prev.isSelf || p.isSelf;
          prev.participantId = prev.participantId || p.participantId;
          prev.avatar = prev.avatar || p.avatar;
          if (p.name.length > prev.name.length) prev.name = p.name;
        }
      }
    }
    if (opts.selfName) {
      const selfKey = core.nameKey(opts.selfName);
      const self = byKey.get(selfKey);
      if (self) self.isSelf = true;
    }
    return { participants: [...byKey.values()], strategies: used };
  }

  function isInCall(doc = document) {
    return SELECTORS.inCall.some((sel) => qsa(doc, sel).length > 0);
  }

  function isEndScreen(doc = document) {
    if (SELECTORS.endScreen.some((sel) => qsa(doc, sel).length > 0)) return true;
    const t = (doc.body && (doc.body.innerText || doc.body.textContent)) || "";
    return t.length < 5000 && END_TEXT_RE.test(t);
  }

  function meetingTitle(doc = document) {
    const el = doc.querySelector("[data-meeting-title]") || doc.querySelector('[jsname="NeC6gb"]');
    const fromAttr = el && (el.getAttribute("data-meeting-title") || el.textContent);
    if (fromAttr && fromAttr.trim()) return fromAttr.trim().slice(0, 120);
    const t = (doc.title || "").replace(/^Meet\s*[-–:]\s*/i, "").replace(/\s*[-–]\s*Google Meet$/i, "").trim();
    return t && !/^google meet$/i.test(t) && !/^[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}$/i.test(t) ? t.slice(0, 120) : "";
  }

  return { SELECTORS, scanParticipants, isInCall, isEndScreen, meetingTitle };
});
