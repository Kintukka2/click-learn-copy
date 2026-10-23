// Import a written guide (Word .docx) as a draft process. Steplight reads the steps (Claude, or rules
// when Claude isn't configured), keeps the guide's screenshots as placeholder screenshots and flags
// what the author should check. The author reviews the draft in the Studio, then records it in the
// application to replace the placeholders with real steps.
import { createHash } from "node:crypto";
import express, { type Router } from "express";
import { chromium } from "playwright";
import { canLearnerChoose } from "../core/choice.js";
import { draftTarget, type ElementKind } from "../core/draft.js";
import { newId, now } from "../core/ids.js";
import { instructionFor } from "../core/instructions.js";
import type { Lang, Process, Project, Step, StepDraft } from "../core/model.js";
import { claudeEnabled } from "./ai.js";
import { wrap, type AppContext } from "./app.js";
import { NotAWordDocument, readDocx, type DocImage, type WordDocument } from "./docx.js";
import { planOffline, planWithClaude, type GuidePlan, type PlanStep, type VisionImage } from "./guide-plan.js";
import { serial } from "./queue.js";
import type { Store } from "./store.js";

export class ImportError extends Error {}

/** Claude sees at most this many screenshots of a guide, each at most VISION_EDGE px on its long side. */
const MAX_VISION = 20;
const VISION_EDGE = 1568;
/** Screenshots are stored as PNG at most this size (Word documents can hold photos of any size). */
const MAX_EDGE = 4000;
/** Picture formats Chromium can draw, so they can be converted to PNG. */
const DRAWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp", "image/svg+xml"]);

export interface PreparedImage {
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Pictures that are not screenshots: logos and icons. A picture shown more than once (a logo on every
 * part of the guide, the same file or the same bytes), one before the guide's first words (a cover),
 * or one too small to show a screen (an icon in a sentence).
 */
export function decorativePictures(doc: WordDocument, prepared: (PreparedImage | undefined)[]): Set<number> {
  const out = new Set<number>();
  const shown = new Map<string, number[]>();
  const firstText = doc.blocks.findIndex((b) => b.kind !== "image");
  doc.blocks.forEach((b, i) => {
    if (b.kind !== "image") return;
    const key = createHash("sha1").update(doc.images[b.image!].data).digest("hex");
    shown.set(key, [...(shown.get(key) ?? []), b.image!]);
    if (firstText < 0 || i < firstText) out.add(b.image!);
  });
  for (const pics of shown.values()) if (pics.length > 1) for (const i of pics) out.add(i);
  prepared.forEach((p, i) => {
    if (p && (Math.max(p.width, p.height) < 160 || Math.min(p.width, p.height) < 40)) out.add(i);
  });
  return out;
}

function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * The guide's pictures as PNG (for screenshots), and downscaled copies of `forVision` for Claude.
 * PNGs of a reasonable size are used as they are; everything else is drawn by Chromium. Pictures
 * Chromium can't draw (EMF, WMF, TIFF) are left out.
 */
export async function prepareImages(
  images: DocImage[],
  forVision: Set<number>,
  /** Runs the Chromium part, e.g. in the queue of browser jobs. */
  inBrowser: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn(),
): Promise<{ prepared: (PreparedImage | undefined)[]; vision: VisionImage[] }> {
  const prepared: (PreparedImage | undefined)[] = images.map((im) => {
    const size = im.contentType === "image/png" ? pngSize(im.data) : undefined;
    return size && Math.max(size.width, size.height) <= MAX_EDGE ? { png: im.data, ...size } : undefined;
  });
  const vision: VisionImage[] = [];
  const draw: number[] = [];
  images.forEach((im, i) => {
    const p = prepared[i];
    if (forVision.has(i) && p && Math.max(p.width, p.height) <= VISION_EDGE && p.png.length < 3_500_000) vision.push({ image: i, mediaType: "image/png", data: p.png.toString("base64") });
    else if ((!p || forVision.has(i)) && DRAWABLE.has(im.contentType)) draw.push(i);
  });
  if (!draw.length) return { prepared, vision };

  await inBrowser(async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ deviceScaleFactor: 1 });
      await page.setContent(`<html><body style="margin:0;background:#fff"><img id="i" style="display:block"></body></html>`);
      const shoot = async (width: number, height: number, type: "png" | "jpeg") => {
        await page.setViewportSize({ width, height });
        await page.evaluate(([w, h]) => Object.assign(document.getElementById("i")!.style, { width: `${w}px`, height: `${h}px` }), [width, height]);
        return page.screenshot({ type, quality: type === "jpeg" ? 80 : undefined, clip: { x: 0, y: 0, width, height } });
      };
      for (const i of draw) {
        const im = images[i];
        const size = await page.evaluate(async (src) => {
          const img = document.getElementById("i") as HTMLImageElement;
          img.removeAttribute("style");
          img.style.display = "block";
          img.src = src;
          try {
            await img.decode();
          } catch {
            return null;
          }
          return { width: img.naturalWidth, height: img.naturalHeight };
        }, `data:${im.contentType};base64,${im.data.toString("base64")}`);
        if (!size?.width || !size.height) continue;
        if (!prepared[i]) {
          const k = Math.min(1, MAX_EDGE / Math.max(size.width, size.height));
          const width = Math.max(1, Math.round(size.width * k));
          const height = Math.max(1, Math.round(size.height * k));
          prepared[i] = { png: await shoot(width, height, "png"), width, height };
        }
        if (forVision.has(i)) {
          const k = Math.min(1, VISION_EDGE / Math.max(size.width, size.height));
          const jpeg = await shoot(Math.max(1, Math.round(size.width * k)), Math.max(1, Math.round(size.height * k)), "jpeg");
          vision.push({ image: i, mediaType: "image/jpeg", data: jpeg.toString("base64") });
        }
      }
    } finally {
      await browser.close();
    }
  });
  vision.sort((a, b) => a.image - b.image);
  return { prepared, vision };
}

