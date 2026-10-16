// End-to-end check of the whole Steplight pipeline against the bundled Northwind ERP demo app:
//   record (scripted) → replay/update → automated test → layout-v2 healing test → localized replays
//   → every export format in two languages → publish portal → AI ask → analytics.
// Usage: npm run e2e            (expects `npm run build` to have been run)
//        npm run e2e -- --shots (also captures product screenshots into docs/screenshots)
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { chromium, type Page } from "playwright";
import type { OutputFormat, Process, Project, ReplayReport } from "../src/core/model.js";
import { createApp, ROOT } from "../src/server/app.js";

const PORT = Number(process.env.E2E_PORT ?? 4300);
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(ROOT, "tmp", "e2e-data");
const OUT = path.join(ROOT, "tmp", "e2e-out");
const SHOTS = path.join(ROOT, "docs", "screenshots");
const wantShots = process.argv.includes("--shots");

const results: { check: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? res.json() : res.arrayBuffer()) as Promise<T>;
}

function summarize(r: ReplayReport) {
  const c = { ok: 0, healed: 0, failed: 0 };
  for (const x of r.results) c[x.status]++;
  return `${c.ok} ok, ${c.healed} healed, ${c.failed} failed`;
}

async function main() {
  for (const f of ["dist/lib/capture.js", "dist/lib/player.js", "dist/lib/assist.js", "dist/lib/portal.js", "dist/studio/index.html"]) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`${f} missing — run npm run build first`);
  }
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { app } = createApp({ dataDir: DATA, baseUrl: BASE });
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, () => r(s));
  });

  try {
    // 1. record every demo scenario
    let t = Date.now();
    const project = await api<Project>("POST", "/demo-project", { name: "Northwind ERP Training", languages: ["en", "da", "de"] });
    const processes = await api<Process[]>("GET", `/projects/${project.id}/processes`);
    check("demo project recorded", processes.length >= 3 && processes.every((p) => p.steps.length >= 3), `${processes.length} processes, ${processes.map((p) => p.steps.length).join("/")} steps, ${((Date.now() - t) / 1000).toFixed(1)}s`);
    check("every step has a screenshot and an instruction", processes.every((p) => p.steps.every((s) => s.screenshot && s.title)));

    // 2. replay (update) and automated testing
    for (const p of processes) {
      const up = await api<{ report: ReplayReport }>("POST", `/processes/${p.id}/replay`, { mode: "update" });
      check(`replay update: ${p.title}`, up.report.passed, summarize(up.report));
      const test = await api<{ report: ReplayReport }>("POST", `/processes/${p.id}/replay`, { mode: "test" });
      check(`automated test: ${p.title}`, test.report.passed, summarize(test.report));
    }

    // 3. self-healing against the changed layout (v=2)
    const first = processes[0];
    const v2Url = first.startUrl.includes("?") ? `${first.startUrl}&v=2` : `${first.startUrl}?v=2`;
    await api("PATCH", `/processes/${first.id}`, { startUrl: v2Url });
    const v2 = await api<{ report: ReplayReport }>("POST", `/processes/${first.id}/replay`, { mode: "test" });
    const healed = v2.report.results.filter((r) => r.status === "healed").length;
    check("layout v2 test heals changed selectors", v2.report.passed && healed > 0, summarize(v2.report));
    await api("PATCH", `/processes/${first.id}`, { startUrl: first.startUrl });

    // 4. localization via localized replay (+ AI text translation when configured)
    for (const p of processes) {
      for (const lang of ["da", "de"]) {
        const tr = await api<Process>("POST", `/processes/${p.id}/translate`, { lang });
        const loc = tr.localizations[lang];
        const shots = Object.values(loc?.steps ?? {}).filter((s) => s.screenshot).length;
        check(`localized (${lang}): ${p.title}`, !!loc && shots === p.steps.filter((s) => s.target).length, `${shots} localized screenshots`);
      }
    }
    const daSample = await api<{ steps: { title: string }[] }>("GET", `/processes/${first.id}/resolved?lang=da`);
    check("Danish instructions use Danish UI names", daSample.steps.some((s) => /Klik på|Indtast|Vælg/.test(s.title)), daSample.steps.slice(0, 3).map((s) => s.title).join(" | "));

    // 5. every output format, in English and Danish
    const formats: OutputFormat[] = ["docx", "pdf", "pptx", "html", "scorm", "video"];
    for (const lang of ["en", "da"]) {
      for (const f of formats) {
        t = Date.now();
        try {
          const buf = Buffer.from(await api<ArrayBuffer>("GET", `/processes/${first.id}/export/${f}?lang=${lang}`));
          const file = path.join(OUT, `${first.id}-${lang}.${f === "scorm" ? "zip" : f === "video" ? "webm" : f}`);
          fs.writeFileSync(file, buf);
          const magic = buf.subarray(0, 4).toString("hex");
          const valid = f === "pdf" ? buf.subarray(0, 4).toString() === "%PDF" : ["docx", "pptx", "scorm"].includes(f) ? magic === "504b0304" : f === "video" ? magic === "1a45dfa3" : buf.toString("utf8", 0, 200).toLowerCase().includes("<!doctype html");
          check(`export ${f} (${lang})`, valid && buf.length > 2000, `${(buf.length / 1024).toFixed(0)} KB, ${((Date.now() - t) / 1000).toFixed(1)}s`);
        } catch (err) {
          check(`export ${f} (${lang})`, false, (err as Error).message.slice(0, 200));
        }
      }
    }

    // 6. publish portal
    t = Date.now();
    const pub = await api<{ url: string; files: number; downloads: number }>("POST", `/projects/${project.id}/publish`);
    const home = await fetch(pub.url).then((r) => r.text());
    check("portal published", home.includes("STEPLIGHT_PORTAL") && pub.downloads > 0, `${pub.files} files, ${pub.downloads} downloads, ${((Date.now() - t) / 1000).toFixed(1)}s`);

    // 7. AI help
    const ans = await api<{ answer: string; provider: string; sources: { title: string }[] }>("POST", "/ask", { projectId: project.id, question: "How do I create a new customer?", lang: "en" });
    check("AI help answers from documented processes", ans.sources.length > 0 && /customer/i.test(ans.sources[0].title), `${ans.provider}: ${ans.sources[0]?.title}`);

    // 8. analytics flow (events posted by the portal / players)
    await api("POST", "/events", { projectId: project.id, processId: first.id, type: "test_complete", score: 90 });
    const stats = await api<{ totals: Record<string, number>; avgScore: Record<string, number> }>("GET", `/projects/${project.id}/analytics`);
    check("analytics aggregates events", (stats.totals.download ?? 0) > 0 && stats.avgScore[first.id] === 90, JSON.stringify(stats.totals));

    if (wantShots) await screenshots(project, processes);
  } finally {
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, "e2e-report.json"), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------------------- screenshots
async function screenshots(project: Project, processes: Process[]) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const shot = async (page: Page, name: string, full = false) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
    console.log(`  📸 docs/screenshots/${name}.png`);
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const first = processes[0];

    // demo ERP
    await page.goto(`${BASE}/demo-erp/#/?reset=1`);
    await shot(page, "demo-erp-dashboard");
    await page.goto(`${BASE}/demo-erp/#/customers?lang=da`);
    await shot(page, "demo-erp-danish");

    // studio
    await page.goto(`${BASE}/studio/`);
    await shot(page, "studio-projects");

    // portal
    await page.goto(`${BASE}/portal/${project.id}/`);
    await page.waitForSelector(".slp-card");
    await shot(page, "portal-home");
    await page.goto(`${BASE}/portal/${project.id}/#/p/${first.id}`);
    await page.waitForSelector(".slp-step");
    await shot(page, "portal-written-guide");
    for (const mode of ["show", "try", "test"]) {
      await page.goto(`${BASE}/portal/${project.id}/#/p/${first.id}/${mode}`);
      await page.waitForTimeout(mode === "show" ? 3500 : 1200);
      await shot(page, `player-${mode}`);
    }

    // in-app Assist on the live demo app
    const resolvedUrl = `${BASE}/api/processes/${first.id}/resolved?lang=en`;
    const start = new URL(first.startUrl);
    start.hash = `${start.hash}${start.hash.includes("?") ? "&" : "?"}sl_assist=${encodeURIComponent(resolvedUrl)}`;
    await page.goto(start.toString());
    await page.waitForTimeout(2500);
    await shot(page, "assist-in-app");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
