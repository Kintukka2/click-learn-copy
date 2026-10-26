import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium } from "playwright";
import { createApp } from "./src/server/app.js";
const PORT = 4303, BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "shots", "ids.json"), "utf8"));
async function main() {
  const { app } = createApp({ dataDir: path.join(ROOT, "..", "capdata2"), baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  await fetch(`${BASE}/api/processes/${ids.draft}`, { method: "DELETE" });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`${BASE}/studio/projects/${ids.project}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ROOT, "..", "shots", "studio-project-clean.png") });
  const chips = page.locator(".chip");
  const out = [];
  for (let i = 0; i < (await chips.count()); i++) { const t = (await chips.nth(i).textContent()) ?? ""; if (/passed|healed/i.test(t)) out.push([t, await chips.nth(i).boundingBox()]); }
  console.log(JSON.stringify(out));
  await browser.close(); server.close();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
