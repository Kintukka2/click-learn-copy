// Capture library: selector generation, accessible names, resolution/healing and event semantics,
// exercised in real Chromium with the bundled capture script (no jsdom).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { captureScript } from "../src/capture/bundle.js";
import { looksGeneratedId } from "../src/capture/selectors.js";
import { withUrlParam } from "../src/replay/replay.js";
import type { CaptureEvent, Target } from "../src/core/model.js";

let browser: Browser;
let page: Page;
let script: string;

const FIXTURE = `<!doctype html><html><head><title>Fixture</title></head><body>
<main>
  <h1>Customer Card</h1>
  <div role="toolbar" aria-label="Actions">
    <button id="customer-save" type="button"><svg aria-hidden="true" width="10" height="10"></svg><span>Save</span></button>
    <button id="ext-gen1234" type="button">Delete</button>
    <button data-testid="print-btn" id="print" type="button">Print</button>
    <button type="button" aria-label="Close card">×</button>
  </div>
  <section aria-labelledby="ft-general"><h2 id="ft-general">General</h2>
    <label for="name">Name</label><input id="name">
    <label>City <input id="city"></label>
    <span id="lbl-country">Country/Region</span><select id="country" aria-labelledby="lbl-country"><option value="">-</option><option value="DK">Denmark</option><option value="DE">Germany</option></select>
    <input placeholder="Search customers" type="search">
    <label for="tax"><input type="checkbox" id="tax">Tax Liable</label>
    <label for="pw">Password</label><input id="pw" type="password">
    <button type="button" title="More options"></button>
    <button type="button"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Refresh"></button>
    <button type="button" class="edit">Edit</button>
  </section>
  <section aria-labelledby="ft-invoicing"><h2 id="ft-invoicing">Invoicing</h2>
    <button type="button" class="edit">Edit</button>
    <a href="#/customers/C00040">C00040</a>
    <button type="button" style="display:none">Hidden</button>
  </section>
  <div data-steplight-ignore><button type="button" id="overlay-next">Next</button></div>
</main></body></html>`;

async function load(html = FIXTURE) {
  await page.setContent(html);
  await page.addScriptTag({ content: script });
}

function describeEl(sel: string): Promise<Target> {
  return page.locator(sel).evaluate((el) => (window as any).SteplightCapture.describe(el));
}

async function startCapture() {
  await page.evaluate(() => {
    (window as any).__events = [];
    (window as any).SteplightCapture.start((ev: unknown) => (window as any).__events.push(ev));
  });
}

async function events(): Promise<CaptureEvent[]> {
  await page.waitForTimeout(50);
  return page.evaluate(() => (window as any).__events);
}

beforeAll(async () => {
  script = await captureScript();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});

afterAll(async () => {
  await browser?.close();
});

describe("generated id heuristic", () => {
  it("rejects auto-generated ids and keeps meaningful ones", () => {
    for (const id of ["ext-gen1234", ":r1:", "ember123", "mui-42", "a8f3k2x9", "3c4e", "field_0042", "c4ca4238a0b9", "550e8400-e29b-41d4-a716-446655440000"]) expect(looksGeneratedId(id), id).toBe(true);
    for (const id of ["customer-save", "customer-name", "line-1-item", "h2", "order-post", "tell-me", "btnSave"]) expect(looksGeneratedId(id), id).toBe(false);
  });
});

describe("withUrlParam", () => {
  it("puts lang into the hash query for hash routes and the search string otherwise", () => {
    expect(withUrlParam("http://x/demo-erp/#/customers?reset=1", "lang", "da")).toBe("http://x/demo-erp/#/customers?reset=1&lang=da");
    expect(withUrlParam("http://x/demo-erp/#/customers?lang=en", "lang", "de")).toBe("http://x/demo-erp/#/customers?lang=de");
    expect(withUrlParam("http://x/app/page?a=1", "lang", "da")).toBe("http://x/app/page?a=1&lang=da");
    expect(withUrlParam("http://x/app/page#section", "lang", "da")).toBe("http://x/app/page?lang=da#section");
  });
});

