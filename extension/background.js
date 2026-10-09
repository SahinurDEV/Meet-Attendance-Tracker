/*
 * Meet Attendance Tracker: service worker.
 * Only does local housekeeping: default settings, toolbar badge, keyboard
 * shortcuts, opening the dashboard. No network access, no remote code.
 */
importScripts("lib/storage.js");

chrome.runtime.onInstalled.addListener(async (details) => {
  // Write defaults without overwriting existing preferences.
  const settings = await MAT.getSettings();
  await chrome.storage.local.set({ settings });
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html#/welcome") });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "mat:open-dashboard") {
    const hash = msg.id ? `#/meeting/${encodeURIComponent(msg.id)}` : "#/meetings";
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html" + hash) });
    sendResponse({ ok: true });
  } else if (msg.type === "mat:badge" && sender.tab && sender.tab.id != null) {
    const text = msg.count > 0 ? String(msg.count) : "";
    chrome.action.setBadgeBackgroundColor({ color: "#0f766e", tabId: sender.tab.id });
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    sendResponse({ ok: true });
  }
});

/**
 * Keyboard shortcuts (chrome://extensions/shortcuts). Forwarded to the active
 * tab's content script; tabs.query/sendMessage need no extra permission.
 */
async function handleCommand(command, tab) {
  let target = tab;
  if (!target || target.id == null) [target] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!target || target.id == null) return { ok: false, reason: "no-tab" };
  try {
    return await chrome.tabs.sendMessage(target.id, { type: "mat:command", command });
  } catch (_) {
    return { ok: false, reason: "not-a-meet-tab" }; // no content script in this tab
  }
}
chrome.commands.onCommand.addListener((command, tab) => {
  handleCommand(command, tab);
});
self.__matHandleCommand = handleCommand; // exposed for the integration test
