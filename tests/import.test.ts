// Importing a written guide (Word .docx) as a draft process: the Word reader, the offline rules, the
// Claude request (against a fake API), the HTTP route, and reviewing the draft in the Studio.
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftElementOf, draftTarget, ELEMENT_KINDS } from "../src/core/draft.js";
import { createApp, type AppContext } from "../src/server/app.js";
import { readDocx } from "../src/server/docx.js";
import { decorativePictures, prepareImages } from "../src/server/guide-import.js";
import { parseInstruction, planOffline } from "../src/server/guide-plan.js";
import { brandedGuide, customerPoolGuide, solidPng, type GuideImage } from "./guide-fixture.js";

const STUDIO = path.resolve(__dirname, "../dist/studio/index.html");

async function listen(ctxDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-import-"))) {
  const r = createApp({ dataDir: ctxDir, baseUrl: "http://localhost" });
  const server = await new Promise<Server>((res) => {
    const s = r.app.listen(0, () => res(s));
  });
  return { server, ctx: r.ctx, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function jpegShot(browser: Browser): Promise<GuideImage> {
  const page = await browser.newPage({ viewport: { width: 300, height: 150 } });
  await page.setContent("<body style='margin:0;background:#2f6fed'></body>");
  const data = await page.screenshot({ type: "jpeg" });
  await page.close();
  return { type: "jpg", data, width: 300, height: 150 };
}

describe("Word reader", () => {
  it("reads headings, numbered steps with bold names, and the pictures in order", async () => {
    const doc = await readDocx(await customerPoolGuide());
    expect(doc.title).toBe("Create a customer pool");
    expect(doc.blocks[0]).toEqual({ kind: "heading", text: "Customer pools", level: 0 });
    const items = doc.blocks.filter((b) => b.kind === "item");
    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({ kind: "item", text: "Go to **Accounts receivable > Setup > Customer pools**.", level: 0, numbered: true });
    expect(items[2].text).toBe("In the **Pool ID** field, enter **WHOLESALE**.");
    expect(doc.blocks.filter((b) => b.kind === "image").map((b) => b.image)).toEqual([0, 1]);
    expect(doc.images.map((i) => i.contentType)).toEqual(["image/png", "image/png"]);
    expect(doc.images[0].data.subarray(1, 4).toString()).toBe("PNG");
  });

  it("rejects files that aren't Word documents", async () => {
    await expect(readDocx(Buffer.from("plain text"))).rejects.toThrow(/not a Word document/);
  });
});

describe("offline rules", () => {
  const one = (s: string) => {
    const r = parseInstruction(s);
    expect(r, s).toBeDefined();
    expect(r, s).toHaveLength(1);
    const st = r![0];
    return { action: st.action, kind: st.element.kind, name: st.element.name, value: st.value, ...(st.learnerChooses ? { hint: st.choiceHint } : {}) };
  };

  it("reads Steplight's own instructions and the usual phrasings", () => {
    expect(one("Click **Save**.")).toEqual({ action: "click", kind: "button", name: "Save", value: "" });
    expect(one("Select **New**.")).toEqual({ action: "click", kind: "button", name: "New", value: "" });
    expect(one("Click the **Orders** link.")).toMatchObject({ kind: "link", name: "Orders" });
    expect(one("Select the **Lines** tab.")).toMatchObject({ kind: "tab", name: "Lines" });
    expect(one("Choose **Delete** from the menu.")).toMatchObject({ kind: "menuitem", name: "Delete" });
    expect(one("In the **Name** field, enter **Fjord ApS**.")).toEqual({ action: "type", kind: "field", name: "Name", value: "Fjord ApS" });
    expect(one("Enter WHOLESALE in the Pool ID field.")).toEqual({ action: "type", kind: "field", name: "Pool ID", value: "WHOLESALE" });
    expect(one("In the **Description** field, enter a short description.")).toEqual({ action: "type", kind: "field", name: "Description", value: "", hint: "a short description" });
    expect(one("In **Country/Region**, select **Denmark**.")).toEqual({ action: "select", kind: "dropdown", name: "Country/Region", value: "Denmark" });
    expect(one("Select **Denmark** from the **Country/Region** list.")).toMatchObject({ action: "select", name: "Country/Region", value: "Denmark" });
    expect(one("Select the **Tax Liable** check box.")).toMatchObject({ action: "check", name: "Tax Liable", value: "true" });
    expect(one("Clear the **Blocked** check box.")).toMatchObject({ action: "check", name: "Blocked", value: "false" });
    expect(one("Set **Active** to **Yes**.")).toMatchObject({ action: "check", name: "Active", value: "true" });
    expect(one("Press **Enter**.")).toEqual({ action: "press", kind: "none", name: "", value: "Enter" });
  });

  it("splits a menu path into one click per entry", () => {
    expect(parseInstruction("Go to **Accounts receivable > Setup > Customer pools**.")!.map((s) => [s.action, s.element.kind, s.element.name])).toEqual([
      ["click", "link", "Accounts receivable"],
      ["click", "link", "Setup"],
      ["click", "link", "Customer pools"],
    ]);
  });

  it("leaves what it can't read to the author", () => {
    expect(parseInstruction("Make sure the details are correct.")).toBeUndefined();
    expect(parseInstruction("Click the button at the top right of the screen next to the filter")![0].flag).toMatch(/Check the element/);
  });

  it("plans the whole guide: steps, screenshots, chapter and what to check", async () => {
    const plan = planOffline(await readDocx(await customerPoolGuide()), "Customer pools.docx");
    expect(plan.title).toBe("Create a customer pool");
    expect(plan.chapter).toBe("Accounts receivable");
    expect(plan.description).toBe("Customer pools group customers so collections work can be filtered by pool.");
    expect(plan.steps.map((s) => `${s.action} ${s.element.name}`.trim())).toEqual(["click Accounts receivable", "click Setup", "click Customer pools", "click New", "type Pool ID", "type Description", "check Active", "click Save", "note"]);
    // the screenshot after a line shows its steps, and carries on until the next screenshot
    expect(plan.steps.map((s) => s.image)).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect(plan.steps[3].description).toBe("A new pool row opens.");
    expect(plan.steps[6].source).toBe("Select the **Active** check box, then click **Save**.");
    expect(plan.steps.filter((s) => s.flag).map((s) => s.action)).toEqual(["note"]);
  });
});

describe("the guide's pictures", () => {
  it("leaves out logos and icons, and keeps a screenshot to its part of the guide", async () => {
    const doc = await readDocx(await brandedGuide());
    // the logo is one picture, however often it is shown
    expect(doc.images).toHaveLength(3);
    const [logo, screen, icon] = [0, 1, 2];
    expect(doc.blocks.filter((b) => b.kind === "image").map((b) => b.image)).toEqual([logo, screen, icon, logo]);
    const { prepared } = await prepareImages(doc.images, new Set());
    expect([...decorativePictures(doc, prepared)].sort()).toEqual([logo, icon]);
    const plan = planOffline(doc, "Daily General Journal.docx", decorativePictures(doc, prepared));
    expect(plan.steps.map((st) => `${st.element.name}:${st.image}`)).toEqual([`New:${screen}`, `Attach:${screen}`, "Post:null", "Close:null"]);
  });
});

describe("draft elements", () => {
  it("builds selectors from the name and reads the kind back", () => {
    expect(draftTarget("button", "**New**")).toEqual({ selectors: [{ kind: "role", value: "button|New" }, { kind: "text", value: "New" }], tag: "button", role: "button", name: "New", label: undefined, inputType: undefined });
    expect(draftTarget("field", "Pool ID").selectors).toEqual([
      { kind: "label", value: "Pool ID" },
      { kind: "role", value: "textbox|Pool ID" },
    ]);
    for (const { kind } of ELEMENT_KINDS) expect(draftElementOf(draftTarget(kind, "X"))).toEqual({ kind, name: "X" });
  });
});

describe("import route", () => {
  let browser: Browser;
  let server: Server;
  let ctx: AppContext;
  let origin = "";
  const saved = { ai: process.env.STEPLIGHT_AI, key: process.env.ANTHROPIC_API_KEY, base: process.env.ANTHROPIC_BASE_URL };
  const restore = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));

  beforeAll(async () => {
    browser = await chromium.launch();
    ({ server, ctx, origin } = await listen());
  });
  afterAll(async () => {
    restore("STEPLIGHT_AI", saved.ai);
    restore("ANTHROPIC_API_KEY", saved.key);
    restore("ANTHROPIC_BASE_URL", saved.base);
    await browser?.close();
    server?.close();
  });

  const post = (pid: string, body: Buffer, q = "fileName=Customer%20pools.docx") => fetch(`${origin}/api/projects/${pid}/import-guide?${q}`, { method: "POST", body: new Uint8Array(body) });

  it("drafts a process with the guide's screenshots as PNG, offline", async () => {
    process.env.STEPLIGHT_AI = "off";
    const prj = ctx.store.createProject({ name: "D365" });
    const startUrl = "https://erp.example.com/?cmp=usmf&mi=DefaultDashboard";
    const res = await post(prj.id, await customerPoolGuide({ list: await jpegShot(browser), form: solidPng(320, 200) }), `fileName=Customer%20pools.docx&startUrl=${encodeURIComponent(startUrl)}`);
    expect(res.status).toBe(201);
    const { process: proc, provider } = await res.json();
    expect(provider).toBe("offline");
    expect(proc).toMatchObject({ title: "Create a customer pool", chapter: "Accounts receivable", startUrl, importedFrom: { fileName: "Customer pools.docx", provider: "offline" } });
    expect(ctx.store.getProject(prj.id)!.processIds).toEqual([proc.id]);

    const [first, , , clickNew, poolId, description] = proc.steps;
    expect(first).toMatchObject({ action: "click", title: "Click the **Accounts receivable** link.", url: startUrl, viewport: { width: 300, height: 150 }, draft: { source: "Go to **Accounts receivable > Setup > Customer pools**." } });
    expect(first.target).toMatchObject({ role: "link", name: "Accounts receivable" });
    expect(first.target.bbox).toBeUndefined();
    expect(clickNew).toMatchObject({ title: "Click **New**.", description: "A new pool row opens.", viewport: { width: 320, height: 200 } });
    expect(poolId).toMatchObject({ action: "type", value: "WHOLESALE", title: "In the **Pool ID** field, enter **WHOLESALE**." });
    expect(description).toMatchObject({ action: "type", learnerChooses: true, choiceHint: "a description" });
    // the JPEG was converted: every screenshot is a PNG file in the project's media folder
    const shots = [...new Set(proc.steps.map((s: { screenshot?: string }) => s.screenshot))] as string[];
    expect(shots).toHaveLength(2);
    for (const f of shots) expect(fs.readFileSync(ctx.store.mediaPath(prj.id, f)).subarray(1, 4).toString()).toBe("PNG");
    const note = proc.steps[proc.steps.length - 1];
    expect(note).toMatchObject({ action: "note", title: "Make sure the details are correct before you continue.", titleEdited: true });
    expect(note.draft.flag).toBeTruthy();
  });

  it("uses no logos as screenshots, and no pictures at all when told so", async () => {
    process.env.STEPLIGHT_AI = "off";
    const prj = ctx.store.createProject({ name: "Branded" });
    const withPictures = (await (await post(prj.id, await brandedGuide(), "fileName=Journal.docx")).json()).process;
    expect(withPictures.steps.map((st: { viewport?: { width: number } }) => st.viewport?.width ?? null)).toEqual([800, 800, null, null]);
    const without = (await (await post(prj.id, await brandedGuide(), "fileName=Journal.docx&pictures=0")).json()).process;
    expect(without.steps.map((st: { screenshot?: string }) => st.screenshot ?? null)).toEqual([null, null, null, null]);
    expect(without.steps.map((st: { title: string }) => st.title)).toEqual(withPictures.steps.map((st: { title: string }) => st.title));
  });

  it("refuses what it can't import", async () => {
    const prj = ctx.store.createProject({ name: "Other" });
    const bad = await post(prj.id, Buffer.from("not a zip"));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/not a Word document/);
    expect((await post("prj_missing", await customerPoolGuide())).status).toBe(404);
    expect((await fetch(`${origin}/api/projects/${prj.id}/import-guide`, { method: "POST" })).status).toBe(400);
  });

  it("asks Claude for a structured plan with the guide's screenshots, and falls back to the rules", async () => {
    let seen: { body: Record<string, any>; beta: string } | undefined;
    let status = 200;
    const plan = {
      title: "Create a customer pool",
      description: "Group customers for collections.",
      chapter: "Accounts receivable",
      appName: "Dynamics 365 Finance",
      steps: [
        { action: "click", element: { kind: "button", name: "New" }, value: "", learnerChooses: false, choiceHint: "", description: "", source: "Click **New**.", image: 2, flag: "", added: false },
        { action: "type", element: { kind: "field", name: "Pool ID" }, value: "WHOLESALE", learnerChooses: true, choiceHint: "an ID for the pool", description: "", source: "In the **Pool ID** field, enter **WHOLESALE**.", image: 2, flag: "", added: false },
        { action: "click", element: { kind: "button", name: "Save" }, value: "", learnerChooses: false, choiceHint: "", description: "", source: "", image: null, flag: "The guide doesn't say to save.", added: true },
        { action: "click", element: { kind: "none", name: "" }, value: "", learnerChooses: false, choiceHint: "", description: "", source: "Fill in the details as required.", image: 7, flag: "Vague.", added: false },
      ],
    };
    const fake = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        seen = { body: JSON.parse(raw), beta: String(req.headers["anthropic-beta"] ?? "") };
        if (status !== 200) {
          res.writeHead(status, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad request" } }));
        }
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const send = (event: string, data: object) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
        send("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
        send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
        const json = JSON.stringify(plan);
        send("content_block_delta", { index: 0, delta: { type: "text_delta", text: json.slice(0, 40) } });
        send("content_block_delta", { index: 0, delta: { type: "text_delta", text: json.slice(40) } });
        send("content_block_stop", { index: 0 });
        send("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 100 } });
        send("message_stop", {});
        res.end();
      });
    });
    await new Promise<void>((r) => fake.listen(0, r));
    try {
      delete process.env.STEPLIGHT_AI;
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
      const prj = ctx.store.createProject({ name: "With Claude" });
      const guide = await customerPoolGuide({ list: await jpegShot(browser), form: solidPng(320, 200) });
      const res = await post(prj.id, guide);
      expect(res.status).toBe(201);
      const { process: proc, provider, warning } = await res.json();
      expect(provider).toBe("claude");
      expect(warning).toBeUndefined();

      const body = seen!.body;
      expect(seen!.beta).toContain("server-side-fallback-2026-07-01");
      expect(body).toMatchObject({ model: "claude-opus-5-5", stream: true, fallbacks: "default", output_config: { effort: "medium", format: { type: "json_schema" } } });
      const content = body.messages[0].content as { type: string; text?: string; source?: { media_type: string } }[];
      expect(content.filter((c) => c.type === "image").map((c) => c.source!.media_type)).toEqual(["image/jpeg", "image/png"]);
      expect(content[0]).toEqual({ type: "text", text: "Image 1:" });
      const guideText = content[content.length - 1].text!;
      expect(guideText).toContain("Numbered item: Go to **Accounts receivable > Setup > Customer pools**.");
      expect(guideText).toContain("] Image 2");

      expect(proc).toMatchObject({ title: "Create a customer pool", chapter: "Accounts receivable", appName: "Dynamics 365 Finance", importedFrom: { provider: "claude" } });
      const [clickNew, poolId, save, vague] = proc.steps;
      expect(clickNew).toMatchObject({ title: "Click **New**.", viewport: { width: 320, height: 200 } }); // image 2 → the second picture
      expect(poolId).toMatchObject({ learnerChooses: true, choiceHint: "an ID for the pool", title: "In the **Pool ID** field, enter **an ID for the pool**." });
      expect(save).toMatchObject({ title: "Click **Save**.", draft: { source: "Save", added: true, flag: "The guide doesn't say to save." } });
      expect(save.screenshot).toBeUndefined();
      expect(vague).toMatchObject({ action: "click", title: "Fill in the details as required.", titleEdited: true, draft: { flag: "Vague." } });
      expect(vague.target).toBeUndefined();
      expect(vague.screenshot).toBeUndefined(); // image 7 doesn't exist

      // Claude refuses the request: the rules read the guide instead, and the author is told
      status = 400;
      const fallback = await (await post(prj.id, guide)).json();
      expect(fallback.provider).toBe("offline");
      expect(fallback.warning).toMatch(/simple rules/);
      expect(fallback.process.steps).toHaveLength(9);
    } finally {
      fake.close();
    }
  });
});

