// Scripted recorder: drives a real Chromium through ScriptedActions with the capture script
// (dist/lib/capture.js) injected, exactly like a human recording with the browser extension.
// For each action: locate → screenshot BEFORE acting → act → wait for the CaptureEvent the
// injected script emits → hand {event, screenshot} to onCapture (in order).
import { chromium, type Locator, type Page } from "playwright";
import type { CaptureEvent, CapturePayload, Target } from "../core/model.js";
import { captureScript } from "../capture/bundle.js";
import type { ScriptedAction } from "./scenarios.js";

export interface RecordOptions {
  startUrl: string; // absolute
  actions: ScriptedAction[];
  viewport?: { width: number; height: number };
  /** Receives every captured event (with a pre-action screenshot data URL) in order. */
  onCapture: (payload: CapturePayload) => Promise<void>;
  headless?: boolean;
}

const EVENT_TIMEOUT = 3000;
const SETTLE_MS = 250;

/** Build a Playwright locator from a ScriptedAction locator description. */
export function locatorFor(page: Page, l: ScriptedAction["locator"]): Locator {
  if (l.testid) return page.getByTestId(l.testid);
  if (l.css) return page.locator(l.css);
  if (l.role) return page.getByRole(l.role as Parameters<Page["getByRole"]>[0], l.name ? { name: l.name, exact: true } : {});
  if (l.label) return page.getByLabel(l.label, { exact: true });
  if (l.text) return page.getByText(l.text, { exact: true });
  throw new Error(`empty locator ${JSON.stringify(l)}`);
}

function describeLocator(l: ScriptedAction["locator"]): string {
  return Object.entries(l)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

async function perform(loc: Locator, a: ScriptedAction): Promise<void> {
  switch (a.action) {
    case "click":
      await loc.click();
      return;
    case "type":
      await loc.fill(a.value ?? "");
      await loc.blur(); // change fires on blur
      return;
    case "select":
      await loc.selectOption({ label: a.value ?? "" });
      return;
    case "check":
      await loc.setChecked(a.value !== "false");
      return;
    case "press":
      await loc.press(a.value ?? "Enter");
      return;
  }
}

async function waitForEvents(queue: CaptureEvent[], from: number, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (queue.length <= from && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
}

export async function recordScripted(opts: RecordOptions): Promise<void> {
  const script = await captureScript();
  const viewport = opts.viewport ?? { width: 1280, height: 800 };
  const browser = await chromium.launch({ headless: opts.headless ?? true });
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-GB" });
    const queue: CaptureEvent[] = [];
    await context.exposeBinding("__steplightEmit", (source, ev: CaptureEvent) => {
      if (source.frame !== source.page.mainFrame()) return;
      queue.push(ev);
    });
    await context.addInitScript({
      content:
        script +
        "\n;(function(){try{if(window.top!==window)return;window.SteplightCapture.start(function(ev){return window.__steplightEmit(ev);});}catch(e){console.warn('[steplight] capture failed to start',e);}})();",
    });
    const page = await context.newPage();
    page.on("dialog", (d) => void d.accept().catch(() => undefined));
    await page.goto(opts.startUrl, { waitUntil: "load" });
    await page.waitForTimeout(400);

    for (let i = 0; i < opts.actions.length; i++) {
      const a = opts.actions[i];
      const loc = locatorFor(page, a.locator);
      try {
        await loc.waitFor({ state: "visible", timeout: 10_000 });
      } catch (err) {
        throw new Error(`recorder: step ${i + 1} (${a.action} ${describeLocator(a.locator)}) not found: ${(err as Error).message.split("\n")[0]}`);
      }
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(120);
      const png = await page.screenshot({ type: "png" });
      const fallbackTarget = (await loc
        .evaluate((el) => (window as unknown as { SteplightCapture: { describe(e: Element): unknown } }).SteplightCapture.describe(el))
        .catch(() => undefined)) as Target | undefined;
      const fallbackUrl = page.url();
      const before = queue.length;
      await perform(loc, a);
      await waitForEvents(queue, before, EVENT_TIMEOUT);
      await page.waitForTimeout(SETTLE_MS); // let stray events (if any) arrive, and the UI settle
      const fresh = queue.slice(before);
      queue.length = before; // consumed
      let ev = fresh.find((e) => e.action === a.action);
      if (fresh.length > 1 || (fresh.length && !ev)) {
        console.warn(`[steplight] recorder: step ${i + 1} produced ${fresh.length} events (${fresh.map((e) => e.action).join(", ")}); keeping the ${a.action}`);
      }
      if (!ev) {
        // capture did not fire (e.g. a framework swallowed the event): synthesize from the pre-action description
        console.warn(`[steplight] recorder: no ${a.action} event captured for step ${i + 1}; using the element description`);
        ev = {
          action: a.action,
          target: fallbackTarget,
          url: fallbackUrl,
          pageTitle: await page.title().catch(() => undefined),
          viewport,
          timestamp: Date.now(),
        };
        if (a.action === "type" || a.action === "press") ev.value = a.value ?? (a.action === "press" ? "Enter" : "");
        if (a.action === "check") ev.value = String(a.value !== "false");
        if (a.action === "select") {
          ev.value = a.value;
          ev.optionValue = await loc.inputValue().catch(() => undefined);
        }
      }
      ev.viewport = viewport;
      await opts.onCapture({ event: ev, screenshotDataUrl: "data:image/png;base64," + png.toString("base64") });
    }
    await context.close();
  } finally {
    await browser.close();
  }
}
