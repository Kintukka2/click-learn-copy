// Assist (in-app guidance) browser tests: bundles src/assist/browser.ts and drives it on a copy of
// the fixture form from scripts/make-fixture.ts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveProcess } from "../src/core/resolve.js";
import type { Process, ResolvedProcess, ResolvedStep, Target } from "../src/core/model.js";

const ROOT = path.resolve(__dirname, "..");
const FX = path.join(ROOT, "tests/fixtures/out");
const hasFixture = fs.existsSync(path.join(FX, "process.json"));

let browser: Browser;
let bundle = "";
let proc: ResolvedProcess;
let appHtml = "";

async function bundleAssist(): Promise<string> {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sl-assist-")), "assist.js");
  await build({ entryPoints: [path.join(ROOT, "src/assist/browser.ts")], outfile: out, bundle: true, format: "iife", globalName: "SteplightAssist", platform: "browser", target: ["chrome110"], loader: { ".css": "text" }, logLevel: "error" });
  return out;
}

/** Serve the app at http://app.test/ (any path) with assist.js and the process JSON. */
async function serve(page: Page, opts: { scriptAttrs?: string; extra?: string; lateName?: boolean; html?: string } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let body = opts.html ?? appHtml;
  if (opts.lateName) {
    // the "Customer name" field appears only after 900 ms (route/data loading)
    body = body.replace('<label for="name">Customer name</label><input id="name">', '<div id="slot"></div>');
    body = body.replace("</body>", `<script>setTimeout(function(){document.getElementById('slot').innerHTML='<label for="name">Customer name</label><input id="name">'},900)</script></body>`);
  }
  body = body.replace("</body>", `${opts.extra ?? ""}<script src="/assist.js" ${opts.scriptAttrs ?? ""}></script></body>`);
  await page.route("http://app.test/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/assist.js") return route.fulfill({ path: bundle, contentType: "text/javascript" });
    if (u.pathname === "/api/proc.json") return route.fulfill({ body: JSON.stringify(proc), contentType: "application/json" });
    return route.fulfill({ body, contentType: "text/html; charset=utf-8" });
  });
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-steplight-assist]");
    if (!host) return null;
    const sr = host.shadowRoot!;
    const ring = sr.querySelector(".ring") as HTMLElement;
    const card = sr.querySelector(".card") as HTMLElement;
    return {
      ignore: host.hasAttribute("data-steplight-ignore"),
      ringOn: ring.classList.contains("on"),
      ring: ring.getBoundingClientRect().toJSON() as DOMRect,
      count: card.querySelector(".count")?.textContent ?? "",
      title: card.querySelector(".title")?.innerHTML ?? "",
      text: card.textContent ?? "",
      done: card.classList.contains("done"),
      card: card.getBoundingClientRect().toJSON() as DOMRect,
    };
  });

async function rectOf(page: Page, sel: string) {
  return (await page.locator(sel).boundingBox())!;
}

function near(ring: DOMRect, el: { x: number; y: number; width: number; height: number }) {
  return Math.abs(ring.x + ring.width / 2 - (el.x + el.width / 2)) < 2 && Math.abs(ring.y + ring.height / 2 - (el.y + el.height / 2)) < 2 && ring.width >= el.width;
}

