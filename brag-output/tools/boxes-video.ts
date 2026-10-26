// Measures element boxes (CSS px in a 1440x900 viewport) on the captured screens, using the captured data.
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium, type Page } from "playwright";
import { createApp } from "./src/server/app.js";

const PORT = 4301;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(ROOT, "..", "capdata");
const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "shots", "ids.json"), "utf8"));
const out: Record<string, unknown> = {};

async function grab(page: Page, key: string, sel: string, all = false) {
  const loc = page.locator(sel);
  const n = await loc.count();
  if (!n) {
    out[key] = null;
    return;
  }
  if (all) {
    const res = [];
    for (let i = 0; i < Math.min(n, 14); i++) res.push(await loc.nth(i).boundingBox());
    out[key] = res;
  } else out[key] = await loc.first().boundingBox();
}

async function main() {
  const { app } = createApp({ dataDir: DATA, baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, () => r(s));
  });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(`${BASE}/demo-erp/#/customers?reset=1&lang=en&v=1`);
    await page.waitForTimeout(600);
    await grab(page, "v1.new", "button:has-text('New')");
    await grab(page, "v1.edit", "button:has-text('Edit')");
    await grab(page, "v1.excel", "button:has-text('Open in Excel')");
    await grab(page, "v1.rows", "tbody tr", true);
    await grab(page, "v1.navCustomers", "nav a:has-text('Customers'), a:has-text('Customers')");
    await page.getByRole("button", { name: "New" }).first().click();
    await page.waitForTimeout(500);
    for (const l of ["Name", "Address", "Post Code", "City", "E-mail", "Credit Limit (LCY)"]) await grab(page, `v1.form.${l}`, `#${await page.getByLabel(l, { exact: true }).first().getAttribute("id")}`);
    await grab(page, "v1.form.save", "button:has-text('Save')");
    await page.goto(`${BASE}/demo-erp/#/customers?lang=en&v=2`);
    await page.waitForTimeout(600);
    await grab(page, "v2.new", "button:has-text('New')");
    await grab(page, "v2.edit", "button:has-text('Edit')");
    await grab(page, "v2.excel", "button:has-text('Open in Excel')");
    await grab(page, "v2.side", "aside a, nav a", true);
    await grab(page, "v2.search", "input[type=search], input[placeholder='Search']");
    await page.getByRole("button", { name: "New" }).first().click();
    await page.waitForTimeout(500);
    await grab(page, "v2.form.save", "button:has-text('Save')");
    await grab(page, "v2.form.email", "#customer-email, input[type=email]");
    await page.goto(`${BASE}/demo-erp/#/?v=1`);

    await page.goto(`${BASE}/studio/processes/${ids.cust}`);
    await page.waitForTimeout(1500);
    for (const b of ["Record", "Replay", "Test", "Translate", "Preview", "Guide me"]) await grab(page, `studio.btn.${b}`, `.editor-toolbar button:has-text('${b}')`);
    await grab(page, "studio.export", ".editor-toolbar button:has-text('Export')");
    await grab(page, "studio.lang", "[data-testid=lang-switch]");
    await grab(page, "studio.title", "[aria-label='Process title']");
    await grab(page, "studio.rows", ".step-item, [data-testid^=step-]", true);
    await page.locator(".editor-toolbar button:has-text('Export')").click();
    await page.waitForTimeout(400);
    await grab(page, "studio.menu", "[role=menu]");
    await grab(page, "studio.menu.items", "[role=menuitem]", true);

    await page.goto(`${BASE}/portal/${ids.project}/#/p/${ids.cust}`);
    await page.waitForTimeout(1200);
    await grab(page, "portal.guideme", "button:has-text('Guide me'), a:has-text('Guide me')");
    await grab(page, "portal.downloads", ".slp-downloads, aside");
    await page.goto(`${BASE}/portal/${ids.project}/#/p/${ids.cust}/show`);
    await page.waitForTimeout(1200);
    await grab(page, "portal.player", ".sl-player, .slp-player");
    await page.goto(`${BASE}/portal/${ids.project}/`);
    await page.waitForTimeout(1200);
    await grab(page, "portal.search", ".slp-search, input[type=search]");
    await grab(page, "portal.ask", ".slp-ask-fab");
  } finally {
    fs.writeFileSync(path.join(ROOT, "..", "shots", "boxes2.json"), JSON.stringify(out, null, 1));
    await browser.close();
    server.close();
  }
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
