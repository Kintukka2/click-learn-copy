// End to end: start the server on :4201, record every demo scenario headlessly against the Northwind
// ERP demo app, then Replay: update (all ok), test against layout v2 (healed but passing) and a
// localized replay in Danish that yields Danish UI names and instructions without translation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Process, Project, ReplayReport } from "../src/core/model.js";
import { resolveProcess } from "../src/core/resolve.js";
import { DEMO_SCENARIOS } from "../src/recorder/scenarios.js";
import { createApp } from "../src/server/app.js";

const PORT = 4201;
const BASE = `http://localhost:${PORT}`;
let server: Server;
let dataDir: string;
let project: Project;
const recorded: Record<string, Process> = {};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + "/api" + url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "steplight-replay-test-"));
  const { app } = createApp({ dataDir, baseUrl: BASE });
  await new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => resolve());
    server.on("error", reject);
  });
  project = await call<Project>("POST", "/projects", { name: "Replay test", languages: ["en", "da", "de"] });
});

afterAll(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("scripted demo recordings", () => {
  it("has at least 4 scenarios that start from clean demo data", () => {
    expect(DEMO_SCENARIOS.length).toBeGreaterThanOrEqual(4);
    for (const sc of DEMO_SCENARIOS) {
      expect(sc.startPath).toMatch(/^\/demo-erp\/#\/.+reset=1/);
      expect(sc.title).toBeTruthy();
      expect(sc.chapter).toBeTruthy();
    }
  });

  it.each(DEMO_SCENARIOS.map((s) => [s.id, s] as const))("records %s with exactly one step per action", async (_id, sc) => {
    const proc0 = await call<Process>("POST", `/projects/${project.id}/processes`, { title: sc.title, chapter: sc.chapter, appName: "Northwind ERP" });
    const proc = await call<Process>("POST", `/processes/${proc0.id}/demo-record`, { scenarioId: sc.id });
    recorded[sc.id] = proc;
    expect(proc.steps).toHaveLength(sc.actions.length);
    proc.steps.forEach((s, i) => {
      expect(s.action).toBe(sc.actions[i].action);
      expect(s.title).toMatch(/\*\*.+\*\*/);
      expect(s.title).not.toMatch(/highlighted element/);
      expect(s.screenshot).toMatch(/\.png$/);
      expect(fs.existsSync(path.join(dataDir, "projects", project.id, "media", s.screenshot!)) || fs.readdirSync(dataDir, { recursive: true }).some((f) => String(f).endsWith(s.screenshot!))).toBe(true);
      expect(s.viewport).toEqual({ width: 1280, height: 800 });
      const b = s.target!.bbox;
      expect(b.width).toBeGreaterThan(0);
      expect(b.x + b.width).toBeLessThanOrEqual(1280);
      expect(b.y + b.height).toBeLessThanOrEqual(800);
      expect(s.target!.selectors.length).toBeGreaterThan(0);
    });
    // no consecutive duplicates (noise)
    for (let i = 1; i < proc.steps.length; i++) expect(proc.steps[i].title === proc.steps[i - 1].title && proc.steps[i].action !== "click").toBe(false);
    expect(proc.startUrl).toBe(BASE + sc.startPath);
  });

  it("produces readable instructions", () => {
    const titles = recorded["create-customer"].steps.map((s) => s.title);
    expect(titles).toEqual([
      "Click **New**.",
      "In the **Name** field, enter **Fjord Kontormøbler ApS**.",
      "In the **Address** field, enter **Strandvejen 60**.",
      "In the **Post Code** field, enter **2900**.",
      "In the **City** field, enter **Hellerup**.",
      "In **Country/Region**, select **Denmark**.",
      "In the **E-mail** field, enter **indkob@fjordkontor.dk**.",
      "In the **Credit Limit (LCY)** field, enter **75000**.",
      "Select the **Tax Liable** check box.",
      "Click **Save**.",
    ]);
    const so = recorded["create-sales-order"].steps;
    expect(so[1]).toMatchObject({ action: "select", value: "Odense Designhus A/S", optionValue: "C00030" });
    expect(so.at(-1)!.title).toBe("Click **Yes**.");
    expect(recorded["approve-purchase-invoice"].steps[1].title).toBe("Click the **PI-1004** link.");
  });
});

describe("replay", () => {
  it("update mode: every step is found by its first selector and gets a fresh screenshot", async () => {
    for (const sc of DEMO_SCENARIOS) {
      const before = await call<Process>("GET", `/processes/${recorded[sc.id].id}`);
      const { report, process } = await call<{ report: ReplayReport; process: Process }>("POST", `/processes/${before.id}/replay`, { mode: "update" });
      expect(report.passed, sc.id).toBe(true);
      expect(report.mode).toBe("update");
      expect(report.results.map((r) => r.status), sc.id).toEqual(before.steps.map(() => "ok"));
      for (const r of report.results) expect(r.durationMs).toBeGreaterThan(0);
      process.steps.forEach((s, i) => {
        expect(s.replayStatus).toBe("ok");
        expect(s.screenshot).not.toBe(before.steps[i].screenshot);
        expect(s.title).toBe(before.steps[i].title);
      });
      expect(process.lastReplay?.passed).toBe(true);
    }
  });

  it("test mode against layout v2: renamed ids and moved buttons are healed, the test still passes", async () => {
    let healedTotal = 0;
    for (const id of ["create-customer", "create-sales-order", "add-item", "approve-purchase-invoice"]) {
      const proc = await call<Process>("GET", `/processes/${recorded[id].id}`);
      await call("PATCH", `/processes/${proc.id}`, { startUrl: proc.startUrl + "&v=2" });
      const { report, process } = await call<{ report: ReplayReport; process: Process }>("POST", `/processes/${proc.id}/replay`, { mode: "test" });
      await call("PATCH", `/processes/${proc.id}`, { startUrl: proc.startUrl });
      expect(report.passed, id).toBe(true);
      expect(report.results.some((r) => r.status === "failed"), id).toBe(false);
      const healed = report.results.filter((r) => r.status === "healed");
      healedTotal += healed.length;
      for (const h of healed) expect(h.matchedIndex).toBeGreaterThan(0);
      // test mode writes nothing
      expect(process.steps.map((s) => s.screenshot)).toEqual(proc.steps.map((s) => s.screenshot));
    }
    expect(healedTotal).toBeGreaterThanOrEqual(4);
    const cust = await call<Process>("GET", `/processes/${recorded["create-customer"].id}`);
    const report = cust.lastReplay!;
    const byTitle = Object.fromEntries(cust.steps.map((s, i) => [s.title, report.results[i].status]));
    expect(byTitle["Click **Save**."]).toBe("healed");
    expect(byTitle["In the **E-mail** field, enter **indkob@fjordkontor.dk**."]).toBe("healed");
    expect(byTitle["In the **Name** field, enter **Fjord Kontormøbler ApS**."]).toBe("ok");
  });

  it("localized replay (da) writes localizations.da with Danish UI names; instructions resolve in Danish", async () => {
    const before = await call<Process>("GET", `/processes/${recorded["create-customer"].id}`);
    const { report, process } = await call<{ report: ReplayReport; process: Process }>("POST", `/processes/${before.id}/replay`, { mode: "update", lang: "da" });
    expect(report.lang).toBe("da");
    expect(report.passed).toBe(true);
    const loc = process.localizations.da;
    expect(loc).toBeTruthy();
    const save = process.steps.at(-1)!;
    expect(loc.steps[save.id]).toMatchObject({ name: "Gem" });
    expect(loc.steps[save.id].screenshot).toMatch(/\.png$/);
    expect(loc.steps[save.id].screenshot).not.toBe(save.screenshot);
    const country = process.steps.find((s) => s.action === "select")!;
    expect(loc.steps[country.id]).toMatchObject({ label: "Land/område", value: "Danmark" });
    // base steps untouched
    expect(process.steps.map((s) => [s.screenshot, s.title])).toEqual(before.steps.map((s) => [s.screenshot, s.title]));

    const da = resolveProcess(process, "da");
    expect(da.steps.map((s) => s.title)).toEqual([
      "Klik på **Ny**.",
      "Indtast **Fjord Kontormøbler ApS** i feltet **Navn**.",
      "Indtast **Strandvejen 60** i feltet **Adresse**.",
      "Indtast **2900** i feltet **Postnr.**.",
      "Indtast **Hellerup** i feltet **By**.",
      "Vælg **Danmark** i **Land/område**.",
      "Indtast **indkob@fjordkontor.dk** i feltet **E-mail**.",
      "Indtast **75000** i feltet **Kreditmaksimum (RV)**.",
      "Markér afkrydsningsfeltet **Momspligtig**.",
      "Klik på **Gem**.",
    ]);
    expect(da.steps[9].screenshot).toBe(loc.steps[save.id].screenshot);
  });

  it("localized replay (de) of the sales order uses German names (Buchen, Ja)", async () => {
    const before = await call<Process>("GET", `/processes/${recorded["create-sales-order"].id}`);
    const { report, process } = await call<{ report: ReplayReport; process: Process }>("POST", `/processes/${before.id}/replay`, { mode: "update", lang: "de" });
    expect(report.passed).toBe(true);
    const de = resolveProcess(process, "de");
    expect(de.steps.at(-2)!.title).toBe("Klicken Sie auf **Buchen**.");
    expect(de.steps.at(-1)!.title).toBe("Klicken Sie auf **Ja**.");
    expect(de.steps[1].title).toBe("Wählen Sie unter **Debitorenname** **Odense Designhus A/S** aus.");
  });

  it("a step whose element is gone fails and the test does not pass", async () => {
    const proc = await call<Process>("GET", `/processes/${recorded["add-item"].id}`);
    const steps = structuredClone(proc.steps);
    steps[1].target!.selectors = [{ kind: "id", value: "does-not-exist" }];
    steps[1].target!.role = undefined;
    await call("PUT", `/processes/${proc.id}/steps`, { steps });
    const { report } = await call<{ report: ReplayReport }>("POST", `/processes/${proc.id}/replay`, { mode: "test" });
    expect(report.passed).toBe(false);
    expect(report.results[1].status).toBe("failed");
    expect(report.results[0].status).toBe("ok");
    await call("PUT", `/processes/${proc.id}/steps`, { steps: proc.steps });
  });
});
