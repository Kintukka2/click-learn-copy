// "Finalise the guide" in the browser extension (from the popup or the Studio): a process drafted
// from a written guide is recorded in the application step by step. Loads the built extension
// (dist/extension) in Chromium against a Steplight server; the application page is served by route
// interception.
/// <reference path="../extension/lib/chrome.d.ts" />
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftTarget } from "../src/core/draft.js";
import { instructionForStep } from "../src/core/instructions.js";
import type { Step } from "../src/core/model.js";
import { createApp, type AppContext } from "../src/server/app.js";

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "dist/extension");
const APP = "http://erp.test/?cmp=101a&mi=CustPool";

// a tinted page: the white guide card would stand out in a screenshot
const appPage = `<!doctype html><html><body style="font:14px sans-serif;padding:20px;background:#dbe7f6">
<button id="modules">Modules</button>
<a id="away" href="/?cmp=101a&mi=LedgerJournalTransDaily">101A-000042</a>
<div id="pools" hidden>
  <h1>Customer pools</h1>
  <button id="new">+ New</button>
  <label>Pool ID <input id="pool"></label>
  <button id="group">Customer group</button>
  <button id="save">Save</button>
</div>
<script>document.getElementById("modules").onclick = () => (document.getElementById("pools").hidden = false);</script>
</body></html>`;

const draft = (id: string, action: Step["action"], kind: Parameters<typeof draftTarget>[0] | null, name: string, extra: Partial<Step> = {}): Step => ({
  id,
  action,
  target: kind ? draftTarget(kind, name) : undefined,
  url: APP,
  title: kind ? "" : name,
  titleEdited: !kind || undefined,
  screenshot: "guide.png",
  draft: { source: name },
  ...extra,
});

