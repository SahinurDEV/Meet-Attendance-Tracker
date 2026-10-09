const test = require("node:test");
const assert = require("node:assert/strict");

// Minimal in-memory chrome.storage.local with the promise API used by MV3.
function installChromeMock() {
  const data = {};
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return clone(data);
          const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          const out = {};
          for (const k of list) if (k in data) out[k] = clone(data[k]);
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) data[k] = clone(v);
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete data[k];
        },
      },
    },
  };
  return data;
}

const data = installChromeMock();
const st = require("../../extension/lib/storage.js");

test("settings default, merge and sanitize", async () => {
  assert.deepEqual(await st.getSettings(), { ...st.DEFAULT_SETTINGS });
  const s = await st.setSettings({ timeFormat: "12h", ignoreSelf: 1, autoSaveIntervalSec: 1, bogus: undefined });
  assert.equal(s.timeFormat, "12h");
  assert.equal(s.ignoreSelf, true);
  assert.equal(s.autoSaveIntervalSec, 5);
  assert.equal((await st.setSettings({ timeFormat: "weird" })).timeFormat, "24h");
  assert.equal((await st.getSettings()).ignoreSelf, true);
});

test("meetings: save, list (newest first), get, delete, delete all", async () => {
  await st.saveMeeting({ id: "a", startedAt: 1, participants: [] }, "auto");
  await st.saveMeeting({ id: "b", startedAt: 2, participants: [] }, "manual");
  assert.deepEqual((await st.listMeetings()).map((m) => m.id), ["b", "a"]);
  assert.equal((await st.getMeeting("b")).savedVia, "manual");
  await st.deleteMeeting("b");
  assert.equal(await st.getMeeting("b"), null);
  await st.saveMeeting({ id: "c", startedAt: 3, participants: [] });
  assert.equal(await st.deleteAllMeetings(), 2);
  assert.deepEqual(await st.listMeetings(), []);
  assert.ok("settings" in data, "settings untouched by delete all");
});

test("live entries expire after the heartbeat window", async () => {
  await st.setLive("tab1", { record: { id: "x" } });
  data["live:old"] = { heartbeat: Date.now() - 60000, record: { id: "y" } };
  const live = await st.listLive();
  assert.deepEqual(live.map((l) => l.tabKey), ["tab1"]);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!("live:old" in data), "stale entry cleaned up");
  await st.clearLive("tab1");
  assert.deepEqual(await st.listLive(), []);
});

test("commands carry a nonce so repeated commands still fire onChanged", async () => {
  await st.sendCommand("save", "tab1");
  const a = data.cmd;
  await st.sendCommand("save", "tab1");
  assert.equal(a.type, "save");
  assert.notEqual(a.nonce, data.cmd.nonce);
});

test("v2.1 settings: rules, chat, notifications and theme are sanitised", async () => {
  const d = st.sanitizeSettings({});
  assert.equal(d.lateThresholdMin, 5);
  assert.equal(d.minPresenceMode, "minutes");
  assert.equal(d.minPresenceValue, 0);
  assert.equal(d.captureChat, true);
  assert.equal(d.notifyJoinLeave, true);
  assert.equal(d.notifySound, false);
  assert.equal(d.theme, "system");
  const s = st.sanitizeSettings({ lateThresholdMin: "0", minPresenceMode: "percent", minPresenceValue: 250, theme: "neon", notifySound: 1 });
  assert.equal(s.lateThresholdMin, 0); // 0 is a valid "off" value, not replaced by the default
  assert.equal(s.minPresenceValue, 100);
  assert.equal(s.theme, "system");
  assert.equal(s.notifySound, true);
  assert.equal(st.sanitizeSettings({ lateThresholdMin: -3, minPresenceValue: "abc" }).lateThresholdMin, 0);
  assert.equal(st.sanitizeSettings({ theme: "dark" }).theme, "dark");
});

test("auto-saves from Meet never clobber tags, notes, roster choice or an edited title", async () => {
  await st.saveMeeting({ id: "m1", startedAt: 1, title: "Auto title", participants: [] }, "auto");
  await st.updateMeeting("m1", { tags: ["class"], notes: "n", rosterId: "r1", title: "My title", titleEdited: true });
  await st.saveMeeting({ id: "m1", startedAt: 1, title: "Auto title", participants: [{ key: "a" }] }, "auto");
  const m = await st.getMeeting("m1");
  assert.deepEqual(m.tags, ["class"]);
  assert.equal(m.notes, "n");
  assert.equal(m.rosterId, "r1");
  assert.equal(m.title, "My title");
  assert.equal(m.participants.length, 1);
  await st.saveMeeting({ id: "m1", startedAt: 1, title: "Restored", tags: [] }, "manual", { preserveUserFields: false });
  assert.deepEqual((await st.getMeeting("m1")).tags, []);
  assert.equal(await st.updateMeeting("missing", { tags: [] }), null);
  await st.deleteAllMeetings();
});

test("rosters: save (normalised codes), list, pick for a meeting, delete", async () => {
  const a = await st.saveRoster({ name: "CSE-301", codes: [" ABC-defg-HIJ ", "abc-defg-hij", ""], members: [{ name: "A" }] });
  assert.match(a.id, /^r[a-z0-9]+$/);
  assert.deepEqual(a.codes, ["abc-defg-hij"]);
  const b = await st.saveRoster({ name: "Book club", members: [{ name: "B" }] });
  assert.deepEqual((await st.listRosters()).map((r) => r.name), ["Book club", "CSE-301"]);
  const rosters = await st.listRosters();
  assert.equal(st.pickRoster({ code: "abc-defg-hij" }, rosters).id, a.id);
  assert.equal(st.pickRoster({ code: "abc-defg-hij", rosterId: b.id }, rosters).id, b.id);
  assert.equal(st.pickRoster({ code: "abc-defg-hij", rosterId: "none" }, rosters), null);
  assert.equal(st.pickRoster({ code: "zzz-zzzz-zzz" }, rosters), null);
  assert.equal((await st.rosterForMeeting({ code: "abc-defg-hij" })).name, "CSE-301");
  await st.saveRoster(Object.assign({}, a, { name: "CSE-301 A" }));
  assert.equal((await st.listRosters()).length, 2);
  await st.deleteRoster(a.id);
  await st.deleteRoster(b.id);
  assert.deepEqual(await st.listRosters(), []);
  assert.equal(await st.deleteAllMeetings(), 0);
});