const NO_ELEMENT = "Steplight couldn't tell which element this step uses. Set it under Element.";

/** One planned step as a draft Step: an element from its name, an automatic instruction, no recording yet. */
export function draftStep(ps: PlanStep, lang: Lang, url: string, shot?: { screenshot: string; viewport: { width: number; height: number } }): Step {
  const source = ps.source || ps.description || ps.element.name;
  const draft: StepDraft = { source };
  if (ps.flag) draft.flag = ps.flag;
  if (ps.added) draft.added = true;
  const base = { id: newId("stp"), url, ...shot, draft };
  if (ps.action === "note") return { ...base, action: "note", title: ps.description || source, titleEdited: true };
  const hasElement = ps.element.kind !== "none" && !!ps.element.name;
  if (!hasElement && ps.action !== "press") {
    // keep the guide's wording until the author says which element it is
    return { ...base, action: ps.action, value: ps.value || undefined, title: source, titleEdited: true, draft: { ...draft, flag: draft.flag ?? NO_ELEMENT } };
  }
  const target = hasElement ? draftTarget(ps.element.kind as ElementKind, ps.element.name) : undefined;
  let value = ps.value || undefined;
  if (ps.action === "check") value = /^(false|no|off|0)$/i.test(ps.value) ? "false" : "true";
  if (ps.action === "press") value = ps.value || "Enter";
  const st: Step = { ...base, action: ps.action, target, value, title: "" };
  if (ps.learnerChooses && canLearnerChoose(st)) {
    st.learnerChooses = true;
    if (ps.choiceHint) st.choiceHint = ps.choiceHint;
  }
  if (ps.description) st.description = ps.description;
  st.title = instructionFor({ action: st.action, target, value, learnerChooses: st.learnerChooses, hint: st.choiceHint }, lang);
  return st;
}

export interface ImportOptions {
  fileName: string;
  /** Where the process starts in the application (the test environment). */
  startUrl?: string;
  /** Override the chapter / application the guide suggests. */
  chapter?: string;
  appName?: string;
  /** Use the guide's pictures as placeholder screenshots (default true). Logos and icons never are. */
  pictures?: boolean;
}

