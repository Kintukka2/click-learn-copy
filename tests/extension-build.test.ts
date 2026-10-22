// "Record from the guide" in the browser extension: a process drafted from a written guide is
// recorded in the application step by step. Loads the built extension (dist/extension) in Chromium
// against a Steplight server; the application page is served by route interception.
/// <reference path="../extension/lib/chrome.d.ts" />
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    server?.close();
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

  it("offers Record from the guide in the popup and opens the process's start page", async () => {
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
});
