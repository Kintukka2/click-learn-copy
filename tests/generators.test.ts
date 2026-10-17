// Document generators: docx, pdf, pptx, html (+ annotate/common helpers).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { plainText } from "../src/core/instructions.js";
import type { Process, Project, ResolvedStep } from "../src/core/model.js";
import { resolveProcess } from "../src/core/resolve.js";
import { annotateScreenshot, focusScreenshot, parseHex } from "../src/generators/annotate.js";
import { brandOf, label, outputFilename, parseLogo, stepTitle } from "../src/generators/common.js";
import { generateDocx } from "../src/generators/docx.js";
import { generateHtml, renderGuideHtml } from "../src/generators/html.js";
import type { GeneratorContext } from "../src/generators/index.js";
import { generatePdf } from "../src/generators/pdf.js";
import { generatePptx } from "../src/generators/pptx.js";

const root = path.resolve(__dirname, "..");
const fixtureDir = path.join(root, "tests/fixtures/out");
const mediaDir = path.join(fixtureDir, "media");

let project: Project;
let proc: Process;

function ctxFor(lang: string, p: Process = proc, pr: Project = project): GeneratorContext {
  return {
    project: pr,
    process: resolveProcess(p, lang, { media: (f) => path.join(mediaDir, f) }),
    libDir: path.join(root, "dist/lib"),
  };
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
/** Concatenated text content of an OOXML part. */
const xmlText = (xml: string) => decode(xml.replace(/<[^>]+>/g, ""));
const flat = (s: string) => plainText(s).replace(/\s+/g, " ").trim();

beforeAll(() => {
  if (!fs.existsSync(path.join(fixtureDir, "process.json"))) {
    execSync("npx tsx scripts/make-fixture.ts", { cwd: root, stdio: "inherit" });
  }
  project = JSON.parse(fs.readFileSync(path.join(fixtureDir, "project.json"), "utf8"));
  proc = JSON.parse(fs.readFileSync(path.join(fixtureDir, "process.json"), "utf8"));
}, 120_000);

describe("annotate", () => {
  const step = (): ResolvedStep => ctxFor("en").process.steps[0];

  it("draws the highlight in the brand colour around the bbox", () => {
    const s = step();
    const img = annotateScreenshot(s, { color: "#ff0000", badge: 1 })!;
    expect(img.annotated).toBe(true);
    const png = PNG.sync.read(img.png);
    expect(png.width).toBe(s.viewport!.width);
    // Left edge of the padded box (bbox.x - 6), vertically centred.
    const x = s.bbox!.x - 6;
    const y = Math.round(s.bbox!.y + s.bbox!.height / 2);
    const i = (y * png.width + x) << 2;
    expect(png.data[i]).toBeGreaterThan(200);
    expect(png.data[i + 1]).toBeLessThan(80);
  });

  it("dims outside the box only when asked", () => {
    const s = step();
    const orig = PNG.sync.read(fs.readFileSync(s.screenshot!));
    const dim = PNG.sync.read(annotateScreenshot(s, { badge: false })!.png);
    const flatImg = PNG.sync.read(annotateScreenshot(s, { badge: false, dim: false })!.png);
    const i = ((orig.height - 5) * orig.width + (orig.width - 5)) << 2; // far corner
    expect(dim.data[i]).toBeLessThan(orig.data[i]);
    expect(flatImg.data[i]).toBe(orig.data[i]);
  });

  it("crops a focus image of at least 640×360 with a 16:9 aspect", () => {
    for (const s of ctxFor("en").process.steps) {
      const f = focusScreenshot(s)!;
      expect(f.width).toBeGreaterThanOrEqual(640);
      expect(f.height).toBeGreaterThanOrEqual(360);
      expect(Math.abs(f.width / f.height - 16 / 9)).toBeLessThan(0.02);
    }
  });

  it("handles missing screenshot and bbox", () => {
    const s = step();
    expect(annotateScreenshot({ ...s, screenshot: undefined })).toBeUndefined();
    expect(annotateScreenshot({ ...s, screenshot: "/nonexistent/x.png" })).toBeUndefined();
    const noBox = annotateScreenshot({ ...s, bbox: undefined })!;
    expect(noBox.annotated).toBe(false);
    expect(focusScreenshot({ ...s, bbox: undefined })!.annotated).toBe(false);
  });

  it("parses colours", () => {
    expect(parseHex("#2f6fed")).toEqual([47, 111, 237]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("nope", [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("common", () => {
  it("builds brand, labels and file names", () => {
    const b = brandOf(project);
    expect(b.primary).toBe("#2f6fed");
    expect(b.companyName).toBe("Northwind Traders");
    expect(label("da", "step")).toBe("Trin");
    expect(label("de", "overview")).toBe("Übersicht");
    expect(label("xx", "note")).toBe("Note");
    expect(outputFilename(ctxFor("en").process, "docx")).toBe("create-a-new-customer.docx");
  });

  it("reads logo data URLs", () => {
    const png = new PNG({ width: 40, height: 12 });
    const logo = parseLogo(`data:image/png;base64,${PNG.sync.write(png).toString("base64")}`)!;
    expect(logo).toMatchObject({ type: "png", width: 40, height: 12 });
    expect(parseLogo("not a data url")).toBeUndefined();
  });
});

for (const lang of ["en", "da"]) {
  describe(`generators (${lang})`, () => {
    it("html: self-contained guide with every step", async () => {
      const ctx = ctxFor(lang);
      const out = await generateHtml(ctx);
      expect(out.mime).toBe("text/html");
      expect(out.filename).toBe("create-a-new-customer.html");
      const html = out.buffer.toString("utf8");
      expect(html).toMatch(new RegExp(`<html lang="${lang}`));
      expect(html).not.toMatch(/<(script|link)\b/);
      expect(html).not.toMatch(/src="(?!data:)/);
      const text = decode(html.replace(/<[^>]+>/g, ""));
      for (const s of ctx.process.steps) expect(text).toContain(flat(s.title));
      expect((html.match(/<img [^>]*src="data:image\/png;base64,/g) ?? []).length).toBe(ctx.process.steps.length);
      if (lang === "da") expect(html).toContain("Trin 1 af 4");
    });

    it("docx: valid package containing the step text and screenshots", async () => {
      const ctx = ctxFor(lang);
      const out = await generateDocx(ctx);
      expect(out.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(out.filename).toBe("create-a-new-customer.docx");
      expect(out.buffer.subarray(0, 2).toString()).toBe("PK");
      const zip = await JSZip.loadAsync(out.buffer);
      const xml = await zip.file("word/document.xml")!.async("string");
      const text = xmlText(xml);
      expect(text).toContain(ctx.process.title);
      for (const s of ctx.process.steps) expect(text).toContain(flat(s.title));
      expect(Object.keys(zip.files).filter((f) => /^word\/media\/.+\.png$/.test(f)).length).toBe(ctx.process.steps.length);
      expect(zip.file("word/header1.xml") ?? zip.file("word/header2.xml")).toBeTruthy();
      expect(xml).toContain('w:name="step_1"'); // bookmarks for the overview page references
    });

    it("pptx: title, overview, one slide per step, closing", async () => {
      const ctx = ctxFor(lang);
      const out = await generatePptx(ctx);
      expect(out.mime).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
      expect(out.filename).toBe("create-a-new-customer.pptx");
      expect(out.buffer.subarray(0, 2).toString()).toBe("PK");
      const zip = await JSZip.loadAsync(out.buffer);
      const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
      expect(zip.file("ppt/slides/slide1.xml")).toBeTruthy();
      expect(slides.length).toBe(ctx.process.steps.length + 3);
      const title = xmlText(await zip.file("ppt/slides/slide1.xml")!.async("string"));
      expect(title).toContain(ctx.process.title);
      for (const s of ctx.process.steps) {
        const slide = xmlText(await zip.file(`ppt/slides/slide${s.index + 2}.xml`)!.async("string"));
        expect(slide).toContain(flat(s.title));
      }
    });

    it("pdf: renders the guide", async () => {
      const out = await generatePdf(ctxFor(lang));
      expect(out.mime).toBe("application/pdf");
      expect(out.filename).toBe("create-a-new-customer.pdf");
      expect(out.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(out.buffer.length).toBeGreaterThan(50_000);
    }, 60_000);
  });
}

describe("edge cases", () => {
  it("handles notes, steps without screenshots or bbox, masked values and a logo", async () => {
    const p: Process = structuredClone(proc);
    p.steps.splice(1, 0, { id: "stp_note", action: "note", url: p.startUrl, title: "Check the **customer number** first.", titleEdited: true, description: "Line one.\nLine two." });
    p.steps.push({ id: "stp_nav", action: "navigate", url: p.startUrl, title: "Open **Sales orders**.", value: "Sales orders" });
    p.steps[0].target = { ...p.steps[0].target!, bbox: { x: 0, y: 0, width: 0, height: 0 } };
    p.steps[3] = { ...p.steps[3], sensitive: true };
    const pr: Project = structuredClone(project);
    pr.branding.logoDataUrl = `data:image/png;base64,${PNG.sync.write(new PNG({ width: 120, height: 40 })).toString("base64")}`;
    for (const lang of ["en", "da", "fr"]) {
      const ctx = ctxFor(lang, p, pr);
      // A note without a localized title resolves to "" — generators fall back to its text.
      const note = ctx.process.steps[1];
      expect(stepTitle(note, lang).length).toBeGreaterThan(0);
      const [html, docx, pptx] = await Promise.all([generateHtml(ctx), generateDocx(ctx), generatePptx(ctx)]);
      expect(html.buffer.length).toBeGreaterThan(1000);
      expect(docx.buffer.length).toBeGreaterThan(1000);
      expect(pptx.buffer.length).toBeGreaterThan(1000);
      const zip = await JSZip.loadAsync(pptx.buffer);
      expect(Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length).toBe(ctx.process.steps.length + 3);
    }
    const printHtml = await renderGuideHtml(ctxFor("en", p, pr), { print: true });
    expect(printHtml).toContain('class="print"');
    expect(printHtml).toContain("data:image/png;base64,");
  });

  it("works with no steps", async () => {
    const p: Process = { ...structuredClone(proc), steps: [] };
    const ctx = ctxFor("en", p);
    for (const gen of [generateHtml, generateDocx, generatePptx]) expect((await gen(ctx)).buffer.length).toBeGreaterThan(500);
  });
});