export interface ImportResult {
  process: Process;
  provider: "claude" | "offline";
  /** Something the author should know about how the guide was read. */
  warning?: string;
}

export async function importGuide(store: Store, project: Project, docx: Buffer, opts: ImportOptions): Promise<ImportResult> {
  const doc = await readDocx(docx);
  if (!doc.blocks.some((b) => b.kind !== "image")) throw new ImportError("This document has no text to import.");
  const useClaude = claudeEnabled();
  const usePictures = opts.pictures !== false;
  const shownPictures = [...new Set(doc.blocks.filter((b) => b.kind === "image").map((b) => b.image!))];
  const forVision = new Set(useClaude ? shownPictures.slice(0, MAX_VISION) : []);
  // without screenshots and without Claude, the pictures are not needed at all
  const { prepared, vision: seen } = useClaude || usePictures ? await prepareImages(doc.images, forVision, serial) : { prepared: [], vision: [] };
  const decorative = decorativePictures(doc, prepared);
  const vision = seen.filter((v) => !decorative.has(v.image));
  const pictures = shownPictures.filter((i) => !decorative.has(i));

  let plan: GuidePlan | undefined;
  let provider: ImportResult["provider"] = "offline";
  let warning: string | undefined;
  if (useClaude) {
    try {
      plan = await planWithClaude(doc, opts.fileName, vision, decorative);
      provider = "claude";
      if (pictures.length > MAX_VISION) warning = `Claude looked at the first ${MAX_VISION} of the guide's ${pictures.length} screenshots.`;
    } catch (err) {
      console.warn("[steplight] Claude could not plan the guide, using the offline rules:", (err as Error).message);
      warning = `Claude couldn't read the guide (${(err as Error).message}), so Steplight used its simple rules. Check every step.`;
    }
  }
  plan ??= planOffline(doc, opts.fileName, decorative);
  if (!plan.steps.length) throw new ImportError("Steplight found no steps in this guide.");

  const lang = project.languages[0] ?? "en";
  const startUrl = opts.startUrl?.trim() ?? "";
  const media = new Map<number, string>();
  const shot = (i: number | null) => {
    const p = i === null || !usePictures || decorative.has(i) ? undefined : prepared[i];
    if (i === null || !p) return undefined;
    if (!media.has(i)) media.set(i, store.saveMedia(project.id, p.png, "guide"));
    return { screenshot: media.get(i)!, viewport: { width: p.width, height: p.height } };
  };
  const proc = store.createProcess(project.id, {
    title: plan.title || doc.title || opts.fileName.replace(/\.docx$/i, ""),
    description: plan.description,
    chapter: opts.chapter?.trim() || plan.chapter,
    appName: opts.appName?.trim() || plan.appName,
    startUrl,
    lang,
    steps: plan.steps.map((ps) => draftStep(ps, lang, startUrl, shot(ps.image))),
  })!;
  proc.importedFrom = { fileName: opts.fileName, importedAt: now(), provider };
  return { process: store.saveProcess(proc), provider, warning };
}

export function importRoutes(api: Router, ctx: AppContext) {
  /** Body: the .docx file. Query: fileName, startUrl?, chapter?, appName?, pictures? ("0": no screenshots) → { process, provider, warning? } */
  api.post(
    "/projects/:pid/import-guide",
    express.raw({ type: () => true, limit: "60mb" }),
    wrap(async (req, res) => {
      const project = ctx.store.getProject(req.params.pid);
      if (!project) return res.status(404).json({ error: "project not found" });
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Send the .docx file as the request body." });
      const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
      try {
        const result = await importGuide(ctx.store, project, req.body, { fileName: q("fileName") || "guide.docx", startUrl: q("startUrl"), chapter: q("chapter"), appName: q("appName"), pictures: q("pictures") !== "0" });
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof NotAWordDocument || err instanceof ImportError) return res.status(400).json({ error: err.message });
        throw err;
      }
    }),
  );
}
