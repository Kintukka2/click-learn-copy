// Captures real Steplight screens at 2x for the promo videos (scratch copy of the repo).
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium, type Page } from "playwright";
import type { Process, Project, ReplayReport } from "./src/core/model.js";
import { createApp } from "./src/server/app.js";

const PORT = 4300;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(ROOT, "..", "capdata4");
const OUT = path.join(ROOT, "..", "shots4");
const boxes: Record<string, unknown> = {};

async function api<T>(method: string, url: string, body?: unknown, raw?: Buffer, q = ""): Promise<T> {
  const res = await fetch(`${BASE}/api${url}${q}`, {
    method,
    headers: raw ? { "Content-Type": "application/octet-stream" } : { "Content-Type": "application/json" },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : Buffer.from(await res.arrayBuffer())) as Promise<T>;
}

// Hide internal hosts: show the demo app under a reserved example domain.
async function scrub(page: Page) {
  await page.evaluate(SCRUB);
}
const SCRUB = `(() => {
  const fix = (s) => s
    .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):\\d+\\/demo-erp\\/?/g, "https://erp.northwind.example/")
    .replace(/(localhost|127\\.0\\.0\\.1):\\d+\\/demo-erp\\/?/g, "erp.northwind.example/")
    .replace(/https?:\\/\\/(localhost|127\\.0\\.0\\.1):\\d+/g, "https://learn.northwind.example")
    .replace(/(localhost|127\\.0\\.0\\.1):\\d+/g, "learn.northwind.example")
    .replace(/Steplight/g, "System Replay")
    .replace(/[?&]reset=1(&lang=\\w+)?(&v=\\d)?/g, "")
    .replace(/\\?lang=\\w+/g, "");
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.nodeValue && /localhost|127\\.0\\.0\\.1|Steplight/.test(n.nodeValue)) n.nodeValue = fix(n.nodeValue);
    root.querySelectorAll && root.querySelectorAll("input,textarea").forEach((i) => { if (/localhost/.test(i.value)) i.value = fix(i.value); });
    root.querySelectorAll && root.querySelectorAll("*").forEach((el) => el.shadowRoot && walk(el.shadowRoot));
  };
  walk(document.body);
})()`;

async function box(page: Page, key: string, selector: string) {
  const b = await page.locator(selector).first().boundingBox().catch(() => null);
  boxes[key] = b;
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { app } = createApp({ dataDir: DATA, baseUrl: BASE, internalUrl: `http://127.0.0.1:${PORT}` });
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, () => r(s));
  });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = async (name: string, wait = 500) => {
    await page.waitForTimeout(wait);
    await scrub(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("shot", name);
  };
  try {
    // empty Studio: onboarding
    await page.goto(`${BASE}/studio/`);
    await page.waitForTimeout(1500);
    await shot("studio-onboarding");

    const project = await api<Project>("POST", "/demo-project", { name: "Northwind ERP Training", languages: ["en", "da", "de"] });
    const processes = await api<Process[]>("GET", `/projects/${project.id}/processes`);
    console.log("processes", processes.map((p) => `${p.title} (${p.steps.length})`).join(", "));
    for (const p of processes) {
      await api("POST", `/processes/${p.id}/replay`, { mode: "update" });
      await api("POST", `/processes/${p.id}/replay`, { mode: "test" });
      for (const lang of ["da", "de"]) await api("POST", `/processes/${p.id}/translate`, { lang });
    }
    const cust = processes.find((p) => /new customer/i.test(p.title))!;
    const order = processes.find((p) => /sales order/i.test(p.title)) ?? cust;

    // self-healing against layout v2: the stored report shows healed steps
    const v2Url = `${cust.startUrl}${cust.startUrl.includes("?") ? "&" : "?"}v=2`;
    await api("PATCH", `/processes/${cust.id}`, { startUrl: v2Url });
    const v2 = await api<{ report: ReplayReport }>("POST", `/processes/${cust.id}/replay`, { mode: "test" });
    fs.writeFileSync(path.join(OUT, "v2-report.json"), JSON.stringify(v2.report, null, 2));
    console.log("v2:", v2.report.results.map((r) => r.status).join(","));
    await api("PATCH", `/processes/${cust.id}`, { startUrl: cust.startUrl });

    await api("POST", `/projects/${project.id}/publish`);
    await api("POST", "/events", { projectId: project.id, processId: cust.id, type: "test_complete", score: 92 });

    // real exports
    for (const [f, ext] of [["docx", "docx"], ["pptx", "pptx"], ["pdf", "pdf"], ["html", "html"]] as const) {
      for (const lang of ["en", "da"]) {
        const buf = await api<Buffer>("GET", `/processes/${cust.id}/export/${f}?lang=${lang}`);
        fs.writeFileSync(path.join(OUT, `export-${lang}.${ext}`), buf);
      }
    }
    // import the Word guide back: a drafted process
    const docx = fs.readFileSync(path.join(OUT, "export-en.docx"));
    const imp = await api<{ process: Process }>("POST", `/projects/${project.id}/import-guide`, undefined, docx, `?fileName=Create%20a%20new%20customer.docx&startUrl=${encodeURIComponent(cust.startUrl)}&chapter=Sales`);
    fs.writeFileSync(path.join(OUT, "ids.json"), JSON.stringify({ project: project.id, cust: cust.id, order: order.id, draft: imp.process.id }, null, 2));

    // ---------------- demo ERP
    await page.goto(`${BASE}/demo-erp/#/customers?reset=1&lang=en&v=1`);
    await page.waitForTimeout(800);
    await box(page, "erp-v1-new", "button:has-text('New')");
    await shot("erp-customers-en");
    await page.getByRole("button", { name: "New" }).first().click();
    await page.waitForTimeout(600);
    await box(page, "erp-form-name", "label:has-text('Name') >> xpath=..");
    await shot("erp-customer-new-en");
    await page.getByLabel("Name", { exact: true }).fill("Fjord Kontormøbler ApS");
    await page.getByLabel("Address", { exact: true }).click();
    await shot("erp-customer-name-typed");

    await page.goto(`${BASE}/demo-erp/#/customers?lang=en&v=2`);
    await page.waitForTimeout(800);
    await box(page, "erp-v2-new", "button:has-text('New')");
    await shot("erp-customers-v2-en");
    await page.goto(`${BASE}/demo-erp/#/customers?lang=da&v=2`);
    await shot("erp-customers-v2-da", 800);
    await page.goto(`${BASE}/demo-erp/#/customers?lang=da&v=1`);
    await shot("erp-customers-da", 800);
    await page.goto(`${BASE}/demo-erp/#/customers?lang=de&v=1`);
    await shot("erp-customers-de", 800);
    await page.goto(`${BASE}/demo-erp/#/sales-orders?lang=en&v=1`);
    await shot("erp-salesorders-en", 800);
    await page.goto(`${BASE}/demo-erp/#/?lang=en&v=1`);

    // ---------------- Studio
    await page.goto(`${BASE}/studio/`);
    await page.waitForSelector("text=Northwind ERP Training");
    await shot("studio-projects", 800);
    await page.goto(`${BASE}/studio/projects/${project.id}`);
    await shot("studio-project", 1200);
    for (const [proc, tag] of [[cust, "cust"], [order, "order"]] as const) {
      await page.goto(`${BASE}/studio/processes/${proc.id}`);
      await page.waitForTimeout(1800);
      await shot(`studio-editor-${tag}-en`);
      await page.keyboard.press("ArrowDown");
      await shot(`studio-editor-${tag}-en-step2`, 700);
      await page.keyboard.press("ArrowDown");
      await shot(`studio-editor-${tag}-en-step3`, 700);
      await page.goto(`${BASE}/studio/processes/${proc.id}?lang=da`);
      await shot(`studio-editor-${tag}-da`, 1800);
      await page.goto(`${BASE}/studio/processes/${proc.id}?lang=de`);
      await shot(`studio-editor-${tag}-de`, 1800);
    }
    // export menu
    await page.goto(`${BASE}/studio/processes/${cust.id}`);
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Export/ }).first().click().catch(() => undefined);
    await shot("studio-editor-export-menu", 600);
    await page.keyboard.press("Escape");
    // healed test from the editor: point at v2, press Test, keep the report drawer
    await api("PATCH", `/processes/${cust.id}`, { startUrl: v2Url });
    await page.goto(`${BASE}/studio/processes/${cust.id}`);
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Test", exact: true }).first().click();
    await page.waitForSelector("[data-testid=report-panel]", { timeout: 120000 }).catch(() => undefined);
    await shot("studio-editor-test-healed", 1000);
    await api("PATCH", `/processes/${cust.id}`, { startUrl: cust.startUrl });
    await page.goto(`${BASE}/studio/projects/${project.id}`);
    await shot("studio-project-healed", 1200);
    await page.goto(`${BASE}/studio/projects/${project.id}/analytics`);
    await shot("studio-analytics", 1200);
    await page.goto(`${BASE}/studio/projects/${project.id}/publishing`);
    await shot("studio-publishing", 1200);
    await page.goto(`${BASE}/studio/processes/${imp.process.id}`);
    await shot("studio-editor-draft", 1800);

    // ---------------- portal + players
    await page.goto(`${BASE}/portal/${project.id}/`);
    await page.waitForSelector(".slp-card");
    await shot("portal-home", 800);
    await page.goto(`${BASE}/portal/${project.id}/#/p/${cust.id}`);
    await page.waitForSelector(".slp-step");
    await shot("portal-guide", 800);
    await page.goto(`${BASE}/portal/${project.id}/#/p/${cust.id}/show`);
    await page.waitForTimeout(800);
    await page.locator(".sl-card-intro button").first().click().catch(() => undefined);
    for (const t of [2500, 2500, 2500, 2500]) await shot(`player-show-${t}-${Date.now() % 1000}`, t);
    await page.goto(`${BASE}/portal/${project.id}/#/p/${cust.id}/try`);
    await page.waitForTimeout(800);
    await page.locator(".sl-card-intro button").first().click().catch(() => undefined);
    await shot("player-try", 1500);
    await page.goto(`${BASE}/portal/${project.id}/#/p/${cust.id}/test`);
    await page.waitForTimeout(800);
    await shot("player-test-intro", 300);
    await page.locator(".sl-card-intro button").first().click().catch(() => undefined);
    await shot("player-test", 1500);
    // AI help
    await page.goto(`${BASE}/portal/${project.id}/`);
    await page.waitForSelector(".slp-card");
    await page.locator(".slp-ask-fab").click();
    await page.waitForTimeout(400);
    await page.locator(".slp-ask-panel input, .slp-ask-panel textarea").first().fill("How do I create a new customer?");
    await page.keyboard.press("Enter");
    await shot("portal-ask", 3000);
    // Danish portal
    await page.goto(`${BASE}/portal/${project.id}/?lang=da#/p/${cust.id}`);
    await shot("portal-guide-da", 1500);

    // ---------------- Assist on the live app
    const resolvedUrl = `${BASE}/api/processes/${cust.id}/resolved?lang=en`;
    const start = new URL(cust.startUrl.replace("reset=1", "reset=1&v=1"));
    start.hash = `${start.hash}${start.hash.includes("?") ? "&" : "?"}sl_assist=${encodeURIComponent(resolvedUrl)}`;
    await page.goto(start.toString());
    await shot("assist-step1", 2500);
    await page.getByRole("button", { name: "New" }).first().click();
    await shot("assist-step2", 1500);
    await page.getByLabel("Name", { exact: true }).fill("Fjord Kontormøbler ApS");
    await page.getByLabel("Name", { exact: true }).blur();
    await shot("assist-step3", 1500);
  } finally {
    fs.writeFileSync(path.join(OUT, "boxes.json"), JSON.stringify(boxes, null, 2));
    await browser.close();
    server.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
