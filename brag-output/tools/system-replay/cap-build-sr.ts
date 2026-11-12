// Extension screens for the manager film storyboard: popup, recording, help panel (scratch data).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { chromium, type Page } from "playwright";
import { createApp } from "./src/server/app.js";

const PORT = 4300, BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "..", "shots5");
const EXT = path.join(ROOT, "dist", "extension");
const SCRUB = `(() => {
  const fix = (s) => s
    .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):\\d+\\/demo-erp\\/?/g, "https://erp.northwind.example/")
    .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):\\d+/g, "https://learn.northwind.example")
    .replace(/(localhost|127\\.0\\.0\\.1):\\d+/g, "learn.northwind.example")
    .replace(/Steplight/g, "System Replay");
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue && /localhost|127\\.0\\.0\\.1|Steplight/.test(n.nodeValue)) n.nodeValue = fix(n.nodeValue);
    root.querySelectorAll && root.querySelectorAll("input,textarea").forEach((i) => { if (/localhost/.test(i.value)) i.value = fix(i.value); });
    root.querySelectorAll && root.querySelectorAll("*").forEach((el) => el.shadowRoot && walk(el.shadowRoot));
  };
  walk(document.body);
})()`;
const shot = async (page: Page, name: string, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.evaluate(SCRUB);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("shot", name);
};

async function main() {
  const { app } = createApp({ dataDir: path.join(ROOT, "..", "capdata5"), baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, () => r(s)); });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sl-cap-profile-")), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    const extId = new URL(sw.url()).host;
    await sw.evaluate((s) => chrome.storage.local.set({ serverUrl: s }), BASE);
    const projects = await (await fetch(`${BASE}/api/projects`)).json();
    const project = projects[0];
    const erp = ctx.pages()[0] ?? (await ctx.newPage());
    const erpUrl = `${BASE}/demo-erp/#/customers?reset=1&lang=en&v=1`;
    await erp.goto(erpUrl);
    await erp.waitForTimeout(1000);
    await erp.bringToFront();
    const tabId = await sw.evaluate(async () => ((await chrome.tabs.query({})) as { id: number; url?: string }[]).find((t) => (t.url ?? "").includes("demo-erp"))!.id);

    const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "shots4", "ids.json"), "utf8"));
    const draft = await (await fetch(`${BASE}/api/processes/${ids.draft}`)).json();
    // popup: the imported guide offers Finalise the guide
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 380, height: 640 });
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
    await popup.waitForTimeout(1200);
    await popup.click("#record > summary").catch(() => undefined);
    await popup.selectOption("#project", ids.project).catch(() => undefined);
    await popup.waitForTimeout(500);
    await popup.selectOption("#process", ids.draft).catch(() => undefined);
    await shot(popup, "popup-finalise", 800);
    // the guide on the page: each step shown in the live app while the author does it
    await erp.goto(draft.startUrl.replace("reset=1", "reset=1&v=1"));
    await erp.waitForTimeout(800);
    await erp.bringToFront();
    await sw.evaluate(({ s, p, t }) => (self as unknown as { steplight: { startRecording(o: unknown): Promise<unknown> } }).steplight.startRecording({ serverUrl: s, processId: p, tabId: t, build: true }), { s: BASE, p: ids.draft, t: tabId });
    await shot(erp, "build-step1", 2500);
    await erp.getByRole("button", { name: "New" }).first().click();
    await shot(erp, "build-step2", 2000);
  } finally {
    await ctx.close();
    server.close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