describe("extension: record from the guide", () => {
  let server: Server;
  let origin = "";
  let app: AppContext;
  let ctx: BrowserContext;
  let sw: Worker;
  let procId = "";
  let projectId = "";
  let otherId = "";
  // a tab the extension opens loads before Playwright can intercept it: a real server for the application
  let erp: http.Server;
  let erpBase = "";

  beforeAll(async () => {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/build-lib.mjs")], { cwd: ROOT, stdio: "ignore" });
    const r = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "sl-extbuild-")), baseUrl: "http://localhost" });
    app = r.ctx;
    server = await new Promise<Server>((res) => {
      const s = r.app.listen(0, () => res(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const prj = app.store.createProject({ name: "D365" });
    const steps = [
      draft("d1", "click", "button", "New"),
      draft("d2", "type", "field", "Pool ID", { value: "WHOLESALE", description: "Up to 10 characters." }),
      draft("d3", "note", null, "Check the pool before you save."),
      draft("d4", "click", null, "Fill in the remaining details."),
      draft("d5", "click", "button", "Save"),
    ];
    for (const s of steps) if (!s.titleEdited) s.title = instructionForStep(s);
    procId = app.store.createProcess(prj.id, { title: "Create a customer pool", startUrl: APP, steps })!.id;
    projectId = prj.id;
    otherId = app.store.createProcess(prj.id, { title: "Delete a customer pool", startUrl: APP, steps: [draft("e1", "click", "button", "Modules"), draft("e2", "click", "button", "Save")].map((st) => ({ ...st, title: instructionForStep(st) })) })!.id;

    ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sl-extbuild-profile-")), {
      channel: "chromium",
      headless: true,
      viewport: { width: 1000, height: 700 },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await ctx.route(/^http:\/\/(erp|other)\.test\//, (route) => route.fulfill({ body: appPage, contentType: "text/html" }));
    sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    await sw.evaluate((s) => chrome.storage.local.set({ serverUrl: s }), origin);
    erp = http.createServer((_req, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(appPage));
    await new Promise<void>((r) => erp.listen(0, "127.0.0.1", r));
    erpBase = `http://127.0.0.1:${(erp.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    server?.close();
    erp?.close();
  });

  const card = (page: Page, sel: string) => page.evaluate((s) => document.querySelector("[data-steplight-assist]")?.shadowRoot?.querySelector(s)?.textContent?.trim() ?? null, sel);
  const cardButton = (page: Page, label: string) =>
    page.evaluate((l) => {
      const b = [...(document.querySelector("[data-steplight-assist]")?.shadowRoot?.querySelectorAll("button") ?? [])].find((x) => x.textContent?.trim() === l);
      b?.click();
      return !!b;
    }, label);
  const steps = () => app.store.getProcess(procId)!.steps;

  it("shows each draft step on the page and records what the author does", async () => {
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => ((await chrome.tabs.query({})) as { id: number; url?: string }[]).find((t) => t.url === u)!.id, APP);
    await sw.evaluate(({ s, p, t }) => (self as unknown as { steplight: { startRecording(o: unknown): Promise<unknown> } }).steplight.startRecording({ serverUrl: s, processId: p, tabId: t, build: true }), { s: origin, p: procId, t: tabId });

    await expect.poll(() => card(page, ".title"), { timeout: 5000 }).toBe("Click New.");
    expect(await card(page, ".count")).toBe("Step 1 of 5");
    expect(await page.textContent("#steplight-recording-indicator")).toContain("Recording from the guide");

    // the guide skips opening the menu: recorded as an extra step, the card says so
    await page.click("#modules");
    await expect.poll(() => card(page, ".note"), { timeout: 5000 }).toBe("Recorded an extra step: Click Modules.");
    // the highlighted element ("+ New" for the guide's "New"): the step is recorded and the card moves on
    await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-steplight-assist]")?.shadowRoot?.querySelector(".ring.on")), { timeout: 5000 }).toBe(true);
    await page.click("#new");
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 2 of 5");
    await page.fill("#pool", "WHOLESALE");
    await page.press("#pool", "Tab");
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 3 of 5");
    // a note: Next records it with a screenshot of the page
    expect(await card(page, ".title")).toBe("Check the pool before you save.");
    expect(await cardButton(page, "Next")).toBe(true);
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 4 of 5");
    // no element in the guide: the author does it, then says that was it
    await page.click("#group");
    await expect.poll(() => cardButton(page, "That was it"), { timeout: 5000 }).toBe(true);
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 5 of 5");
    await page.click("#save");
    await expect.poll(() => card(page, ".title"), { timeout: 5000 }).toBe("All the guide’s steps are recorded.");
    // the recording ends with the guide
    await expect.poll(() => sw.evaluate(() => (self as unknown as { steplight: { getState(): unknown } }).steplight.getState()), { timeout: 5000 }).toBeNull();
    expect(await page.$("#steplight-recording-indicator")).toBeNull();

    const s = steps();
    expect(s.map((x) => [x.id.startsWith("d") ? x.id : "extra", x.title])).toEqual([
      ["extra", "Click **Modules**."],
      ["d1", "Click **+ New**."],
      ["d2", "In the **Pool ID** field, enter **WHOLESALE**."],
      ["d3", "Check the pool before you save."],
      ["d4", "Click **Customer group**."],
      ["d5", "Click **Save**."],
    ]);
    expect(s.some((x) => x.draft)).toBe(false);
    expect(s[2].description).toBe("Up to 10 characters.");
    // every step has a screenshot of the application, taken with the guide card hidden: only the
    // page's small controls are white, the card alone would be tens of thousands of white pixels
    const pid = app.store.getProcess(procId)!.projectId;
    for (const x of s) {
      expect(x.screenshot, x.id).toBeTruthy();
      expect(x.screenshot).not.toBe("guide.png");
      const img = PNG.sync.read(fs.readFileSync(app.store.mediaPath(pid, x.screenshot!)));
      let white = 0;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 250 && img.data[i + 1] > 250 && img.data[i + 2] > 250) white++;
      expect(white, `white pixels in the screenshot of ${x.id}`).toBeLessThan(8000);
    }
    expect(s[1].target?.bbox).toBeTruthy();
    await page.close();
  }, 60_000);

  it("offers Finalise the guide in the popup and opens the process's start page", async () => {
    const page = await ctx.newPage();
    await page.goto("http://other.test/somewhere");
    const extId = new URL(sw.url()).host;
    const tabId = await sw.evaluate(async () => ((await chrome.tabs.query({})) as { id: number; url?: string }[]).find((t) => t.url?.startsWith("http://other.test/"))!.id);
    await sw.evaluate((o) => chrome.storage.local.set(o), { lastProject: projectId, lastProcess: otherId, recordOpen: true });
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
    await expect.poll(() => popup.locator("#build-wrap").isVisible(), { timeout: 5000 }).toBe(true);
    expect(await popup.textContent("#build-hint")).toContain("2 steps from an imported guide aren't recorded yet");
    expect(await popup.getAttribute("#start", "class")).toBe("btn"); // recording from the guide comes first
    const closed = popup.waitForEvent("close");
    await popup.click("#build");
    await closed; // the steps are shown on the page
    await expect.poll(() => page.url(), { timeout: 10_000 }).toBe(APP);
    await expect.poll(() => card(page, ".title"), { timeout: 10_000 }).toBe("Click Modules.");
    await sw.evaluate(() => (self as unknown as { steplight: { stopRecording(): Promise<unknown> } }).steplight.stopRecording());
    await expect.poll(() => page.$("[data-steplight-assist]"), { timeout: 5000 }).toBeNull();
    await page.close();
  }, 60_000);

  const recState = () => sw.evaluate(() => (self as unknown as { steplight: { getState(): { processId: string; tabId: number } | null } }).steplight.getState());

  it("finalises the guide from the Studio: the application opens in a new tab and each step records its screen and element", async () => {
    const erpUrl = `${erpBase}/?cmp=101a&mi=CustPool`;
    const steps = [draft("f1", "click", "button", "Modules"), draft("f2", "click", "button", "Save")].map((st) => ({ ...st, url: erpUrl, screenshot: undefined, title: instructionForStep(st) }));
    const pid = app.store.createProcess(projectId, { title: "Close a customer pool", startUrl: erpUrl, steps })!.id;
    const studio = await ctx.newPage();
    await studio.goto(`${origin}/studio/processes/${pid}`);
    await studio.waitForSelector("[data-testid=finalise]");
    expect(await studio.textContent(".stage-empty")).toContain("Screenshot to come");
    const opened = ctx.waitForEvent("page");
    await studio.click("[data-testid=finalise]");
    const page = await opened;
    await expect.poll(() => page.url(), { timeout: 10_000 }).toBe(erpUrl);
    await expect.poll(() => card(page, ".title"), { timeout: 10_000 }).toBe("Click Modules.");
    expect(await page.textContent("#steplight-recording-indicator")).toContain("Recording from the guide");
    expect((await recState())?.processId).toBe(pid);
    await expect.poll(() => studio.textContent(".toaster"), { timeout: 5000 }).toContain("Finalising in the new tab");
    expect(await studio.isDisabled("[data-testid=finalise]")).toBe(false);

    await page.bringToFront();
    await page.click("#modules");
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 2 of 2");
    const first = app.store.getProcess(pid)!.steps[0];
    expect(first.id).toBe("f1");
    expect(first.draft).toBeUndefined();
    expect(first.screenshot).toBeTruthy();
    expect(first.target?.bbox).toBeTruthy();
    await sw.evaluate(() => (self as unknown as { steplight: { stopRecording(): Promise<unknown> } }).steplight.stopRecording());
    await page.close();
    await studio.close();
  }, 60_000);

  /** Starts recording process `pid` from its guide in the page's tab. */
  async function buildIn(page: Page, pid: string) {
    const tabId = await sw.evaluate(async (u) => Math.max(...((await chrome.tabs.query({})) as { id: number; url?: string }[]).filter((t) => t.url === u).map((t) => t.id)), page.url());
    await sw.evaluate(({ s, p, t }) => (self as unknown as { steplight: { startRecording(o: unknown): Promise<unknown> } }).steplight.startRecording({ serverUrl: s, processId: p, tabId: t, build: true }), { s: origin, p: pid, t: tabId });
  }
  const stopRec = () => sw.evaluate(() => (self as unknown as { steplight: { stopRecording(): Promise<unknown> } }).steplight.stopRecording());
  const pill = (page: Page) => page.textContent("#steplight-recording-indicator");
  const togglePause = (page: Page) => page.click("#steplight-recording-indicator [data-pause]");
  const drafted = (pid: string, ...steps: Step[]) => app.store.createProcess(projectId, { title: `Process ${pid}`, startUrl: APP, steps: steps.map((st) => ({ ...st, title: st.title || instructionForStep(st) })) })!.id;

  it("pauses: nothing is recorded while the author goes somewhere, until Resume", async () => {
    const pid = drafted("pause", draft("p1", "click", "button", "Modules"), draft("p2", "click", "button", "Save"));
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.bringToFront();
    await buildIn(page, pid);
    await expect.poll(() => card(page, ".title"), { timeout: 5000 }).toBe("Click Modules.");
    await togglePause(page);
    await expect.poll(() => pill(page), { timeout: 5000 }).toContain("Paused");
    expect(await card(page, ".note")).toContain("Paused: nothing is recorded");
    // even the step's own element: the card stays on it
    await page.click("#modules");
    await page.click("#save");
    await page.waitForTimeout(800);
    expect(app.store.getProcess(pid)!.steps.map((s) => [s.id, !!s.draft])).toEqual([
      ["p1", true],
      ["p2", true],
    ]);
    expect(await card(page, ".count")).toBe("Step 1 of 2");
    await togglePause(page);
    await expect.poll(() => card(page, ".note"), { timeout: 5000 }).toBeNull();
    expect(await pill(page)).toContain("Recording from the guide");
    await page.click("#modules");
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 2 of 2");
    expect(app.store.getProcess(pid)!.steps[0]).toMatchObject({ id: "p1", title: "Click **Modules**." });
    expect(app.store.getProcess(pid)!.steps[0].draft).toBeUndefined();
    await stopRec();
    await page.close();
  }, 60_000);

  it("keeps “That was it” when the author's action opened another page", async () => {
    const pid = drafted("away", draft("j1", "click", "link", "Journal batch number"), draft("j2", "click", "button", "Save"));
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.bringToFront();
    await buildIn(page, pid);
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 1 of 2");
    // the guide's element isn't on the page: the author clicks the link they mean, which opens another
    // page, slow to load (the server places the step before that page asks where the guide is)
    const slow = /mi=LedgerJournalTransDaily/;
    await ctx.route(slow, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ body: appPage, contentType: "text/html" });
    });
    await page.click("#away");
    await expect.poll(() => page.url(), { timeout: 5000 }).toContain("mi=LedgerJournalTransDaily");
    // the new page shows the extra step, with "That was it"
    await expect.poll(() => card(page, ".note"), { timeout: 8000 }).toBe("Recorded an extra step: Click the 101A-000042 link.");
    await ctx.unroute(slow);
    expect(await cardButton(page, "That was it")).toBe(true);
    await expect.poll(() => card(page, ".count"), { timeout: 5000 }).toBe("Step 2 of 2");
    const s = app.store.getProcess(pid)!.steps;
    expect(s.map((x) => x.id)).toEqual(["j1", "j2"]);
    expect(s[0]).toMatchObject({ target: { name: "101A-000042" } });
    expect(s[0].draft).toBeUndefined();
    await stopRec();
    await page.close();
  }, 60_000);

  it("finalising again goes on from where it stopped, paused until the author resumes", async () => {
    const erpUrl = `${erpBase}/?cmp=101a&mi=CustPool`;
    const done: Step = { id: "r1", action: "click", target: draftTarget("button", "Modules"), url: erpUrl, title: "Click **Modules**." };
    const pid = app.store.createProcess(projectId, { title: "Go on", startUrl: erpUrl, steps: [done, { ...draft("r2", "click", "button", "Save"), url: erpUrl, title: "Click **Save**." }] })!.id;
    // the last session stopped on another page of the application
    const last = `${erpBase}/journal?cmp=101a&mi=LedgerJournalTable3`;
    const before = await ctx.newPage();
    await before.goto(last);
    await buildIn(before, pid);
    await expect.poll(() => card(before, ".title"), { timeout: 5000 }).toBe("Click Save.");
    await stopRec();
    await before.close();

    const studio = await ctx.newPage();
    await studio.goto(`${origin}/studio/processes/${pid}`);
    const opened = ctx.waitForEvent("page");
    await studio.click("[data-testid=finalise]");
    const page = await opened;
    await expect.poll(() => page.url(), { timeout: 10_000 }).toBe(last);
    await expect.poll(() => pill(page), { timeout: 10_000 }).toContain("Paused");
    await expect.poll(() => card(page, ".note"), { timeout: 5000 }).toContain("Paused");
    await page.bringToFront();
    await page.click("#modules"); // getting to the step: not recorded
    await page.waitForTimeout(500);
    expect(app.store.getProcess(pid)!.steps).toHaveLength(2);
    await togglePause(page);
    await expect.poll(() => card(page, ".note"), { timeout: 5000 }).toBeNull();
    await page.click("#save");
    await expect.poll(() => card(page, ".title"), { timeout: 5000 }).toBe("All the guide’s steps are recorded.");
    expect(app.store.getProcess(pid)!.steps.map((x) => [x.id, !!x.draft])).toEqual([
      ["r1", false],
      ["r2", false],
    ]);
    await expect.poll(() => recState(), { timeout: 5000 }).toBeNull();
    await page.close();
    await studio.close();
  }, 60_000);

  it("adds a note step from the pill's Note, and Stop opens the process in the Studio", async () => {
    const pid = app.store.createProcess(projectId, { title: "Pill note", startUrl: APP, steps: [] })!.id;
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.bringToFront();
    const tabId = await sw.evaluate(async (u) => Math.max(...((await chrome.tabs.query({})) as { id: number; url?: string }[]).filter((t) => t.url === u).map((t) => t.id)), page.url());
    await sw.evaluate(({ s, p, t }) => (self as unknown as { steplight: { startRecording(o: unknown): Promise<unknown> } }).steplight.startRecording({ serverUrl: s, processId: p, tabId: t }), { s: origin, p: pid, t: tabId });
    await page.waitForSelector("#steplight-recording-indicator [data-note]");
    await page.click("#modules");
    await page.click("#steplight-recording-indicator [data-note]");
    await expect.poll(() => app.store.getProcess(pid)!.steps.map((s) => s.action), { timeout: 5000 }).toEqual(["click", "note"]);
    const note = app.store.getProcess(pid)!.steps[1];
    expect(note.title).toBe("Note");
    expect(note.screenshot).toBeTruthy();
    expect(note.target).toBeUndefined();
    // paused: no Note
    await page.click("#steplight-recording-indicator [data-pause]");
    await expect.poll(() => page.$("#steplight-recording-indicator [data-note]"), { timeout: 5000 }).toBeNull();
    await page.click("#steplight-recording-indicator [data-pause]");
    await page.waitForSelector("#steplight-recording-indicator [data-note]");
    const opened = ctx.waitForEvent("page");
    await page.click("#steplight-recording-indicator [data-stop]");
    const studio = await opened;
    await expect.poll(() => studio.url(), { timeout: 10_000 }).toBe(`${origin}/studio/processes/${pid}`);
    expect(await recState()).toBeNull();
    await studio.close();
    await page.close();
  }, 30_000);

  it("answers only Studio pages of the server it is connected to", async () => {
    const ask = (page: Page) =>
      page.evaluate(
        (pid) =>
          new Promise((resolve) => {
            addEventListener("message", (e) => {
              if (e.data?.source === "steplight-extension") resolve(e.data);
            });
            postMessage({ source: "steplight-studio", id: "a", type: "ping" }, location.origin);
            postMessage({ source: "steplight-studio", id: "b", type: "finalise", processId: pid }, location.origin);
            setTimeout(() => resolve(null), 1500);
          }),
        otherId,
      );
    const other = await ctx.newPage();
    await other.goto("http://other.test/somewhere");
    expect(await ask(other)).toBeNull();
    expect(await recState()).toBeNull();
    await other.close();
    // the Studio learns which extension it talks to
    const studio = await ctx.newPage();
    await studio.goto(`${origin}/studio/`);
    const pong = await studio.evaluate(
      () =>
        new Promise((resolve) => {
          addEventListener("message", (e) => {
            if (e.data?.source === "steplight-extension") resolve(e.data);
          });
          postMessage({ source: "steplight-studio", id: "a", type: "ping" }, location.origin);
        }),
    );
    expect(pong).toEqual({ source: "steplight-extension", id: "a", extension: JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8")).version });
    await studio.close();
  }, 30_000);
});
