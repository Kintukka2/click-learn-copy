import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium } from "playwright";
import { createApp } from "./src/server/app.js";
const PORT = 4304, BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "shots", "ids.json"), "utf8"));
async function main() {
  const { app } = createApp({ dataDir: path.join(ROOT, "..", "capdata2"), baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  await fetch(`${BASE}/api/projects/${ids.project}/publish`, { method: "POST" });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`${BASE}/portal/${ids.project}/`);
  await page.waitForSelector(".slp-card");
  await page.locator(".slp-ask-fab").click();
  await page.waitForTimeout(400);
  await page.locator(".slp-ask-panel input, .slp-ask-panel textarea").first().fill("How do I create a new customer?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(ROOT, "..", "shots", "portal-ask-clean.png") });
  console.log("panel", await page.locator(".slp-ask-panel").boundingBox());
  console.log("log", await page.locator(".slp-ask-log").boundingBox());
  const src = page.locator(".slp-ask-panel :text('Based on')");
  console.log("based", await src.first().boundingBox().catch(() => null));
  await browser.close(); server.close();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
