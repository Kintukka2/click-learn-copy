// Studio process editor in Chromium against a real server: undo/redo, the collapsible menu, toggles
// in a scrolled inspector not scrolling the editor away, Record again and replacing a screenshot.
// Needs the built Studio (npm run build).
import fs from "node:fs";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Step, Target } from "../src/core/model.js";
import { createApp, type AppContext } from "../src/server/app.js";

const STUDIO = path.resolve(__dirname, "../dist/studio/index.html");
const bbox = { x: 40, y: 40, width: 160, height: 30 };
const field = (label: string): Target => ({ selectors: [{ kind: "label", value: label }], tag: "input", role: "textbox", name: label, label, bbox, context: "Report parameters" });
const button = (name: string): Target => ({ selectors: [{ kind: "role", value: `button|${name}` }], tag: "button", role: "button", name, bbox });
const steps = (): Step[] => [
  { id: "s1", action: "click", target: button("Reports"), url: "http://erp.test/", title: "Click **Reports**." },
  { id: "s2", action: "type", value: "1/9/2026", target: field("From date"), url: "http://erp.test/", title: "In the **From date** field, enter **1/9/2026**." },
  { id: "s3", action: "click", target: button("OK"), url: "http://erp.test/", title: "Click **OK**." },
];

describe.skipIf(!fs.existsSync(STUDIO))("Studio process editor", () => {
  let server: Server;
  let origin = "";
  let ctx: AppContext;
  let browser: Browser;
  let procId = "";

  beforeAll(async () => {
    const r = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "sl-studio-")), baseUrl: "http://localhost" });
    ctx = r.ctx;
    server = await new Promise<Server>((res) => {
      const s = r.app.listen(0, () => res(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  async function open(): Promise<Page> {
    const prj = ctx.store.createProject({ name: "D365" });
    procId = ctx.store.createProcess(prj.id, { title: "Run a report", startUrl: "http://erp.test/", steps: steps() })!.id;
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    await page.goto(`${origin}/studio/processes/${procId}`);
    await page.waitForSelector("[data-step-id=s1]");
    return page;
  }
  const serverSteps = () => ctx.store.getProcess(procId)!.steps.map((s) => s.id);

  it("keeps the editor in place when a toggle low in a scrolled inspector is clicked", async () => {
    const page = await open();
    await page.click("[data-step-id=s2]");
    await page.locator(".learner-choice .toggle").scrollIntoViewIfNeeded();
    await page.click(".learner-choice .toggle");
    await expect.poll(() => ctx.store.getProcess(procId)!.steps[1].learnerChooses).toBe(true);
    await page.waitForTimeout(300);
    // the editor (header, toolbar, step list) must not be scrolled up out of the window
    expect(await page.evaluate(() => document.querySelector(".main")!.scrollTop)).toBe(0);
    expect(await page.evaluate(() => document.querySelector(".editor")!.getBoundingClientRect().top)).toBe(0);
    await page.close();
  }, 30_000);

  it("undoes and redoes a deleted step, from the toolbar and with Ctrl+Z", async () => {
    const page = await open();
    expect(await page.isDisabled("[data-testid=undo]")).toBe(true);
    await page.click("[data-step-id=s2]");
    await page.click(".pane-inspector [aria-label='Delete step']");
    await page.click(".overlay button:has-text('Delete step')");
    await expect.poll(serverSteps).toEqual(["s1", "s3"]);

    await page.click("[data-testid=undo]");
    await expect.poll(serverSteps).toEqual(["s1", "s2", "s3"]);
    await expect.poll(() => page.locator("[data-step-id=s2]").count()).toBe(1);
    expect(await page.getAttribute("[data-step-id=s2]", "aria-selected")).toBe("true"); // the restored step is selected

    await page.click("[data-testid=redo]");
    await expect.poll(serverSteps).toEqual(["s1", "s3"]);
    await page.keyboard.press("Control+z");
    await expect.poll(serverSteps).toEqual(["s1", "s2", "s3"]);
    await page.close();
  }, 30_000);

  it("deletes the selected step with the Delete key (Enter confirms)", async () => {
    const page = await open();
    await page.click("[data-step-id=s3]");
    await page.keyboard.press("Delete");
    await page.waitForSelector(".overlay button:has-text('Delete step')");
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe("Delete step"); // focused when the dialog opens
    await page.keyboard.press("Enter");
    await expect.poll(serverSteps).toEqual(["s1", "s2"]);
    // typing in a field never deletes a step
    await page.click("[data-step-id=s2]");
    await page.locator(".pane-inspector textarea").first().press("Delete");
    await page.waitForTimeout(300);
    expect(await page.locator(".overlay").count()).toBe(0);
    expect(serverSteps()).toEqual(["s1", "s2"]);
    await page.close();
  }, 30_000);

  it("records a step again, and replaces its screenshot with an image file or a pasted one", async () => {
    const png = (width: number, height: number) => {
      const im = new PNG({ width, height });
      im.data.fill(180);
      return PNG.sync.write(im);
    };
    const prj = ctx.store.createProject({ name: "D365" });
    const shot = ctx.store.saveMedia(prj.id, png(1000, 500));
    const first: Step = { ...steps()[0], screenshot: shot, viewport: { width: 1000, height: 500 }, target: { ...button("Reports"), bbox: { x: 100, y: 50, width: 200, height: 40 } } };
    procId = ctx.store.createProcess(prj.id, { title: "Run a report", startUrl: "http://erp.test/", steps: [first, ...steps().slice(1)] })!.id;
    const step1 = () => ctx.store.getProcess(procId)!.steps[0];
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    await page.goto(`${origin}/studio/processes/${procId}`);
    await page.waitForSelector("[data-step-id=s1]");

    // Record again, from the step's menu: finalising the guide records its screen and element again
    await page.click("[data-step-id=s1] [aria-label='Step actions']");
    await page.click("[role=menuitem]:has-text('Record again')");
    await expect.poll(() => step1().draft).toEqual({ source: "Click Reports.", again: true });
    await expect.poll(() => page.textContent("[data-testid=draft-banner]")).toContain("1 step to record again");
    expect(await page.textContent("[data-testid=draft-banner]")).toContain("Finalise the guide");
    expect(await page.locator("[data-testid=record-again-panel]").count()).toBe(1);
    expect(step1().screenshot).toBe(shot); // kept until it is recorded again
    await page.click("[data-testid=keep-recording]");
    await expect.poll(() => step1().draft).toBeUndefined();
    await expect.poll(() => page.locator("[data-testid=draft-banner]").count()).toBe(0);
    // the inspector's button, and undo
    await page.click("[data-testid=record-again]");
    await expect.poll(() => !!step1().draft?.again).toBe(true);
    await page.keyboard.press("Control+z");
    await expect.poll(() => step1().draft).toBeUndefined();

    // an image of the same shape: the highlight is scaled with it
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sl-shot-")), "snip.png");
    fs.writeFileSync(file, png(2000, 1000));
    await page.setInputFiles("[data-testid=replace-shot-file]", file);
    await expect.poll(() => step1().viewport).toEqual({ width: 2000, height: 1000 });
    expect(step1().screenshot).not.toBe(shot);
    expect(step1().target!.bbox).toEqual({ x: 200, y: 100, width: 400, height: 80 });
    // a pasted image of another shape: the highlight is placed again
    const pasted = png(600, 600).toString("base64");
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, pasted);
    await expect.poll(() => step1().viewport).toEqual({ width: 600, height: 600 });
    expect(step1().target!.bbox).toBeUndefined();
    await expect.poll(() => page.locator("[data-testid=add-highlight]").count()).toBe(1);
    // undo brings the earlier screenshot back
    await page.keyboard.press("Control+z");
    await expect.poll(() => step1().viewport).toEqual({ width: 2000, height: 1000 });
    expect(step1().target!.bbox).toEqual({ x: 200, y: 100, width: 400, height: 80 });
    await page.close();
  }, 60_000);

  it("undoes an instruction edit", async () => {
    const page = await open();
    await page.click("[data-step-id=s3]");
    const title = page.locator(".pane-inspector textarea").first();
    await title.fill("Click **OK** to run it.");
    await page.click(".pane-inspector h3 >> nth=0"); // blur commits
    await expect.poll(() => ctx.store.getProcess(procId)!.steps[2].title).toBe("Click **OK** to run it.");
    await page.click("[data-testid=undo]");
    await expect.poll(() => ctx.store.getProcess(procId)!.steps[2].title).toBe("Click **OK**.");
    await page.close();
  }, 30_000);

  it("collapses the menu to icons and remembers it", async () => {
    const page = await open();
    const width = () => page.evaluate(() => document.querySelector(".sidebar")!.getBoundingClientRect().width);
    expect(await width()).toBeGreaterThan(200);
    await page.click("[data-testid=sidebar-toggle]");
    await expect.poll(width).toBe(64);
    expect(await page.locator(".sidebar .side-label").first().isVisible()).toBe(false);
    await page.reload();
    await page.waitForSelector("[data-step-id=s1]");
    expect(await width()).toBe(64);
    await page.click("[data-testid=sidebar-toggle]");
    await expect.poll(width).toBeGreaterThan(200);
    await page.close();
  }, 30_000);
});
