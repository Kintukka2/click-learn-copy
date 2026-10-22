// Recording a process drafted from a guide ("Record from the guide"): every action recorded in the
// application becomes the draft step shown, or an extra step before it (src/server/recording.ts).
import fs from "node:fs";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftMatches, draftTarget } from "../src/core/draft.js";
import type { CaptureEvent, Process, Step, Target } from "../src/core/model.js";
import { createApp, type AppContext } from "../src/server/app.js";

const png = (() => {
  const p = new PNG({ width: 4, height: 4 });
  p.data.fill(120);
  return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
})();
const bbox = { x: 10, y: 10, width: 80, height: 24 };
const live = (role: string, name: string, extra: Partial<Target> = {}): Target => ({ selectors: [{ kind: "role", value: `${role}|${name}` }], tag: role === "textbox" ? "input" : role === "link" ? "a" : "button", role, name, bbox, ...extra });
const field = (label: string): Target => ({ ...live("textbox", label), selectors: [{ kind: "label", value: label }], label, inputType: "text" });
const ev = (action: CaptureEvent["action"], target: Target | undefined, value?: string): CaptureEvent => ({ action, target, value, url: "https://erp.example.com/?mi=CustPool", pageTitle: "Customer pools", viewport: { width: 1280, height: 800 }, timestamp: Date.now() });

const draft = (id: string, action: Step["action"], kind: Parameters<typeof draftTarget>[0] | null, name: string, extra: Partial<Step> = {}): Step => ({
  id,
  action,
  target: kind ? draftTarget(kind, name) : undefined,
  url: "https://erp.example.com/",
  title: kind ? `${action} ${name}` : name,
  titleEdited: !kind || undefined,
  screenshot: "guide.png",
  draft: { source: `${action} ${name} (from the guide)` },
  ...extra,
});

describe("draftMatches", () => {
  it("matches the guide's element name and a fitting action", () => {
    const d = draft("d", "click", "button", "New");
    expect(draftMatches(d, ev("click", live("button", "New")))).toBe(true);
    expect(draftMatches(d, ev("click", live("button", "New customer pool")))).toBe(true);
    expect(draftMatches(d, ev("click", live("button", "Delete")))).toBe(false);
    expect(draftMatches(d, ev("type", field("New"), "x"))).toBe(false);
    expect(draftMatches(draft("c", "check", "checkbox", "Active"), ev("click", live("checkbox", "Active")))).toBe(true);
    expect(draftMatches(draft("t", "type", "field", "From date"), ev("click", live("button", "", { field: { kind: "calendar", name: "From date" } })))).toBe(false);
    expect(draftMatches(draft("p", "press", null, "", { value: "Enter" }), ev("press", field("Pool ID"), "Enter"))).toBe(true);
    expect(draftMatches(draft("n", "note", null, "Check it"), ev("click", live("button", "Check it")))).toBe(false);
  });
});