describe.skipIf(!hasFixture)("SteplightAssist", () => {
  beforeAll(async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FX, "process.json"), "utf8")) as Process;
    proc = resolveProcess(raw, "en", { media: (f) => `/media/${f}` });
    const src = fs.readFileSync(path.join(ROOT, "scripts/make-fixture.ts"), "utf8");
    appHtml = /const html = `([\s\S]*?)`;/.exec(src)![1];
    bundle = await bundleAssist();
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("guides through every step, advancing on the user's real actions", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page);
    await page.goto("http://app.test/app.html#/customers/new");
    await page.evaluate((p) => {
      (window as any).__ev = [];
      (window as any).SteplightAssist.start(p, { onEvent: (t: string, d: unknown) => (window as any).__ev.push([t, d]) });
    }, proc);
    await expect.poll(async () => (await state(page))?.ringOn).toBe(true);
    let s = (await state(page))!;
    expect(s.ignore).toBe(true);
    expect(s.count).toBe(`Step 1 of ${proc.steps.length}`);
    expect(s.title).toContain("<strong>Customer name</strong>");
    expect(near(s.ring, await rectOf(page, "#name"))).toBe(true);

    // a click elsewhere does not advance; the overlay does not block the page
    await page.click("h1");
    expect((await state(page))!.count).toBe(`Step 1 of ${proc.steps.length}`);
    await page.fill("#name", "Contoso Ltd");
    await page.locator("#name").blur(); // change event
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 2 of ${proc.steps.length}`);
    s = (await state(page))!;
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#country"))).toBe(true);

    await page.selectOption("#country", "DK");
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 3 of ${proc.steps.length}`);
    await page.fill("#email", "orders@contoso.com");
    await page.press("#email", "Enter");
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 4 of ${proc.steps.length}`);
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#save"))).toBe(true);
    await page.click("#save");
    await expect.poll(async () => (await state(page))!.done).toBe(true);
    const ev = (await page.evaluate(() => (window as any).__ev)) as [string, any][];
    expect(ev[0][0]).toBe("start");
    expect(ev.filter((e) => e[0] === "step")).toHaveLength(proc.steps.length);
    expect(ev[ev.length - 1][0]).toBe("complete");
    expect(await page.evaluate(() => sessionStorage.getItem("steplight.assist.active"))).toBeNull();
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("auto-starts from sl_assist in the hash, strips it, and resumes after a reload", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page);
    await page.goto(`http://app.test/app.html#/customers/new?sl_assist=${encodeURIComponent("http://app.test/api/proc.json")}`);
    await expect.poll(async () => (await state(page))?.ringOn).toBe(true);
    expect(page.url()).not.toContain("sl_assist");
    expect(page.url()).toContain("#/customers/new");
    await page.fill("#name", "Contoso Ltd");
    await page.locator("#name").blur();
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 2 of ${proc.steps.length}`);
    await page.reload();
    await expect.poll(async () => (await state(page))?.count).toBe(`Step 2 of ${proc.steps.length}`);
    // Back / Skip buttons
    await page.evaluate(() => (document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelector(".fwd") as HTMLButtonElement).click());
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 3 of ${proc.steps.length}`);
    await page.evaluate(() => (document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelectorAll(".right .btn")[0] as HTMLButtonElement).click());
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 2 of ${proc.steps.length}`);
    // Exit removes the overlay and forgets the session
    await page.evaluate(() => (document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelector(".x") as HTMLButtonElement).click());
    expect(await state(page)).toBeNull();
    await page.reload();
    await page.waitForTimeout(500);
    expect(await state(page)).toBeNull();
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("reports assist_start once per session and assist_complete to the server it loaded from", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page);
    const events: Record<string, unknown>[] = [];
    await page.route("http://app.test/steplight/api/**", (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/steplight/api/events") {
        events.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ body: JSON.stringify(proc), contentType: "application/json" });
    });
    const src = `http://app.test/steplight/api/processes/${proc.id}/resolved?lang=en`;
    await page.goto(`http://app.test/app.html#/customers/new?sl_assist=${encodeURIComponent(src)}`);
    await expect.poll(async () => (await state(page))?.ringOn).toBe(true);
    await page.fill("#name", "Contoso Ltd");
    await page.locator("#name").blur();
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 2 of ${proc.steps.length}`);
    await page.reload(); // resuming is the same session
    await expect.poll(async () => (await state(page))?.count).toBe(`Step 2 of ${proc.steps.length}`);
    await page.selectOption("#country", "DK");
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 3 of ${proc.steps.length}`);
    await page.fill("#email", "orders@contoso.com");
    await page.press("#email", "Enter");
    await expect.poll(async () => (await state(page))!.count).toBe(`Step 4 of ${proc.steps.length}`);
    await page.click("#save");
    await expect.poll(async () => (await state(page))!.done).toBe(true);
    await expect.poll(() => events.map((e) => e.type)).toEqual(["assist_start", "assist_complete"]);
    expect(events[0]).toMatchObject({ projectId: proc.projectId, processId: proc.id, lang: "en" });
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it("auto-starts from the script tag's data-process-url", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await serve(page, { scriptAttrs: 'data-process-url="/api/proc.json"' });
    await page.goto("http://app.test/");
    await expect.poll(async () => (await state(page))?.count).toBe(`Step 1 of ${proc.steps.length}`);
    await page.close();
  }, 30_000);

  it("waits for elements that appear later", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await serve(page, { lateName: true });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), proc);
    await page.waitForTimeout(200);
    const s = (await state(page))!;
    expect(s.ringOn).toBe(false);
    expect(s.text).toContain("Looking for this element");
    await expect.poll(async () => (await state(page))!.ringOn, { timeout: 5000 }).toBe(true);
    expect(near((await state(page))!.ring, await rectOf(page, "#name"))).toBe(true);
    await page.close();
  }, 30_000);

  it("follows the element on scroll and docks the card on phones", async () => {
    const page = await browser.newPage({ viewport: { width: 380, height: 300 } });
    await serve(page);
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 3 }), proc);
    await expect.poll(async () => (await state(page))?.ringOn).toBe(true);
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#save"))).toBe(true);
    const s = (await state(page))!;
    expect(s.card.x).toBeGreaterThanOrEqual(0);
    expect(s.card.x + s.card.width).toBeLessThanOrEqual(380);
    await page.evaluate(() => window.scrollBy(0, 40));
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#save"))).toBe(true);
    await page.close();
  }, 30_000);

  // A D365-style navigation group that starts expanded. Collapsing it removes its links, so the
  // recorded css path of "All purchase requisitions" then points at the next link in the pane.
  const menuHtml = `<!doctype html><html><body><h1>Procurement</h1>
<div id="menu"><button id="pr" aria-expanded="true">Purchase requisitions</button><a href="#all" class="pr">All purchase requisitions</a><a href="#mine" class="pr">Purchase requisitions prepared by me</a><a href="#cons">Consignment replenishment orders</a><a href="#cat">Procurement categories</a></div>
<button id="new">New</button>
<script>
var pr = document.getElementById("pr"), links = Array.from(document.querySelectorAll(".pr"));
pr.addEventListener("click", function () {
  var open = pr.getAttribute("aria-expanded") === "true";
  pr.setAttribute("aria-expanded", String(!open));
  if (open) links.forEach(function (a) { a.remove(); });
  else links.slice().reverse().forEach(function (a) { pr.after(a); });
});
</script></body></html>`;
  const bbox = { x: 0, y: 0, width: 10, height: 10 };
  const tgt = (role: string, name: string, css: string): Target => ({ selectors: [{ kind: "role", value: `${role}|${name}` }, { kind: "css", value: css }], tag: role === "link" ? "a" : "button", role, name, bbox });
  const menuSteps: Omit<ResolvedStep, "index" | "url">[] = [
    { id: "s1", action: "click", title: "Click the Procurement heading.", target: { ...tgt("heading", "Procurement", "body > h1"), selectors: [{ kind: "text", value: "Procurement" }], tag: "h1" } },
    { id: "s2", action: "click", title: "Click the Purchase requisitions button.", target: tgt("button", "Purchase requisitions", "#pr") },
    { id: "s3", action: "click", title: "Click the All purchase requisitions link.", target: tgt("link", "All purchase requisitions", "#menu > a:nth-of-type(1)") },
    { id: "s4", action: "click", title: "Click New.", target: tgt("button", "New", "#new") },
  ];
  const menuProc = (): ResolvedProcess => ({ ...proc, id: "menu", title: "Create a PR", steps: menuSteps.map((s, i) => ({ ...s, index: i + 1, url: "http://app.test/" })) });

  it("skips clicking an expander that is already open when the next element is visible", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: menuHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), menuProc());
    await expect.poll(async () => (await state(page))?.count).toBe("Step 1 of 4");
    await page.click("h1");
    // "Purchase requisitions" is already expanded: the next step is shown right away
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    expect(await page.getAttribute("#pr", "aria-expanded")).toBe("true");
    // Back from there stays on the expander step
    await page.evaluate(() => ((document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelectorAll(".actions .btn")[1]) as HTMLElement).click());
    await page.waitForTimeout(800);
    expect((await state(page))!.count).toBe("Step 2 of 4");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  it("does not highlight a neighbour when a collapsed menu hides the element, and goes back to the expander", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: menuHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 1 }), menuProc());
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#pr"))).toBe(true);
    // the user follows "Click Purchase requisitions" on an open group and collapses it
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    expect(await page.locator("#menu > a:nth-of-type(1)").textContent()).toBe("Consignment replenishment orders");
    const cons = await rectOf(page, "a[href='#cons']");
    for (let k = 0; k < 4; k++) {
      const s = (await state(page))!;
      if (s.count !== "Step 3 of 4") break;
      expect(s.ringOn && near(s.ring, cons)).toBe(false);
      await page.waitForTimeout(100);
    }
    // the link is gone and its group is collapsed: back to the expander step
    await expect.poll(async () => (await state(page))!.count, { timeout: 3000 }).toBe("Step 2 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#pr"))).toBe(true);
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    await page.click("a[href='#all']");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 4 of 4");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  // Like D365's navigation pane: no aria-expanded, and collapsing a group re-uses its link
  // elements for the next group's links instead of removing them.
  const reuseHtml = `<!doctype html><html><body><h1>Procurement</h1>
<div id="menu"><button id="pr">Purchase requisitions</button><a href="#all">All purchase requisitions</a><a href="#mine">Purchase requisitions prepared by me</a><a href="#cons">Consignment replenishment orders</a><a href="#cat">Procurement categories</a></div>
<button id="new">New</button>
<script>
var open = true, labels = [["#all", "All purchase requisitions"], ["#mine", "Purchase requisitions prepared by me"], ["#cons", "Consignment replenishment orders"], ["#cat", "Procurement categories"]];
document.getElementById("pr").addEventListener("click", function () {
  open = !open;
  var links = document.querySelectorAll("#menu > a"), shown = open ? labels : labels.slice(2);
  links.forEach(function (a, i) { var l = shown[i]; a.hidden = !l; if (l) { a.setAttribute("href", l[0]); a.textContent = l[1]; } });
});
</script></body></html>`;

  it("learns that a step is a toggle when its click hides the next element, without aria-expanded", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: reuseHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 1 }), menuProc());
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#pr"))).toBe(true);
    // the open group is collapsed; the element that showed "All purchase requisitions" now shows another link
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    expect(await page.locator("#menu > a:nth-of-type(1)").textContent()).toBe("Consignment replenishment orders");
    const reused = await rectOf(page, "#menu > a:nth-of-type(1)");
    for (let k = 0; k < 4; k++) {
      const s = (await state(page))!;
      if (s.count !== "Step 3 of 4") break;
      expect(s.ringOn && near(s.ring, reused)).toBe(false);
      await page.waitForTimeout(100);
    }
    await expect.poll(async () => (await state(page))!.count, { timeout: 3000 }).toBe("Step 2 of 4");
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    await page.click("a[href='#all']");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 4 of 4");

    // next run: the group is still open and the step is a known toggle, so it is skipped
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), menuProc());
    await expect.poll(async () => (await state(page))?.count).toBe("Step 1 of 4");
    await page.click("h1");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  // Like D365 when a group is collapsed: its links stay in the page, inside a container squashed
  // to zero height, so the browser still calls them visible while the next group's link is drawn
  // where they are.
  const clipHtml = `<!doctype html><html><body><h1>Procurement</h1>
<div id="menu" style="display:flex;flex-direction:column;align-items:flex-start;width:320px"><button id="pr">Purchase requisitions</button><div id="prl" style="overflow:hidden;display:flex;flex-direction:column"><a href="#all">All purchase requisitions</a><a href="#mine">Purchase requisitions prepared by me</a></div><a href="#cons">Consignment replenishment orders</a><a href="#cat">Procurement categories</a></div>
<button id="new">New</button>
<script>
var open = true, prl = document.getElementById("prl");
document.getElementById("pr").addEventListener("click", function () { open = !open; prl.style.height = open ? "" : "0px"; });
</script></body></html>`;

  it("treats an element clipped by a collapsed container as hidden", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: clipHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 1 }), menuProc());
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "#pr"))).toBe(true);
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    // the hidden link now sits exactly where "Consignment replenishment orders" is drawn
    expect(await page.evaluate(() => document.elementFromPoint(...(((r) => [r.x + r.width / 2, r.y + r.height / 2])(document.querySelector("a[href='#all']")!.getBoundingClientRect()) as [number, number]))?.textContent)).toBe("Consignment replenishment orders");
    const cons = await rectOf(page, "a[href='#cons']");
    for (let k = 0; k < 4; k++) {
      const s = (await state(page))!;
      if (s.count !== "Step 3 of 4") break;
      expect(s.ringOn && near(s.ring, cons)).toBe(false);
      await page.waitForTimeout(100);
    }
    await expect.poll(async () => (await state(page))!.count, { timeout: 3000 }).toBe("Step 2 of 4");
    await page.click("#pr");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    await page.click("a[href='#all']");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 4 of 4");
    // next run with the group still open: the expander step is skipped
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), menuProc());
    await expect.poll(async () => (await state(page))?.count).toBe("Step 1 of 4");
    await page.click("h1");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 4");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  it("drops a highlighted element that the app relabels", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: reuseHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 2 }), menuProc());
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#all']"))).toBe(true);
    // the app collapses the group itself (no click on a step's element)
    await page.evaluate(() => (document.getElementById("pr") as HTMLButtonElement).click());
    await expect.poll(async () => (await state(page))!.ringOn).toBe(false);
    expect((await state(page))!.text).toContain("Looking for this element");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  // A D365-style list page: filter for a record, open it from the grid, then act on it.
  const gridHtml = `<!doctype html><html><body><h1>All purchase requisitions</h1>
<input id="filter" aria-label="Filter">
<div role="grid" id="prs"><div role="row"><div role="columnheader" aria-colindex="1">Purchase requisition</div><div role="columnheader" aria-colindex="2">Name</div></div>
${["000815", "000992", "001080"].map((n) => `<div role="row"><div role="gridcell" aria-colindex="1"><a href="#${n}">${n}</a></div><div role="gridcell" aria-colindex="2">PR ${n}</div></div>`).join("")}</div>
<button id="edit">Edit</button>
<script>
document.getElementById("filter").addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;
  var q = e.target.value.trim();
  document.querySelectorAll("#prs [role=row]").forEach(function (r, i) { if (i) r.hidden = !!q && r.textContent.indexOf(q) < 0; });
});
</script></body></html>`;
  const gridProc = (chooses: boolean): ResolvedProcess => ({
    ...proc,
    id: "grid",
    title: "Open a purchase requisition",
    steps: [
      { id: "g1", action: "type", value: "000992", learnerChooses: chooses, title: "Filter.", target: { selectors: [{ kind: "label", value: "Filter" }], tag: "input", role: "textbox", name: "Filter", label: "Filter", bbox } },
      {
        id: "g2",
        action: "click",
        learnerChooses: chooses,
        title: "Open it.",
        target: { ...tgt("link", "000992", "#prs > div:nth-of-type(3) > div:nth-of-type(1) > a"), row: { grid: "#prs", inRow: "div:nth-of-type(1) > a", column: "Purchase requisition" } },
      },
      { id: "g3", action: "click", title: "Click Edit.", target: tgt("button", "Edit", "#edit") },
    ].map((s, i) => ({ ...s, index: i + 1, url: "http://app.test/" })) as ResolvedStep[],
  });

  it("lets the learner filter for their own record and open any row of the column", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = await serve(page, { html: gridHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), gridProc(true));
    await expect.poll(async () => (await state(page))?.count).toBe("Step 1 of 3");
    await page.fill("#filter", "000815"); // not the recorded 000992
    await page.press("#filter", "Enter");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 2 of 3");
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#000815']"))).toBe(true);
    await page.click("a[href='#000815']");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 3");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  it("keeps to the recorded record when the step is not the learner's choice", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await serve(page, { html: gridHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p, { startAt: 1 }), gridProc(false));
    await expect.poll(async () => near((await state(page))!.ring, await rectOf(page, "a[href='#000992']"))).toBe(true);
    await page.click("a[href='#000815']"); // another row does not complete the step
    await page.waitForTimeout(400);
    expect((await state(page))!.count).toBe("Step 2 of 3");
    await page.close();
  }, 30_000);

  // A report dialog: every parameter is the learner's own choice.
  const calDays = Array.from({ length: 35 }, (_, i) => (i < 2 || i > 32 ? "" : String(i - 1)));
  const reportHtml = `<!doctype html><html><body><h1>Purchase requisitions report</h1>
<section aria-label="Report parameters">
<label for="from">From date</label><input id="from">
<label for="fmt">Format</label><select id="fmt"><option>PDF</option><option>Excel</option><option>CSV</option></select>
<label><input type="checkbox" id="closed"> Include closed orders</label>
<table id="cal" role="grid"><thead><tr>${"MTWTFSS".split("").map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
${Array.from({ length: 5 }, (_, w) => `<tr>${calDays.slice(w * 7, w * 7 + 7).map((d) => `<td>${d ? `<button type="button">${d}</button>` : ""}</td>`).join("")}</tr>`).join("")}
</tbody></table>
<button id="run">Run report</button></section></body></html>`;
  const reportProc = (): ResolvedProcess => ({
    ...proc,
    id: "report",
    title: "Run the report",
    steps: (
      [
        { id: "r1", action: "type", value: "1/9/2026", target: { selectors: [{ kind: "label", value: "From date" }], tag: "input", role: "textbox", name: "From date", label: "From date", bbox } },
        { id: "r2", action: "select", value: "PDF", target: { selectors: [{ kind: "label", value: "Format" }], tag: "select", role: "combobox", name: "Format", label: "Format", bbox } },
        { id: "r3", action: "check", value: "true", target: { selectors: [{ kind: "role", value: "checkbox|Include closed orders" }], tag: "input", inputType: "checkbox", role: "checkbox", name: "Include closed orders", bbox } },
        { id: "r4", action: "click", target: { ...tgt("button", "14", "#cal > tbody > tr:nth-of-type(3) > td:nth-of-type(3) > button"), row: { grid: "#cal", inRow: "td:nth-of-type(3) > button", calendar: true, inCell: "button" } } },
        { id: "r5", action: "click", learnerChooses: false, target: tgt("button", "Run report", "#run") },
      ] as Omit<ResolvedStep, "index" | "url" | "title">[]
    ).map((st, i) => ({ learnerChooses: true, ...st, title: st.id, index: i + 1, url: "http://app.test/" })),
  });

  it("accepts the learner's own date, option, check box state and calendar day", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = await serve(page, { html: reportHtml });
    await page.goto("http://app.test/");
    await page.evaluate((p) => (window as any).SteplightAssist.start(p), reportProc());
    await expect.poll(async () => (await state(page))?.count).toBe("Step 1 of 5");
    await page.fill("#from", "5/10/2026");
    await page.press("#from", "Enter");
    await expect.poll(async () => (await state(page))!.count).toBe("Step 2 of 5");
    await page.selectOption("#fmt", "CSV"); // not the recorded PDF
    await expect.poll(async () => (await state(page))!.count).toBe("Step 3 of 5");
    // a check box set "as needed" can be left as it is: the card offers Next instead of Skip
    expect(await page.evaluate(() => document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelector(".actions .fwd")!.className)).toContain("primary");
    await page.evaluate(() => document.querySelector("[data-steplight-assist]")!.shadowRoot!.querySelector<HTMLElement>(".actions .fwd")!.click());
    await expect.poll(async () => (await state(page))!.count).toBe("Step 4 of 5");
    await page.click("#cal button >> text=/^3$/"); // any day, not the recorded 14
    await expect.poll(async () => (await state(page))!.count).toBe("Step 5 of 5");
    expect(errors).toEqual([]);
    await page.close();
  }, 30_000);

  it("fallback resolver handles role|name, label, text and css selectors", async () => {
    const page = await browser.newPage();
    await serve(page);
    await page.goto("http://app.test/");
    const ids = await page.evaluate(() => {
      const r = (window as any).SteplightAssist.resolveTarget;
      const t = (selectors: unknown[]) => r({ selectors, tag: "" })?.element?.id || r({ selectors, tag: "" })?.element?.textContent || null;
      return {
        role: t([{ kind: "role", value: "button|Save" }]),
        label: t([{ kind: "label", value: "E-mail" }]),
        text: t([{ kind: "text", value: "Cancel" }]),
        css: t([{ kind: "css", value: "select#country" }]),
        healed: r({ selectors: [{ kind: "id", value: "nope" }, { kind: "label", value: "Country" }], tag: "select" })?.index,
        none: r({ selectors: [{ kind: "id", value: "nope" }], tag: "div" }),
      };
    });
    expect(ids).toEqual({ role: "save", label: "email", text: "Cancel", css: "country", healed: 1, none: null });
    await page.close();
  }, 30_000);
});
