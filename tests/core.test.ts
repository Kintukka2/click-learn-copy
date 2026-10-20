import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { instructionFor, plainText, richText, textRuns, ui } from "../src/core/instructions.js";
import type { CaptureEvent, Process, Target } from "../src/core/model.js";
import { resolveProcess } from "../src/core/resolve.js";
import { SearchIndex } from "../src/core/search.js";
import { applyCapture } from "../src/server/recording.js";
import { Store } from "../src/server/store.js";

const button = (name: string): Target => ({ selectors: [{ kind: "role", value: `button|${name}` }], tag: "button", role: "button", name, bbox: { x: 10, y: 10, width: 80, height: 30 } });
const field = (label: string): Target => ({ selectors: [{ kind: "label", value: label }], tag: "input", inputType: "text", role: "textbox", name: label, label, bbox: { x: 10, y: 50, width: 200, height: 30 } });

describe("instructions", () => {
  it("writes natural instructions per action", () => {
    expect(instructionFor({ action: "click", target: button("Save") })).toBe("Click **Save**.");
    expect(instructionFor({ action: "type", target: field("Customer name"), value: "Contoso" })).toBe("In the **Customer name** field, enter **Contoso**.");
    expect(instructionFor({ action: "select", target: { ...field("Country"), tag: "select", role: "combobox" }, value: "Denmark" })).toBe("In **Country**, select **Denmark**.");
    expect(instructionFor({ action: "check", target: { ...field("Tax liable"), inputType: "checkbox", role: "checkbox" }, value: "false" })).toBe("Clear the **Tax liable** check box.");
    expect(instructionFor({ action: "press", value: "Enter" })).toBe("Press **Enter**.");
  });

  it("avoids a double full stop after abbreviations", () => {
    expect(instructionFor({ action: "type", target: field("Eksternt bilagsnr."), value: "X-1" }, "da")).toBe("Indtast **X-1** i feltet **Eksternt bilagsnr.**");
    expect(instructionFor({ action: "type", target: field("Name"), value: "Contoso Ltd." })).toBe("In the **Name** field, enter **Contoso Ltd.**");
  });

  it("words steps where the learner picks the value or the row", () => {
    const link: Target = { ...button("000992"), tag: "a", role: "link", row: { grid: "#grid", inRow: "td:nth-of-type(1) > a", column: "Purchase requisition" } };
    expect(instructionFor({ action: "type", target: field("Filter"), value: "000992", learnerChooses: true })).toBe("In the **Filter** field, enter the value you need.");
    expect(instructionFor({ action: "click", target: link, learnerChooses: true })).toBe("In the **Purchase requisition** column, click the record you need.");
    expect(instructionFor({ action: "click", target: { ...link, row: { grid: "#grid", inRow: "td > a" } }, learnerChooses: true })).toBe("Click the record you need in the list.");
    expect(instructionFor({ action: "click", target: link, learnerChooses: true }, "de")).toBe("Klicken Sie in der Spalte **Purchase requisition** auf den gewünschten Datensatz.");
    // without a row, a click step keeps its normal wording
    expect(instructionFor({ action: "click", target: button("Save"), learnerChooses: true })).toBe("Click **Save**.");
  });

  it("masks sensitive values", () => {
    const t = instructionFor({ action: "type", target: field("Password"), value: "hunter2", sensitive: true });
    expect(t).not.toContain("hunter2");
    expect(t).toBe("In the **Password** field, enter your password.");
  });

  it("localizes, using localized UI names when provided", () => {
    expect(instructionFor({ action: "click", target: button("Save"), name: "Gem" }, "da")).toBe("Klik på **Gem**.");
    expect(instructionFor({ action: "click", target: button("Save"), name: "Speichern" }, "de")).toBe("Klicken Sie auf **Speichern**.");
    expect(ui("de", "next")).toBe("Weiter");
    expect(ui("xx", "next")).toBe("Next");
  });

  it("renders **bold** safely", () => {
    expect(richText("Click **<b>x</b>**")).toBe("Click <strong>&lt;b&gt;x&lt;/b&gt;</strong>");
    expect(textRuns("Click **Save** now")).toEqual([
      { text: "Click ", bold: false },
      { text: "Save", bold: true },
      { text: " now", bold: false },
    ]);
    expect(plainText("Click **Save**.")).toBe("Click Save.");
  });
});

function sampleProcess(): Process {
  return {
    id: "prc_1",
    projectId: "prj_1",
    title: "Create customer",
    lang: "en",
    startUrl: "http://x/#/c",
    steps: [
      { id: "s1", action: "type", target: field("Name"), value: "Contoso", url: "u", title: "In the **Name** field, enter **Contoso**.", screenshot: "a.png" },
      { id: "s2", action: "click", target: button("Save"), url: "u", title: "Click **Save**.", screenshot: "b.png" },
      { id: "s3", action: "type", target: field("Password"), value: "secret", sensitive: true, url: "u", title: "x" },
    ],
    localizations: { da: { steps: { s2: { name: "Gem", screenshot: "b-da.png", bbox: { x: 1, y: 2, width: 3, height: 4 } } } } },
    createdAt: "",
    updatedAt: "",
  };
}

