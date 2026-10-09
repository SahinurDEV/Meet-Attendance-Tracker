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
