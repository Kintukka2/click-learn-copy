// Replay / automated process testing (see ARCHITECTURE "Replay contract").
// Re-runs a recorded process in Chromium: resolves every step's target with the same logic as
// SteplightCapture.resolve (injected capture.js; Playwright locators as a fallback), takes a
// screenshot BEFORE acting, performs the action and reports ok / healed / failed per step.
//  - update, same language → new screenshots, bboxes, replayStatus (+ refreshed names/titles, healed selectors)
//  - update, other language → localizations[lang].steps[id] = { screenshot, bbox, name, label, value }
//  - test → no media, report only
import { chromium, type ElementHandle, type JSHandle, type Locator, type Page } from "playwright";
import { instructionFor } from "../core/instructions.js";
import type { Lang, Process, ReplayReport, ReplayStepResult, Selector, Step, Target } from "../core/model.js";
import { captureScript } from "../capture/bundle.js";
import { joinUrl } from "../core/url.js";

export interface ReplayOptions {
  /** "update" re-captures screenshots + bboxes and writes them into the process; "test" only verifies. */
  mode: "update" | "test";
  /** Replay with the application UI in this language (localized screenshots). Default: process.lang. */
  lang?: Lang;
  /** Absolute path of the project's media folder (new screenshots are written here in update mode). */
  mediaDir: string;
  /** Called to persist a new PNG; returns the file name stored. */
  saveMedia: (png: Buffer) => string;
  viewport?: { width: number; height: number };
  /** Base URL used to resolve relative startUrls (e.g. "http://localhost:4100"). */
  baseUrl?: string;
  /** Maps an absolute URL to the one the headless browser should open (e.g. public → internal address). */
  rewriteUrl?: (url: string) => string;
  headless?: boolean;
}

export interface ReplayResult {
  report: ReplayReport;
  /** The process with refreshed screenshots/bboxes/replayStatus (update mode) or unchanged (test mode). */
  process: Process;
}

const STEP_TIMEOUT = 5000;
const SETTLE_MS = 250;
const MAX_CONSECUTIVE_FAILURES = 3;

const LOCALES: Record<string, string> = { en: "en-GB", da: "da-DK", de: "de-DE", fr: "fr-FR", es: "es-ES", nl: "nl-NL", sv: "sv-SE" };

/** Add/replace a query parameter: inside the hash query for hash routes (#/…), else in the search string. */
export function withUrlParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  if (u.hash.startsWith("#/") || u.hash.startsWith("#!")) {
    const h = u.hash.slice(1);
    const qi = h.indexOf("?");
    const path = qi >= 0 ? h.slice(0, qi) : h;
    const q = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
    q.set(key, value);
    u.searchParams.delete(key);
    u.hash = path + "?" + q.toString();
  } else {
    u.searchParams.set(key, value);
  }
  return u.toString();
}

function resolveUrl(url: string, baseUrl?: string): string {
  try {
    return new URL(url).toString();
  } catch {
    if (!baseUrl) throw new Error(`relative start URL "${url}" needs a baseUrl`);
    return joinUrl(baseUrl, url); // keeps a base path prefix such as /steplight
  }
}