describe("resolveProcess", () => {
  it("resolves localized names, screenshots and masks secrets", () => {
    const r = resolveProcess(sampleProcess(), "da", { media: (f) => `/m/${f}` });
    expect(r.steps[1].title).toBe("Klik på **Gem**.");
    expect(r.steps[1].screenshot).toBe("/m/b-da.png");
    expect(r.steps[1].bbox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(r.steps[0].screenshot).toBe("/m/a.png");
    expect(r.steps[2].value).toBeUndefined();
    expect(r.steps.map((s) => s.index)).toEqual([1, 2, 3]);
    // Assist matches live elements against the name shown in the localized UI
    expect(r.steps[1].target?.name).toBe("Gem");
    expect(r.steps[1].target?.selectors).toEqual(sampleProcess().steps[1].target!.selectors);
    expect(r.steps[0].target?.name).toBe(sampleProcess().steps[0].target!.name);
  });

  it("keeps source texts for the source language", () => {
    const r = resolveProcess(sampleProcess(), "en");
    expect(r.steps[1].title).toBe("Click **Save**.");
    expect(r.steps[1].target?.name).toBe(sampleProcess().steps[1].target!.name);
  });
});

describe("search", () => {
  it("ranks the relevant process first and supports prefixes", () => {
    const idx = new SearchIndex([
      { id: "a", processId: "a", title: "Create a new customer", text: "customer name country save" },
      { id: "b", processId: "b", title: "Post a sales order", text: "order lines item quantity post" },
      { id: "c", processId: "c", title: "Approve a purchase invoice", text: "invoice approve comment" },
    ]);
    expect(idx.search("how do I add a customer")[0].doc.id).toBe("a");
    expect(idx.search("posting orders")[0].doc.id).toBe("b");
    expect(idx.search("invo")[0].doc.id).toBe("c");
    expect(idx.search("zzz")).toEqual([]);
  });
});

describe("recording noise reduction", () => {
  const ev = (e: Partial<CaptureEvent>): CaptureEvent => ({ action: "click", url: "http://x/#/c", viewport: { width: 1280, height: 800 }, timestamp: Date.now(), ...e });

  it("merges focus-click + typing, and repeated typing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-store-"));
    const store = new Store(dir);
    const project = store.createProject({ name: "T" });
    let proc = store.createProcess(project.id, { title: "P" })!;
    const shot = "data:image/png;base64,iVBORw0KGgo=";
    applyCapture(store, proc, { event: ev({ action: "click", target: field("Name") }), screenshotDataUrl: shot });
    proc = store.getProcess(proc.id)!;
    applyCapture(store, proc, { event: ev({ action: "type", target: field("Name"), value: "Con" }) });
    proc = store.getProcess(proc.id)!;
    applyCapture(store, proc, { event: ev({ action: "type", target: field("Name"), value: "Contoso" }) });
    proc = store.getProcess(proc.id)!;
    applyCapture(store, proc, { event: ev({ action: "click", target: button("Save") }), screenshotDataUrl: shot });
    proc = store.getProcess(proc.id)!;
    expect(proc.steps.map((s) => s.action)).toEqual(["type", "click"]);
    expect(proc.steps[0].value).toBe("Contoso");
    expect(proc.steps[0].screenshot).toBeTruthy(); // inherited from the focusing click
    expect(proc.steps[0].title).toBe("In the **Name** field, enter **Contoso**.");
    expect(proc.startUrl).toBe("http://x/#/c");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("marks filtering for a record and clicking its row as the learner's choice", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-store-"));
    const store = new Store(dir);
    const project = store.createProject({ name: "T" });
    let proc = store.createProcess(project.id, { title: "P" })!;
    const row = { grid: "#grid", inRow: "td:nth-of-type(1) > a", column: "Purchase requisition" };
    const link = (name: string): Target => ({ ...button(name), tag: "a", role: "link", selectors: [{ kind: "role", value: `link|${name}` }], row });
    const add = (e: Partial<CaptureEvent>) => {
      applyCapture(store, proc, { event: ev(e) });
      proc = store.getProcess(proc.id)!;
    };
    add({ action: "type", target: field("Filter"), value: "000992" });
    add({ action: "press", value: "Enter" });
    add({ action: "click", target: link("000992") });
    add({ action: "click", target: button("Edit") });
    expect(proc.steps.map((s) => !!s.learnerChooses)).toEqual([true, false, true, false]);
    expect(proc.steps[0].title).toBe("In the **Filter** field, enter the value you need.");
    expect(proc.steps[2].title).toBe("In the **Purchase requisition** column, click the record you need.");
    // a row clicked without searching for it first stays the recorded record
    add({ action: "type", target: field("Quantity"), value: "12" });
    add({ action: "click", target: link("000815") });
    expect(proc.steps.slice(-2).map((s) => !!s.learnerChooses)).toEqual([false, false]);
    expect(resolveProcess(proc, "en").steps[2].learnerChooses).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
