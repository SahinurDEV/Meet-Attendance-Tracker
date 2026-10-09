/*
 * Meet Attendance Tracker: localisation helpers on top of chrome.i18n.
 * Strings live in _locales/<lang>/messages.json (en + bn so far).
 */
(function (root) {
  "use strict";
  function t(key, subs) {
    try {
      const v = root.chrome && chrome.i18n && chrome.i18n.getMessage(key, subs == null ? undefined : [].concat(subs).map(String));
      if (v) return v;
    } catch (_) {}
    return key;
  }
  /** Fill data-i18n / data-i18n-placeholder / data-i18n-title / data-i18n-aria attributes. */
  function applyI18n(scope) {
    const r = scope || document;
    r.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.getAttribute("data-i18n"))));
    r.querySelectorAll("[data-i18n-placeholder]").forEach((el) => el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"))));
    r.querySelectorAll("[data-i18n-title]").forEach((el) => el.setAttribute("title", t(el.getAttribute("data-i18n-title"))));
    r.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))));
    if (r === document) {
      try {
        document.documentElement.lang = chrome.i18n.getUILanguage().split("-")[0] || "en";
      } catch (_) {}
    }
  }
  function uiLang() {
    try {
      return chrome.i18n.getUILanguage();
    } catch (_) {
      return "en";
    }
  }
  /** Status label in the UI language. */
  function tStatus(status, guest) {
    const base = t("status_" + status);
    return guest ? `${base} ${t("status_guestSuffix")}` : base;
  }
  root.MAT = Object.assign(root.MAT || {}, { t, applyI18n, uiLang, tStatus });
})(globalThis);