function norm(s?: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

interface Found {
  handle: ElementHandle<Element>;
  index: number;
  selector: Selector;
}

interface Described {
  target: Target;
  optionLabel?: string;
}

type CaptureGlobal = {
  SteplightCapture?: {
    resolve(t: Target): { element: Element; index: number; selector: Selector } | null;
    describe(el: Element): Target;
  };
};

/** Resolve inside the page with the injected capture.js (same logic as SteplightCapture.resolve / Assist). */
async function resolveInPage(page: Page, target: Target): Promise<Found | null> {
  let h: JSHandle | undefined;
  try {
    h = await page.evaluateHandle((t) => {
      const sc = (window as unknown as CaptureGlobal).SteplightCapture;
      if (!sc) return null;
      const r = sc.resolve(t);
      return r ? { element: r.element, index: r.index, selector: r.selector } : null;
    }, target);
    const el = (await h.getProperty("element")).asElement();
    if (!el) return null;
    const index = (await (await h.getProperty("index")).jsonValue()) as number;
    const selector = (await (await h.getProperty("selector")).jsonValue()) as Selector;
    return { handle: el as ElementHandle<Element>, index, selector };
  } catch {
    return null;
  } finally {
    await h?.dispose().catch(() => undefined);
  }
}

function cssAttr(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Playwright locator equivalent of a Steplight selector (fallback when capture.js is unavailable). */
export function playwrightLocator(page: Page, sel: Selector): Locator | null {
  const v = sel.value;
  switch (sel.kind) {
    case "testid":
      return page.locator(["data-testid", "data-test", "data-qa"].map((a) => `[${a}="${cssAttr(v)}"]`).join(","));
    case "clid":
      return page.locator(`[data-clid="${cssAttr(v)}"]`);
    case "id":
      return page.locator(`[id="${cssAttr(v)}"]`);
    case "role": {
      const i = v.indexOf("|");
      const role = (i >= 0 ? v.slice(0, i) : v) as Parameters<Page["getByRole"]>[0];
      const name = i >= 0 ? v.slice(i + 1) : undefined;
      return page.getByRole(role, name ? { name, exact: true } : {});
    }
    case "label":
      return page.getByLabel(v, { exact: true });
    case "placeholder":
      return page.getByPlaceholder(v, { exact: true });
    case "text":
      return page.getByText(v, { exact: true });
    case "css":
      return page.locator(v);
    case "xpath":
      return page.locator(`xpath=${v}`);
  }
  return null;
}

async function resolveWithLocators(page: Page, target: Target): Promise<Found | null> {
  const sels = target.selectors ?? [];
  for (let index = 0; index < sels.length; index++) {
    const loc = playwrightLocator(page, sels[index]);
    if (!loc) continue;
    try {
      const visible = loc.filter({ visible: true });
      if ((await visible.count()) !== 1) continue;
      const handle = await visible.elementHandle({ timeout: 500 });
      if (handle) return { handle, index, selector: sels[index] };
    } catch {
      /* invalid selector for this engine */
    }
  }
  return null;
}

async function locate(page: Page, target: Target, timeout: number): Promise<Found | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const hasCapture = await page.evaluate(() => !!(window as unknown as CaptureGlobal).SteplightCapture).catch(() => false);
    const found = hasCapture ? await resolveInPage(page, target) : null;
    if (found) return found;
    const fb = await resolveWithLocators(page, target);
    if (fb) return fb;
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(150);
  }
}

