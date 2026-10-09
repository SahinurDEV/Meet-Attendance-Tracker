// Render assets/logo.svg to the PNG icon sizes the extension needs.
import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "assets/logo.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(path.join(root, "extension/icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  await page.screenshot({ path: path.join(root, `extension/icons/icon${size}.png`), omitBackground: true });
}
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="512" height="512" `)}</body></html>`);
await page.screenshot({ path: path.join(root, "docs/assets/logo-512.png"), omitBackground: true }).catch(() => {});
await browser.close();
console.log("Icons written to extension/icons/");
