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
  });

  it("keeps source texts for the source language", () => {
    const r = resolveProcess(sampleProcess(), "en");
    expect(r.steps[1].title).toBe("Click **Save**.");
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
});