describe("recording from a guide", () => {
  let server: Server;
  let ctx: AppContext;
  let api = "";
  let procId = "";
  let token = "";
  beforeAll(async () => {
    const r = createApp({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "sl-build-")), baseUrl: "http://localhost" });
    ctx = r.ctx;
    server = await new Promise<Server>((res) => {
      const s = r.app.listen(0, () => res(s));
    });
    api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const prj = ctx.store.createProject({ name: "D365" });
    const proc = ctx.store.createProcess(prj.id, {
      title: "Create a customer pool",
      startUrl: "https://erp.example.com/",
      steps: [
        draft("d1", "click", "link", "Accounts receivable"),
        draft("d2", "click", "button", "New"),
        draft("d3", "type", "field", "Pool ID", { value: "WHOLESALE", description: "Up to 10 characters." }),
        draft("d4", "type", "field", "From date", { learnerChooses: true, choiceHint: "today's date" }),
        draft("d5", "note", null, "Make sure the details are correct."),
        draft("d6", "click", null, "Fill in the remaining details."),
        draft("d7", "click", "button", "Save"),
      ],
    })!;
    proc.localizations = { da: { steps: { d2: { title: "Klik på **New**." } } } };
    ctx.store.saveProcess(proc);
    procId = proc.id;
  });
  afterAll(() => server?.close());

  const post = async (p: string, body: unknown) => {
    const res = await fetch(api + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const send = (stepId: string, onTarget: boolean, event: CaptureEvent) => post(`/recordings/${token}/events`, { event, screenshotDataUrl: png, build: { stepId, onTarget } });
  const steps = () => ctx.store.getProcess(procId)!.steps;

  it("starts with the plan of draft steps", async () => {
    const r = await post("/recordings", { processId: procId, build: true });
    expect(r.status).toBe(201);
    token = r.body.token;
    expect(r.body.build).toBe(true);
    const plan = r.body.plan;
    expect(plan.steps.map((s: { id: string; index: number }) => `${s.index}:${s.id}`)).toEqual(["1:d1", "2:d2", "3:d3", "4:d4", "5:d5", "6:d6", "7:d7"]);
    expect(plan.steps[0]).toMatchObject({ url: "", target: { role: "link", name: "Accounts receivable" } });
    expect(plan.steps[0].screenshot).toBeUndefined();
    expect(plan.steps[5].target).toEqual({ selectors: [], tag: "" }); // no element in the guide: never found
    expect(plan.steps[4].target).toBeUndefined();
  });

  it("records each action as the draft step shown, or as an extra step before it", async () => {
    // the guide skips opening the navigation pane: an extra step before d1
    let r = await send("d1", false, ev("click", live("button", "Modules")));
    expect(r.body).toMatchObject({ placed: "inserted", draftId: "d1", draftsLeft: 7 });
    const modules = r.body.step.id;
    // the highlighted element: d1 is recorded, keeping its id
    r = await send("d1", true, ev("click", live("link", "Accounts receivable")));
    expect(r.body).toMatchObject({ placed: "replaced", draftId: "d1", draftsLeft: 6, step: { id: "d1", title: "Click the **Accounts receivable** link." } });
    // not the highlighted element, but it has the guide's name for it
    r = await send("d2", false, ev("click", live("button", "New customer pool")));
    expect(r.body).toMatchObject({ placed: "replaced", draftId: "d2", step: { id: "d2", title: "Click **New customer pool**." } });
    // typing keeps the draft's explanation; typing again into the same field keeps the final value
    r = await send("d3", true, ev("type", field("Pool ID"), "WHOLE"));
    expect(r.body).toMatchObject({ placed: "replaced", step: { id: "d3", value: "WHOLE", description: "Up to 10 characters." } });
    r = await send("d4", false, ev("type", field("Pool ID"), "WHOLESALE"));
    expect(r.body).toMatchObject({ placed: "updated", step: { id: "d3", value: "WHOLESALE", title: "In the **Pool ID** field, enter **WHOLESALE**." } });
    // opening the calendar, then picking a day: one step, the date that went into the field
    r = await send("d4", false, ev("click", live("button", "", { selectors: [{ kind: "css", value: "#cal" }], field: { kind: "calendar", name: "From date" } })));
    expect(r.body.placed).toBe("inserted");
    const calendarShot = r.body.step.screenshot;
    r = await send("d4", true, ev("type", field("From date"), "7/1/2026"));
    expect(r.body).toMatchObject({ placed: "replaced", step: { id: "d4", value: "7/1/2026", learnerChooses: true, choiceHint: "today's date", screenshot: calendarShot } });

    const s = steps();
    expect(s.map((x) => x.id)).toEqual([modules, "d1", "d2", "d3", "d4", "d5", "d6", "d7"]);
    expect(s.slice(0, 5).every((x) => !x.draft && x.screenshot !== "guide.png")).toBe(true);
    expect(ctx.store.getProcess(procId)!.localizations.da.steps.d2).toBeUndefined(); // the draft's translation no longer fits
  });

  it("takes a screenshot of the page for a note, and the last action for a step it couldn't find", async () => {
    let r = await post(`/recordings/${token}/note`, { stepId: "d5", screenshotDataUrl: png, url: "https://erp.example.com/?mi=CustPool", viewport: { width: 4, height: 4 } });
    expect(r.status).toBe(200);
    expect(r.body.step).toMatchObject({ id: "d5", action: "note", title: "Make sure the details are correct.", url: "https://erp.example.com/?mi=CustPool", viewport: { width: 4, height: 4 } });
    expect(r.body.step.draft).toBeUndefined();

    // nothing recorded for d6 yet
    expect((await post(`/recordings/${token}/assign`, { stepId: "d6" })).status).toBe(409);
    r = await send("d6", false, ev("click", live("button", "Customer group")));
    expect(r.body.placed).toBe("inserted");
    r = await post(`/recordings/${token}/assign`, { stepId: "d6" });
    expect(r.status).toBe(200);
    expect(r.body.step).toMatchObject({ id: "d6", action: "click", title: "Click **Customer group**.", target: { name: "Customer group" } });
    expect(r.body.step.titleEdited).toBeUndefined();

    r = await send("d7", true, ev("click", live("button", "Save")));
    expect(r.body).toMatchObject({ placed: "replaced", draftsLeft: 0 });
    // after the last draft, more actions are appended
    r = await send("d7", false, ev("click", live("button", "Close")));
    expect(r.body).toMatchObject({ placed: "inserted", draftsLeft: 0 });
    expect(steps().map((x) => x.title)).toEqual([
      "Click **Modules**.",
      "Click the **Accounts receivable** link.",
      "Click **New customer pool**.",
      "In the **Pool ID** field, enter **WHOLESALE**.",
      "In the **From date** field, enter **today's date**.",
      "Make sure the details are correct.",
      "Click **Customer group**.",
      "Click **Save**.",
      "Click **Close**.",
    ]);
    expect(steps().some((x) => x.draft)).toBe(false);
  });

  it("refuses to record from a guide when no draft steps are left", async () => {
    expect((await post("/recordings", { processId: procId, build: true })).status).toBe(400);
    expect((await post(`/recordings/${token}/stop`, {})).status).toBe(200);
    expect((await post(`/recordings/${token}/assign`, { stepId: "d6" })).status).toBe(410);
  });
});