describe("describe(): role, accessible name, label, context and selectors", () => {
  beforeAll(() => load());

  it("orders selectors by robustness: testid > id > role > text > css", async () => {
    const t = await describeEl("[data-testid=print-btn]");
    expect(t.selectors.map((s) => s.kind)).toEqual(["testid", "id", "role", "text", "css"]);
    expect(t.selectors[0].value).toBe("print-btn");
    expect(t.selectors[2].value).toBe("button|Print");
  });

  it("names a button from its text, skipping aria-hidden icons, and keeps a stable id first", async () => {
    const t = await describeEl("#customer-save");
    expect(t).toMatchObject({ tag: "button", role: "button", name: "Save", context: "Actions" });
    expect(t.selectors[0]).toEqual({ kind: "id", value: "customer-save" });
    expect(t.selectors.some((s) => s.kind === "role" && s.value === "button|Save")).toBe(true);
    expect(t.bbox.width).toBeGreaterThan(0);
  });

  it("skips generated-looking ids", async () => {
    const t = await describeEl("#ext-gen1234");
    expect(t.selectors.some((s) => s.kind === "id")).toBe(false);
    expect(t.selectors[0]).toEqual({ kind: "role", value: "button|Delete" });
  });

  it("computes names from aria-label, title and img alt", async () => {
    expect((await describeEl("button[aria-label='Close card']")).name).toBe("Close card");
    expect((await describeEl("button[title='More options']")).name).toBe("More options");
    expect((await describeEl("button:has(img)")).name).toBe("Refresh");
  });

  it("labels form controls via <label for>, a wrapping label and aria-labelledby", async () => {
    const name = await describeEl("#name");
    expect(name).toMatchObject({ role: "textbox", name: "Name", label: "Name", context: "General" });
    expect(name.selectors.map((s) => s.kind)).toEqual(["id", "role", "label", "css"]);
    expect(await describeEl("#city")).toMatchObject({ label: "City", name: "City" });
    expect(await describeEl("#country")).toMatchObject({ role: "combobox", label: "Country/Region" });
    const cb = await describeEl("#tax");
    expect(cb).toMatchObject({ role: "checkbox", label: "Tax Liable", inputType: "checkbox" });
  });

  it("uses the placeholder when there is no label", async () => {
    const t = await describeEl("input[type=search]");
    expect(t.role).toBe("searchbox");
    expect(t.selectors.find((s) => s.kind === "placeholder")?.value).toBe("Search customers");
  });

  it("keeps a non-unique role selector only when the context disambiguates it", async () => {
    const t = await describeEl("section[aria-labelledby=ft-invoicing] .edit");
    expect(t.context).toBe("Invoicing");
    expect(t.selectors.find((s) => s.kind === "role")?.value).toBe("button|Edit");
  });
});

describe("resolve(): first visible, unique match; index > 0 means healed", () => {
  beforeAll(() => load());

  async function resolve(target: Partial<Target>) {
    return page.evaluate((t) => {
      const r = (window as any).SteplightCapture.resolve(t);
      return r ? { index: r.index, selector: r.selector, id: r.element.id, text: r.element.textContent.trim() } : null;
    }, { bbox: { x: 0, y: 0, width: 0, height: 0 }, tag: "button", ...target } as Target);
  }

  it("matches the first selector when it still works", async () => {
    const t = await describeEl("#customer-save");
    expect(await resolve(t)).toMatchObject({ index: 0, id: "customer-save" });
  });

  it("heals with a fallback selector when the id was renamed", async () => {
    const t = await describeEl("#customer-save");
    await page.evaluate(() => (document.getElementById("customer-save")!.id = "save-customer-action"));
    const r = await resolve(t);
    expect(r).toMatchObject({ index: 1, id: "save-customer-action" });
    expect(r!.selector).toEqual({ kind: "role", value: "button|Save" });
    await page.evaluate(() => (document.getElementById("save-customer-action")!.id = "customer-save"));
  });

  it("resolves label, placeholder, text and css selectors", async () => {
    expect(await resolve({ selectors: [{ kind: "label", value: "city" }] })).toMatchObject({ id: "city" });
    expect(await resolve({ selectors: [{ kind: "placeholder", value: "Search customers" }] })).not.toBeNull();
    expect(await resolve({ selectors: [{ kind: "text", value: "C00040" }] })).toMatchObject({ text: "C00040" });
    expect(await resolve({ selectors: [{ kind: "css", value: "#print" }] })).toMatchObject({ id: "print" });
  });

  it("requires uniqueness (or a matching context) and visibility", async () => {
    expect(await resolve({ selectors: [{ kind: "role", value: "button|Edit" }] })).toBeNull();
    expect(await resolve({ selectors: [{ kind: "role", value: "button|Edit" }], context: "General" })).toMatchObject({ index: 0 });
    expect(await resolve({ selectors: [{ kind: "text", value: "Hidden" }] })).toBeNull();
    expect(await resolve({ selectors: [{ kind: "id", value: "overlay-next" }] })).toBeNull(); // inside data-steplight-ignore
    expect(await resolve({ selectors: [{ kind: "id", value: "nope" }, { kind: "css", value: "main > div[role=toolbar] > button:nth-of-type(3)" }] })).toMatchObject({ index: 1, id: "print" });
  });
});

