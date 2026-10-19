// Browser extension: toolbar badge with the number of guides recorded on the page, the popup's
// "Guides for this page" section, Guide me with the Assist bundled in the extension, and learner mode
// (no Record or Studio without a valid access key). Loads the built extension (dist/extension) in Chromium against a
// Steplight server on an ephemeral port; the application pages are served by route interception.
/// <reference path="../extension/lib/chrome.d.ts" />
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import express from "express";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Step, Target } from "../src/core/model.js";
import { createApp } from "../src/server/app.js";

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "dist/extension");
const DASH = "http://erp.test/?cmp=101a&mi=DefaultDashboard";

let server: Server;
let origin = "";
let keyServer: Server;
let keyOrigin = "";
const KEY = "author-key";
const libRequests: string[] = [];
let ctx: BrowserContext;
let sw: Worker;
let extId = "";
const lookups: string[] = [];

const save: Target = { selectors: [{ kind: "role", value: "button|Save" }], tag: "button", role: "button", name: "Save", bbox: { x: 10, y: 10, width: 80, height: 30 } };
const step = (id: string, url: string): Step => ({ id, action: "click", target: save, url, title: "Click **Save**." }) as Step;

const appPage = `<!doctype html><html><body><h1>ERP</h1><button>Save</button>
<script>window.go = function (mi) { history.pushState({}, "", "/?cmp=101a&mi=" + mi); };</script></body></html>`;

async function tabId(page: Page): Promise<number> {
  const url = page.url();
  return sw.evaluate(async (u) => ((await chrome.tabs.query({})) as { id: number; url?: string }[]).find((t) => t.url === u)!.id, url);
}

const badge = (id: number) => sw.evaluate((t) => chrome.action.getBadgeText({ tabId: t }), id);

