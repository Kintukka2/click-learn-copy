// Generates a realistic sample process (JSON + PNG screenshots) for developing players and
// generators without a recording: tests/fixtures/out/{process.json, project.json, media/*.png}.
// Usage: npm run fixtures
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { instructionFor } from "../src/core/instructions.js";
import type { Process, Project, Step, Target } from "../src/core/model.js";

const out = path.resolve("tests/fixtures/out");
const media = path.join(out, "media");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(media, { recursive: true });

const html = `<!doctype html><html><head><style>
body{margin:0;font:14px system-ui,sans-serif;background:#f4f6fb;color:#1f2937}
header{background:#1e3a8a;color:#fff;padding:12px 20px;font-weight:600}
main{display:flex}nav{width:200px;background:#fff;height:740px;border-right:1px solid #e5e7eb;padding:12px}
nav a{display:block;padding:8px;color:#1f2937;text-decoration:none;border-radius:6px}nav a.on{background:#e0e7ff}
section{flex:1;padding:24px}h1{margin:0 0 16px;font-size:20px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;max-width:560px}
label{display:block;margin:12px 0 4px;font-weight:500}input,select{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;box-sizing:border-box}
.row{display:flex;gap:8px;margin-top:20px}button{padding:8px 16px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;font:inherit}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
</style></head><body><header>Northwind ERP</header><main><nav><a>Dashboard</a><a class="on">Customers</a><a>Sales orders</a><a>Items</a></nav>
<section><h1>New customer</h1><div class="card">
<label for="name">Customer name</label><input id="name">
<label for="country">Country</label><select id="country"><option value="">Choose…</option><option value="DK">Denmark</option><option value="DE">Germany</option></select>
<label for="email">E-mail</label><input id="email" type="email">
<div class="row"><button class="primary" id="save">Save</button><button>Cancel</button></div></div></section></main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.setContent(html);

async function capture(selector: string, base: Omit<Target, "bbox" | "selectors"> & { selectors: Target["selectors"] }) {
  const box = (await page.locator(selector).boundingBox())!;
  const file = `fixture_${Math.random().toString(36).slice(2, 8)}.png`;
  fs.writeFileSync(path.join(media, file), await page.screenshot());
  return { file, target: { ...base, bbox: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } } as Target };
}

const steps: Step[] = [];
const url = "http://localhost:4100/demo-erp/#/customers/new";
async function add(selector: string, t: Omit<Target, "bbox">, action: Step["action"], value?: string, act?: () => Promise<void>, extra: Partial<Step> = {}) {
  const { file, target } = await capture(selector, t);
  steps.push({
    id: `stp_fx${steps.length + 1}`,
    action,
    target,
    value,
    url,
    title: instructionFor({ action, target, value }, "en"),
    screenshot: file,
    viewport: { width: 1280, height: 800 },
    capturedAt: new Date().toISOString(),
    ...extra,
  });
  await act?.();
}

await add("#name", { tag: "input", role: "textbox", name: "Customer name", label: "Customer name", inputType: "text", selectors: [{ kind: "id", value: "name" }, { kind: "label", value: "Customer name" }] }, "type", "Contoso Ltd", () => page.fill("#name", "Contoso Ltd"));
await add("#country", { tag: "select", role: "combobox", name: "Country", label: "Country", selectors: [{ kind: "id", value: "country" }, { kind: "label", value: "Country" }] }, "select", "Denmark", () => page.selectOption("#country", "DK").then(() => undefined), { optionValue: "DK" });
await add("#email", { tag: "input", role: "textbox", name: "E-mail", label: "E-mail", inputType: "email", selectors: [{ kind: "id", value: "email" }, { kind: "label", value: "E-mail" }] }, "type", "orders@contoso.com", () => page.fill("#email", "orders@contoso.com"));
await add("#save", { tag: "button", role: "button", name: "Save", selectors: [{ kind: "id", value: "save" }, { kind: "role", value: "button|Save" }, { kind: "text", value: "Save" }] }, "click");
steps[3].description = "The customer card opens. You can now create sales orders for this customer.";
await browser.close();

const now = new Date().toISOString();
const project: Project = {
  id: "prj_fixture",
  name: "Northwind ERP Training",
  description: "Fixture project",
  languages: ["en", "da", "de"],
  branding: { companyName: "Northwind Traders", primaryColor: "#2f6fed", accentColor: "#14b8a6" },
  processIds: ["prc_fixture"],
  createdAt: now,
  updatedAt: now,
};
const proc: Process = {
  id: "prc_fixture",
  projectId: project.id,
  title: "Create a new customer",
  description: "Register a new customer so you can sell to them.",
  chapter: "Sales",
  appName: "Northwind ERP",
  startUrl: url,
  lang: "en",
  steps,
  localizations: {},
  passMark: 75,
  createdAt: now,
  updatedAt: now,
};
fs.writeFileSync(path.join(out, "project.json"), JSON.stringify(project, null, 2));
fs.writeFileSync(path.join(out, "process.json"), JSON.stringify(proc, null, 2));
console.log(`fixture written to ${out} (${steps.length} steps)`);
