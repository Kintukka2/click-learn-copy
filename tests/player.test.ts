// Player (Show Me / Try Me / Test Me) browser tests: bundles src/players/browser.ts with esbuild and
// drives it in headless Chromium against the fixture process (npm run fixtures).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveProcess } from "../src/core/resolve.js";
import type { Process, ResolvedProcess } from "../src/core/model.js";

const ROOT = path.resolve(__dirname, "..");
const FX = path.join(ROOT, "tests/fixtures/out");
const hasFixture = fs.existsSync(path.join(FX, "process.json"));

let browser: Browser;
let bundle = "";
let proc: ResolvedProcess;

async function bundlePlayer(): Promise<string> {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sl-player-")), "player.js");
  await build({ entryPoints: [path.join(ROOT, "src/players/browser.ts")], outfile: out, bundle: true, format: "iife", globalName: "SteplightPlayer", platform: "browser", target: ["chrome110"], loader: { ".css": "text" }, logLevel: "error" });
  return out;
}

function html(cfg: Record<string, unknown>, opts: { hostStyle?: string; head?: string; process?: ResolvedProcess } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0}body{padding:12px} #host{${opts.hostStyle ?? ""}}</style>${opts.head ?? ""}</head><body><div id="host"></div>
<script src="/player.js"></script><script>
window.__events=[];var cfg=${JSON.stringify(cfg)};cfg.process=${JSON.stringify(opts.process ?? proc)};
cfg.onEvent=function(e){window.__events.push(e)};window.__player=SteplightPlayer.mount(document.getElementById('host'),cfg);
</script></body></html>`;
}

async function open(page: Page, body: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://player.test/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/") return route.fulfill({ body, contentType: "text/html; charset=utf-8" });
    if (u.pathname === "/player.js") return route.fulfill({ path: bundle, contentType: "text/javascript" });
    if (u.pathname.startsWith("/media/")) return route.fulfill({ path: path.join(FX, "media", path.basename(u.pathname)), contentType: "image/png" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://player.test/");
  return errors;
}

/** Client coordinates of a step's bbox centre on the rendered screenshot. */
async function center(page: Page, i: number) {
  const st = proc.steps[i];
  const r = (await page.locator(".sl-shot").boundingBox())!;
  const b = st.bbox!;
  return { x: r.x + ((b.x + b.width / 2) / st.viewport!.width) * r.width, y: r.y + ((b.y + b.height / 2) / st.viewport!.height) * r.height };
}

async function waitStep(page: Page, i: number) {
  await page.waitForFunction((n) => document.querySelector(".sl-task-meta")?.textContent?.startsWith(`Step ${n} `), i + 1);
  await page.waitForTimeout(120);
}

/** Perform step i correctly (desktop overlays or compact docked controls). */
async function doStep(page: Page, i: number) {
  const st = proc.steps[i];
  await waitStep(page, i);
  const compact = await page.evaluate(() => !!document.querySelector(".sl-compact"));
  if (st.action === "type") {
    if (compact) await page.fill(".sl-input-docked", st.value!);
    else {
      const c = await center(page, i);
      await page.mouse.click(c.x, c.y);
      await page.keyboard.press("Control+A");
      await page.keyboard.type(st.value!.toUpperCase()); // case-insensitive match
    }
    await page.keyboard.press("Enter");
  } else if (st.action === "select") {
    if (compact) await page.click(`.sl-choice[data-value="${st.value}"]`);
    else {
      const c = await center(page, i);
      await page.mouse.click(c.x, c.y);
      await page.click(`.sl-opt[data-value="${st.value}"]`);
    }
  } else {
    const c = await center(page, i);
    await page.mouse.click(c.x, c.y);
  }
}

async function wrongClick(page: Page) {
  const r = (await page.locator(".sl-view").boundingBox())!;
  await page.mouse.click(r.x + r.width * 0.93, r.y + r.height * 0.9);
}

describe.skipIf(!hasFixture)("SteplightPlayer", () => {
  beforeAll(async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FX, "process.json"), "utf8")) as Process;
    proc = resolveProcess(raw, "en", { media: (f) => `/media/${f}` });
    bundle = await bundlePlayer();
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("exposes mount() and scorm on the global", async () => {
    const page = await browser.newPage();
    await open(page, `<!doctype html><script src="/player.js"></script>`);
    const api = await page.evaluate(() => ({ mount: typeof (window as any).SteplightPlayer.mount, scorm: typeof (window as any).SteplightPlayer.scorm.reportScore }));
    expect(api).toEqual({ mount: "function", scorm: "function" });
    await page.close();
  });

  it("Show Me video mode plays to completion and sets __steplightVideoDone", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await open(page, html({ mode: "show", video: true, speed: 2 }, { hostStyle: "height:calc(100vh - 24px)" }));
    expect(await page.locator(".sl-controls").count()).toBe(0); // chrome-less
    const t0 = Date.now();
    await page.waitForFunction(() => (window as any).__steplightVideoDone === true, null, { timeout: 40_000, polling: 100 });
    expect(Date.now() - t0).toBeGreaterThan(4000);
    expect(await page.evaluate(() => (window as any).__events)).toEqual([{ type: "complete", mode: "show" }]);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("Show Me: intro, play, navigation by buttons and arrow keys, bubble near the target", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = await open(page, html({ mode: "show" }));
    await expect.poll(() => page.locator(".sl-bigplay").count()).toBe(1);
    expect(await page.locator(".sl-seg").count()).toBe(proc.steps.length);
    await page.click(".sl-bigplay");
    await page.waitForTimeout(400);
    await page.click(".sl-play"); // pause
    await page.click(".sl-next");
    await expect.poll(() => page.textContent(".sl-count")).toBe(`Step 2 of ${proc.steps.length}`);
    await page.focus(".sl-player .sl-next");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.textContent(".sl-count")).toBe(`Step 3 of ${proc.steps.length}`);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => page.textContent(".sl-count")).toBe(`Step 2 of ${proc.steps.length}`);
    await page.waitForTimeout(700);
    // caption bubble shows the step title with **bold** rendered
    expect(await page.innerHTML(".sl-bubble .sl-cap-title")).toContain("<strong>Country</strong>");
    // highlight sits on the bbox (screenshot px → rendered px)
    const shot = (await page.locator(".sl-shot").boundingBox())!;
    const spot = (await page.locator(".sl-spot").boundingBox())!;
    const b = proc.steps[1].bbox!;
    const k = shot.width / proc.steps[1].viewport!.width;
    expect(Math.abs(spot.x + spot.width / 2 - (shot.x + (b.x + b.width / 2) * k))).toBeLessThan(2);
    expect(Math.abs(spot.y + spot.height / 2 - (shot.y + (b.y + b.height / 2) * k))).toBeLessThan(2);
    expect(await page.locator("[aria-live=polite]").textContent()).toContain("Step 2");
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("Try Me: wrong click shakes + hints, two misses highlight, completes by clicking/typing", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = await open(page, html({ mode: "try" }));
    await page.click(".sl-card .sl-btn-primary"); // Start
    await waitStep(page, 0);
    await wrongClick(page);
    await expect.poll(() => page.textContent(".sl-feedback")).toBe("Not quite. Look for the highlighted area.");
    expect(await page.locator(".sl-frame.sl-shake").count()).toBe(1);
    expect(await page.locator(".sl-spot.sl-on").count()).toBe(0);
    await page.waitForTimeout(450);
    await wrongClick(page);
    await expect.poll(() => page.locator(".sl-spot.sl-on").count()).toBe(1);
    // wrong value then the right one
    const c = await center(page, 0);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.type("Fabrikam");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.textContent(".sl-feedback")).toContain("Contoso Ltd");
    for (let i = 0; i < proc.steps.length; i++) await doStep(page, i);
    await page.waitForSelector(".sl-result-try");
    expect(await page.evaluate(() => (window as any).__events)).toEqual([{ type: "complete", mode: "try" }]);
    expect(await page.textContent(".sl-result-h")).toBe("Well done! You completed the process.");
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("Test Me: one wrong click scores below 100 and reports to a SCORM 1.2 API", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const mock = `<script>window.__calls=[];var store={"cmi.core.lesson_status":"not attempted"};window.API={
      LMSInitialize:function(a){__calls.push(["LMSInitialize"]);return "true"},LMSFinish:function(){__calls.push(["LMSFinish"]);return "true"},
      LMSGetValue:function(k){return store[k]||""},LMSSetValue:function(k,v){store[k]=v;__calls.push(["LMSSetValue",k,v]);return "true"},
      LMSCommit:function(){__calls.push(["LMSCommit"]);return "true"},LMSGetLastError:function(){return 0}};</script>`;
    const errors = await open(page, html({ mode: "test", scorm: true, autoplay: true }, { head: mock }));
    for (let i = 0; i < proc.steps.length; i++) {
      if (i === 1) {
        await waitStep(page, 1);
        expect(await page.locator(".sl-hint-btn").count()).toBe(0); // no hints in Test Me
        await wrongClick(page);
        await expect.poll(() => page.locator(".sl-spot.sl-on[data-tone=reveal]").count()).toBe(1);
        continue;
      }
      await doStep(page, i);
    }
    await page.waitForSelector(".sl-result-test");
    const scorable = proc.steps.length;
    const expected = Math.round(((scorable - 1) / scorable) * 100);
    const ev = (await page.evaluate(() => (window as any).__events))[0];
    expect(ev).toEqual({ type: "complete", mode: "test", score: expected, passed: expected >= proc.passMark });
    expect(ev.score).toBeLessThan(100);
    expect(await page.locator(".sl-review li.sl-bad").count()).toBe(1);
    expect(await page.textContent(".sl-ring-val b")).toBe(`${expected}%`);
    const calls = (await page.evaluate(() => (window as any).__calls)) as string[][];
    const set = Object.fromEntries(calls.filter((c) => c[0] === "LMSSetValue").map((c) => [c[1], c[2]]));
    expect(calls.filter((c) => c[0] === "LMSInitialize")).toHaveLength(1);
    expect(set["cmi.core.score.raw"]).toBe(String(expected));
    expect(set["cmi.core.score.min"]).toBe("0");
    expect(set["cmi.core.score.max"]).toBe("100");
    expect(set["cmi.core.lesson_status"]).toBe(expected >= proc.passMark ? "passed" : "failed");
    expect(calls.some((c) => c[0] === "LMSCommit")).toBe(true);
    expect(calls[calls.length - 1][0]).toBe("LMSFinish");
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("Test Me: all correct scores 100", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await open(page, html({ mode: "test", autoplay: true }));
    for (let i = 0; i < proc.steps.length; i++) await doStep(page, i);
    await page.waitForSelector(".sl-result-test");
    expect((await page.evaluate(() => (window as any).__events))[0]).toMatchObject({ score: 100, passed: true });
    await page.close();
  }, 60_000);

  it("works at 360px: compact layout, no horizontal scroll, docked answers", async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: false });
    const errors = await open(page, html({ mode: "try", autoplay: true }));
    await waitStep(page, 0);
    expect(await page.locator(".sl-player.sl-compact").count()).toBe(1);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(360);
    expect(await page.locator(".sl-input-docked").count()).toBe(1);
    for (let i = 0; i < proc.steps.length; i++) await doStep(page, i);
    await page.waitForSelector(".sl-result-try");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("localizes the UI from the process language and honours primaryColor", async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await open(page, html({ mode: "try", autoplay: true, primaryColor: "#c2410c" }, { process: { ...proc, lang: "da" } }));
    await page.waitForFunction(() => document.querySelector(".sl-task-meta")?.textContent?.startsWith("Trin 1 af"));
    expect(await page.textContent(".sl-mode")).toContain("Prøv selv");
    const color = await page.evaluate(() => getComputedStyle(document.querySelector(".sl-player")!).getPropertyValue("--sl-primary").trim());
    expect(color).toBe("#c2410c");
    await page.close();
  }, 60_000);

  it("destroy() removes the player", async () => {
    const page = await browser.newPage();
    await open(page, html({ mode: "show" }));
    await page.evaluate(() => (window as any).__player.destroy());
    expect(await page.locator(".sl-player").count()).toBe(0);
    await page.close();
  }, 30_000);
});