describe("extension: guides for the page", () => {
  beforeAll(async () => {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/build-lib.mjs")], { cwd: ROOT, stdio: "ignore" });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-ext-"));
    const outer = express();
    outer.use((req, _res, next) => {
      if (req.path === "/api/lookup") lookups.push(String(req.query.url));
      if (req.path.startsWith("/lib/")) libRequests.push(req.path);
      next();
    });
    server = await new Promise<Server>((r) => {
      const s = outer.listen(0, () => r(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { app, ctx: c } = createApp({ dataDir: dir, baseUrl: origin });
    outer.use(app);
    const prj = c.store.createProject({ name: "D365" });
    c.store.createProcess(prj.id, { title: "Create a PR", chapter: "Procurement", startUrl: DASH, steps: [step("s1", DASH)] });
    c.store.createProcess(prj.id, { title: "Approve a PR", startUrl: "http://erp.test/?cmp=101a&mi=PurchReqTableListPage", steps: [step("s1", "http://erp.test/?cmp=101a&mi=PurchReqTableListPage")] });

    // a server with an access key, as deployed: without the key the extension is in learner mode
    const { app: keyApp } = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "sl-ext-key-")), baseUrl: "http://localhost", accessKey: KEY });
    keyServer = await new Promise<Server>((r) => {
      const s = keyApp.listen(0, () => r(s));
    });
    keyOrigin = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}`;

    ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sl-ext-profile-")), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await ctx.route(/^http:\/\/(erp|other)\.test\//, (route) => route.fulfill({ body: appPage, contentType: "text/html" }));
    sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    extId = new URL(sw.url()).host;
    await sw.evaluate((s) => chrome.storage.local.set({ serverUrl: s }), origin);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
    server?.close();
    keyServer?.close();
  });

  it("badges the icon with the number of guides recorded on the page, following in-page navigation", async () => {
    const page = await ctx.newPage();
    await page.goto(DASH);
    const id = await tabId(page);
    await expect.poll(() => badge(id), { timeout: 5000 }).toBe("1");
    expect(await sw.evaluate((t) => chrome.action.getTitle({ tabId: t }), id)).toBe("Steplight: 1 guide for this page");
    await page.evaluate(() => (window as unknown as { go(mi: string): void }).go("VendTableListPage"));
    await expect.poll(() => badge(id), { timeout: 5000 }).toBe("");
    await page.evaluate(() => (window as unknown as { go(mi: string): void }).go("PurchReqTableListPage"));
    await expect.poll(() => badge(id), { timeout: 5000 }).toBe("1");
    await page.close();
  }, 30_000);

  it("never sends pages of applications without guides to the server", async () => {
    const page = await ctx.newPage();
    await page.goto("http://other.test/secret-page");
    const id = await tabId(page);
    await page.waitForTimeout(1200);
    expect(await badge(id)).toBe("");
    expect(lookups.some((u) => u.includes("other.test"))).toBe(false);
    await page.close();
  }, 30_000);

  it("lists the page's guides at the top of the popup and starts Guide me from there", async () => {
    const app = await ctx.newPage();
    await app.goto(DASH);
    const id = await tabId(app);
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${id}`);
    await expect.poll(() => popup.locator("#guides-head").textContent(), { timeout: 5000 }).toBe("1 guide for this page");
    expect(await popup.locator("#guides .card h2").allTextContents()).toEqual(["Create a PR"]);
    const closed = popup.waitForEvent("close");
    await popup.click("#guides [data-guide]");
    await closed; // the popup closes so the guidance is visible
    await expect.poll(() => app.evaluate(() => !!document.querySelector("[data-steplight-assist]")), { timeout: 5000 }).toBe(true);
    // Assist comes from the extension package, not from the server (web store rule: no remote code)
    expect(libRequests).toEqual([]);
    await app.close();
  }, 30_000);

  it("shows no guides section on a page without guides", async () => {
    const app = await ctx.newPage();
    await app.goto("http://erp.test/?cmp=101a&mi=VendTableListPage");
    const id = await tabId(app);
    const popup = await ctx.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${id}`);
    await expect.poll(() => popup.locator("#status").textContent(), { timeout: 5000 }).toBe("Connected");
    await popup.waitForTimeout(500);
    expect(await popup.locator("#guides").isVisible()).toBe(false);
    // the recorder is in a collapsed "Record" section, which remembers being opened
    expect(await popup.locator("#record > summary").textContent()).toBe("Record");
    expect(await popup.locator("#start").isVisible()).toBe(false);
    await popup.click("#record > summary");
    await expect.poll(() => popup.locator("#start").isVisible()).toBe(true);
    await popup.reload();
    await expect.poll(() => popup.locator("#start").isVisible(), { timeout: 5000 }).toBe(true);
    await popup.click("#record > summary"); // leave it collapsed for the other tests
    await popup.close();
    await app.close();
  }, 30_000);

  it("shows learners only the guides: Record and Studio need a valid access key", async () => {
    const app = await ctx.newPage();
    await app.goto(DASH);
    const id = await tabId(app);
    const popup = await ctx.newPage();
    const open = async (accessKey: string) => {
      await sw.evaluate((o) => chrome.storage.local.set(o), { serverUrl: keyOrigin, accessKey, recordOpen: true });
      await popup.goto(`chrome-extension://${extId}/popup.html?tab=${id}`);
      await expect.poll(() => popup.locator("#status").textContent(), { timeout: 5000 }).toBe("Connected");
      await popup.waitForTimeout(500);
    };
    try {
      await open("");
      expect(await popup.locator("#record").isVisible()).toBe(false);
      expect(await popup.locator("#open-studio").isVisible()).toBe(false);
      expect(await popup.locator("#settings > summary").isVisible()).toBe(true);
      expect(await popup.locator("#settings-error").isVisible()).toBe(false);

      await open("wrong");
      expect(await popup.locator("#record").isVisible()).toBe(false);
      expect(await popup.locator("#settings-error").textContent()).toContain("access key is not right");
      expect(await popup.locator("#access-key").isVisible()).toBe(true); // Settings opened

      await open(KEY);
      await expect.poll(() => popup.locator("#start").isVisible(), { timeout: 5000 }).toBe(true);
      expect(await popup.locator("#open-studio").isVisible()).toBe(true);
      expect(await popup.locator("#settings-error").isVisible()).toBe(false);
    } finally {
      await sw.evaluate((s) => chrome.storage.local.set({ serverUrl: s, accessKey: "", recordOpen: false }), origin);
      await popup.close();
      await app.close();
    }
  }, 30_000);
});