async function describe(handle: ElementHandle<Element>): Promise<Described> {
  return handle.evaluate((el) => {
    const sc = (window as unknown as CaptureGlobal).SteplightCapture;
    const r = el.getBoundingClientRect();
    const target: Target = sc
      ? sc.describe(el)
      : {
          selectors: [],
          tag: el.tagName.toLowerCase(),
          name: (el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").trim() || undefined,
          bbox: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        };
    let optionLabel: string | undefined;
    if (el instanceof HTMLSelectElement) optionLabel = el.options[el.selectedIndex]?.text?.trim();
    return { target, optionLabel };
  });
}

async function perform(page: Page, handle: ElementHandle<Element>, step: Step): Promise<string | undefined> {
  const timeout = STEP_TIMEOUT;
  switch (step.action) {
    case "click":
      await handle.click({ timeout });
      return;
    case "type":
      await handle.fill(step.value ?? "", { timeout });
      await handle.evaluate((el) => (el as HTMLElement).blur());
      return;
    case "select": {
      let done = false;
      if (step.optionValue !== undefined) {
        const r = await handle.selectOption({ value: step.optionValue }, { timeout }).catch(() => [] as string[]);
        done = r.length > 0;
      }
      if (!done) await handle.selectOption({ label: step.value ?? "" }, { timeout });
      return handle.evaluate((el) => (el instanceof HTMLSelectElement ? el.options[el.selectedIndex]?.text?.trim() : undefined));
    }
    case "check":
      await handle.setChecked(step.value !== "false", { timeout });
      return;
    case "press":
      await handle.press(step.value || "Enter", { timeout });
      return;
    default:
      return;
  }
}

function mergeSelectors(fresh: Selector[], old: Selector[]): Selector[] {
  const out = [...fresh];
  for (const s of old) if (!out.some((o) => o.kind === s.kind && o.value === s.value)) out.push(s);
  return out;
}

export async function replayProcess(proc: Process, opts: ReplayOptions): Promise<ReplayResult> {
  const lang = opts.lang ?? proc.lang;
  const sameLang = lang === proc.lang;
  const out: Process = structuredClone(proc);
  const startedAt = new Date().toISOString();
  const results: ReplayStepResult[] = [];
  let viewport = opts.viewport ?? proc.steps.find((s) => s.viewport)?.viewport ?? { width: 1280, height: 800 };
  const rawStart = proc.startUrl || proc.steps.find((s) => s.url)?.url;
  if (!rawStart) throw new Error("process has no startUrl");
  const nav = (u: string) => (opts.rewriteUrl ? opts.rewriteUrl(u) : u);
  const startUrl = nav(withUrlParam(resolveUrl(rawStart, opts.baseUrl), "lang", lang));
  const script = await captureScript();

  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: LOCALES[lang] ?? lang });
    await context.addInitScript({ content: script });
    const page = await context.newPage();
    page.on("dialog", (d) => void d.accept().catch(() => undefined));
    await page.goto(startUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);

    let consecutiveFailures = 0;
    for (const step of out.steps) {
      const t0 = Date.now();
      const result: ReplayStepResult = { stepId: step.id, status: "ok", durationMs: 0 };
      results.push(result);
      try {
        if (step.viewport && (step.viewport.width !== viewport.width || step.viewport.height !== viewport.height) && !opts.viewport) {
          viewport = step.viewport;
          await page.setViewportSize(viewport);
        }
        if (step.action === "note") continue;
        if (step.action === "navigate") {
          if (step.value) await page.goto(nav(withUrlParam(resolveUrl(step.value, opts.baseUrl), "lang", lang)), { waitUntil: "load" });
          continue;
        }
        if (!step.target) {
          if (step.action === "press") await page.keyboard.press(step.value || "Enter");
          continue;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          result.status = "failed";
          result.message = "skipped: the previous steps failed";
          continue;
        }

        const found = await locate(page, step.target, STEP_TIMEOUT);
        if (!found) {
          result.status = "failed";
          result.message = `element not found: ${step.target.name ?? step.target.label ?? step.target.selectors[0]?.value ?? step.target.tag}`;
          consecutiveFailures++;
          continue;
        }
        await found.handle.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(80);
        const d = await describe(found.handle);
        const png = opts.mode === "update" ? await page.screenshot({ type: "png" }) : undefined;

        const newName = d.target.name;
        const newLabel = d.target.label;
        const nameChanged = sameLang && (norm(newName) !== norm(step.target.name) || (!!step.target.label && norm(newLabel) !== norm(step.target.label)));
        result.matched = found.selector;
        result.matchedIndex = found.index;
        result.bbox = d.target.bbox;
        result.name = newName;
        result.label = newLabel;
        result.status = found.index > 0 || nameChanged ? "healed" : "ok";
        if (found.index > 0) result.message = `healed: matched by ${found.selector.kind} "${found.selector.value}" instead of ${step.target.selectors[0]?.kind} "${step.target.selectors[0]?.value}"`;
        else if (nameChanged) result.message = `healed: element name changed from "${step.target.name ?? ""}" to "${newName ?? ""}"`;

        const displayed = await perform(page, found.handle, step);
        await found.handle.dispose().catch(() => undefined);
        await page.waitForLoadState("load", { timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(SETTLE_MS);
        consecutiveFailures = 0;

        if (opts.mode === "update" && png) {
          const file = opts.saveMedia(png);
          result.screenshot = file;
          if (sameLang) {
            step.screenshot = file;
            step.viewport = viewport;
            step.replayStatus = result.status;
            step.target.bbox = d.target.bbox;
            if (found.index > 0 && d.target.selectors.length) step.target.selectors = mergeSelectors(d.target.selectors, step.target.selectors);
            if (!step.titleEdited && nameChanged) {
              if (newName) step.target.name = newName;
              if (newLabel) step.target.label = newLabel;
              step.title = instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive, learnerChooses: step.learnerChooses }, proc.lang);
            }
          } else {
            const loc = (out.localizations[lang] ??= { steps: {} });
            const ls = (loc.steps[step.id] ??= {});
            ls.screenshot = file;
            ls.bbox = d.target.bbox;
            if (newName) ls.name = newName;
            else delete ls.name;
            if (newLabel) ls.label = newLabel;
            else delete ls.label;
            if (step.action === "select" && (displayed ?? d.optionLabel)) ls.value = displayed ?? d.optionLabel;
            if (!step.titleEdited && !ls.titleEdited && ls.title !== undefined) {
              ls.title = instructionFor({ action: step.action, target: step.target, value: ls.value ?? step.value, sensitive: step.sensitive, learnerChooses: step.learnerChooses, name: ls.label ?? ls.name }, lang);
            }
          }
        }
      } catch (err) {
        result.status = "failed";
        result.message = (err as Error).message.split("\n")[0];
        consecutiveFailures++;
      } finally {
        result.durationMs = Date.now() - t0;
        if (result.status === "failed" && opts.mode === "update" && sameLang) step.replayStatus = "failed";
      }
    }
    if (opts.mode === "update" && !sameLang && out.localizations[lang]) out.localizations[lang].updatedAt = new Date().toISOString();
    await context.close();
  } finally {
    await browser.close();
  }

  const report: ReplayReport = {
    processId: proc.id,
    mode: opts.mode,
    lang,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed: results.every((r) => r.status !== "failed"),
    results,
  };
  return { report, process: opts.mode === "update" ? out : structuredClone(proc) };
}