describe("event capture semantics", () => {
  it("click fires on pointerdown with the actionable element as target", async () => {
    await load();
    await startCapture();
    await page.locator("#customer-save span").click();
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ action: "click", target: { tag: "button", name: "Save" }, pageTitle: "Fixture", viewport: { width: 1280, height: 800 } });
  });

  it("type fires on change with the final value; password values are sensitive", async () => {
    await load();
    await startCapture();
    await page.locator("#name").fill("Nordlys Møbler A/S");
    await page.locator("#name").blur();
    await page.locator("#pw").fill("s3cret");
    await page.locator("#pw").blur();
    const ev = await events();
    expect(ev.map((e) => e.action)).toEqual(["type", "type"]);
    expect(ev[0]).toMatchObject({ value: "Nordlys Møbler A/S", target: { label: "Name" } });
    expect(ev[0].sensitive).toBeUndefined();
    expect(ev[1]).toMatchObject({ sensitive: true, target: { inputType: "password" } });
  });

  it("select reports the option label as value and the option value separately", async () => {
    await load();
    await startCapture();
    await page.locator("#country").selectOption("DE");
    const ev = await events();
    expect(ev).toEqual([expect.objectContaining({ action: "select", value: "Germany", optionValue: "DE" })]);
  });

  it("check fires once; clicking its <label> is not a separate step", async () => {
    await load();
    await startCapture();
    await page.getByText("Tax Liable").click(); // label click toggles the checkbox
    await page.locator("#tax").click();
    const ev = await events();
    expect(ev.map((e) => [e.action, e.value])).toEqual([
      ["check", "true"],
      ["check", "false"],
    ]);
  });

  it("Enter in a field flushes the typed value, then records the key press", async () => {
    await load();
    await startCapture();
    await page.locator("#city").click();
    await page.keyboard.type("Hellerup");
    await page.keyboard.press("Enter");
    await page.locator("#city").blur(); // change after Enter must not duplicate the type step
    const ev = await events();
    expect(ev.map((e) => [e.action, e.value])).toEqual([
      ["type", "Hellerup"],
      ["press", "Enter"],
    ]);
  });

  it("keeps the order when a click blurs a field that has pending text", async () => {
    await load();
    await startCapture();
    await page.locator("#name").click();
    await page.keyboard.type("Fjord ApS");
    await page.locator("#customer-save").click();
    const ev = await events();
    expect(ev.map((e) => e.action)).toEqual(["type", "click"]);
    expect(ev[0].value).toBe("Fjord ApS");
  });

  it("ignores events inside [data-steplight-ignore] and stops cleanly", async () => {
    await load();
    await startCapture();
    await page.locator("#overlay-next").click();
    await page.evaluate(() => (window as any).SteplightCapture.stop());
    await page.locator("#print").click();
    expect(await events()).toEqual([]);
  });
});
