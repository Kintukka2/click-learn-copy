// Studio editor screens for the System Replay film, waiting for every image to load (scratch data).
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium, type Page } from "playwright";
import { createApp } from "./src/server/app.js";

const PORT = 4300, BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "..", "shots6");
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "shots4", "ids.json"), "utf8"));
const SCRUB = fs.readFileSync(path.join(ROOT, "capture-video-sr.ts"), "utf8").match(/const SCRUB = (`[\s\S]*?`);/)![1];
const scrub = new Function(`return ${SCRUB}`)() as string;
async function settle(page: Page, wait = 800) {
  await page.waitForTimeout(wait);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 }).catch(() => console.log("images not all loaded"));
  await page.waitForTimeout(400);
  await page.evaluate(scrub);
}
async function main() {
  const { app } = createApp({ dataDir: path.join(ROOT, "..", "capdata6"), baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const shot = async (name: string) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log("shot", name); };
  try {
    const cust = await (await fetch(`${BASE}/api/processes/${ids.cust}`)).json();
    await page.goto(`${BASE}/studio/processes/${ids.cust}`); await settle(page, 2000); await shot("studio-en");
    await page.keyboard.press("ArrowDown"); await settle(page); await shot("studio-en-2");
    await page.goto(`${BASE}/studio/processes/${ids.cust}?lang=da`); await settle(page, 2000); await shot("studio-da");
    const v2 = `${cust.startUrl}${cust.startUrl.includes("?") ? "&" : "?"}v=2`;
    await fetch(`${BASE}/api/processes/${ids.cust}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startUrl: v2 }) });
    await page.goto(`${BASE}/studio/processes/${ids.cust}`); await settle(page, 1500);
    await page.getByRole("button", { name: "Test", exact: true }).first().click();
    await page.waitForSelector("[data-testid=report-panel]", { timeout: 120000 });
    await settle(page, 1500); await shot("studio-healed");
    await fetch(`${BASE}/api/processes/${ids.cust}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startUrl: cust.startUrl }) });
    await page.goto(`${BASE}/studio/processes/${ids.draft}`); await settle(page, 1500); await shot("studio-draft");
  } finally { await browser.close(); server.close(); }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
