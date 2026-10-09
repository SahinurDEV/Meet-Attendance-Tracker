// Bengali UI: chrome.i18n picks _locales/bn when the browser language is bn.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { launch, waitFor } from "../helpers/harness.mjs";

let h;
before(async () => {
  h = await launch({ lang: "bn" });
});
after(async () => {
  if (h) await h.close();
});

test("Bengali locale: manifest name, popup, dashboard and in-Meet panel are translated", async () => {
  const manifestName = await h.worker.evaluate(() => chrome.i18n.getMessage("extName"));
  assert.equal(manifestName, "মিট অ্যাটেনডেন্স ট্র্যাকার");
  const popup = await h.context.newPage();
  await popup.goto(h.url("popup.html"));
  await waitFor(async () => /ড্যাশবোর্ড খুলুন/.test(await popup.locator("#openDashboard").textContent()), { message: "popup bn" });
  assert.equal(await popup.evaluate(() => document.documentElement.lang), "bn");
  const dash = await h.context.newPage();
  await dash.goto(h.url("dashboard.html#/settings"));
  await waitFor(async () => /সেটিংস/.test(await dash.locator("h1").first().textContent()), { message: "dashboard bn" });
  const page = await h.context.newPage();
  await page.goto("https://meet.google.com/bnx-abcd-efg");
  const host = page.locator("#mat-attendance-host");
  await waitFor(async () => (await host.locator(".fab .count").textContent()) === "3", { message: "panel count" });
  await host.locator(".fab").click();
  assert.equal(await host.locator(".panel h2").textContent(), "উপস্থিতি");
  assert.equal(await host.locator('[data-act="save"]').textContent(), "এখনই সংরক্ষণ");
  await page.close();
  await dash.close();
  await popup.close();
});