describe.skipIf(!fs.existsSync(STUDIO))("importing in the Studio", () => {
  let browser: Browser;
  let server: Server;
  let ctx: AppContext;
  let origin = "";

  beforeAll(async () => {
    process.env.STEPLIGHT_AI = "off";
    browser = await chromium.launch();
    ({ server, ctx, origin } = await listen());
  });
  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it("imports a guide, opens the draft and walks through what to check", async () => {
    const prj = ctx.store.createProject({ name: "D365" });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sl-guide-")), "Customer pools.docx");
    fs.writeFileSync(file, await customerPoolGuide());
    const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
    await page.goto(`${origin}/studio/projects/${prj.id}`);
    await page.click("[data-testid=import-guide]");
    await page.setInputFiles("[data-testid=guide-file]", file);
    await page.fill("#imp-url", "https://erp.example.com/?cmp=usmf");
    expect(await page.isChecked("[data-testid=pictures-toggle] input")).toBe(true);
    await page.click("[data-testid=run-import]");
    await page.waitForSelector("[data-testid=draft-banner]");
    const proc = ctx.store.listProcesses(prj.id)[0];
    expect(page.url()).toContain(`/processes/${proc.id}`);
    expect(await page.textContent("[data-testid=draft-banner]")).toContain("Customer pools.docx");
    expect(await page.locator("[data-testid=step-check]").count()).toBe(1);
    // no extension in this browser: Finalise the guide says what it needs
    await page.click("[data-testid=finalise]");
    await page.waitForSelector("[data-testid=finalise-help]");
    expect(await page.textContent("[data-testid=finalise-help]")).toContain(`connected to this server: ${origin}`);

    // jump to the flagged step, see what the guide says, and mark it as checked
    await page.click("[data-testid=next-to-check]");
    const flagged = proc.steps[proc.steps.length - 1];
    expect(await page.getAttribute(`[data-step-id=${flagged.id}]`, "aria-selected")).toBe("true");
    expect(await page.textContent("[data-testid=guide-source]")).toContain("Make sure the details are correct");
    await page.click("[data-testid=mark-checked]");
    await expect.poll(() => ctx.store.getProcess(proc.id)!.steps.at(-1)!.draft).toEqual({ source: flagged.draft!.source });
    await expect.poll(() => page.locator("[data-testid=step-check]").count()).toBe(0);

    // name the element of a step: the instruction follows
    await page.click(`[data-step-id=${proc.steps[3].id}]`);
    await page.fill("[data-testid=element-name]", "New pool");
    await page.press("[data-testid=element-name]", "Enter");
    await expect.poll(() => ctx.store.getProcess(proc.id)!.steps[3].title).toBe("Click **New pool**.");
    await expect.poll(() => page.textContent(`[data-step-id=${proc.steps[3].id}] .step-title`)).toBe("Click New pool.");
    // coming back to the window keeps the undo history of edits made here
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(300);
    expect(await page.isDisabled("[data-testid=undo]")).toBe(false);
    // steps recorded from the guide in the application's tab show up on coming back
    const recorded = ctx.store.getProcess(proc.id)!;
    delete recorded.steps[0].draft;
    ctx.store.saveProcess(recorded);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => page.locator(`[data-step-id=${proc.steps[0].id}] .step-flag`).allTextContents(), { timeout: 5000 }).not.toContain("draft");
    expect(await page.textContent("[data-testid=draft-banner]")).toContain("8 of 9 steps not recorded yet");
    expect(await page.isDisabled("[data-testid=undo]")).toBe(true); // the server changed the process

    // the start URL is remembered for the next import into this project
    await page.goto(`${origin}/studio/projects/${prj.id}`);
    await page.click("[data-testid=import-guide]");
    expect(await page.inputValue("#imp-url")).toBe("https://erp.example.com/?cmp=usmf");
    await page.close();
  });
});
