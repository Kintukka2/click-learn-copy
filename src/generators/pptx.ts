// PowerPoint training deck (16:9): title, overview, one slide per step, closing slide.
import pptxgen from "pptxgenjs";
import { textRuns } from "../core/instructions.js";
import type { ResolvedStep } from "../core/model.js";
import {
  MIME,
  bare,
  brandOf,
  coverMeta,
  fit,
  isNote,
  labels,
  mix,
  outputFilename,
  plain,
  stepDescription,
  stepImages,
  stepOf,
  stepTitle,
  type Brand,
} from "./common.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

const W = 13.333;
const H = 7.5;
const FONT = "Calibri";
const FOOTER_Y = 7.02;
const PANEL_X = 4.85; // left edge of the screenshot panel on step slides

type Slide = ReturnType<pptxgen["addSlide"]>;
type TextRun = { text: string; options?: Record<string, unknown> };

const imgData = (png: Buffer) => `image/png;base64,${png.toString("base64")}`;

/** **bold** markup → pptxgenjs text runs. */
function runs(s: string, o: { color: string; boldColor?: string; breakLine?: boolean }): TextRun[] {
  const r: TextRun[] = textRuns(s.replace(/\s*\n\s*/g, " ")).map((t) => ({
    text: t.text,
    options: { bold: t.bold, color: t.bold ? (o.boldColor ?? o.color) : o.color },
  }));
  if (o.breakLine && r.length) r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true };
  return r;
}

/** Font size that keeps an instruction inside its box. */
function instructionSize(s: string): number {
  const n = plain(s).length;
  if (n <= 50) return 26;
  if (n <= 90) return 23;
  if (n <= 140) return 20;
  if (n <= 220) return 17;
  return 15;
}

/** Rough rendered height (in) of wrapped text: Calibri averages ~0.5 em per character. */
function textHeight(s: string, fontSize: number, widthIn: number, lineSpacing = 1.05, bold = false): number {
  const charW = (fontSize * (bold ? 0.54 : 0.5)) / 72;
  const perLine = Math.max(8, Math.floor(widthIn / charW / 1.08));
  let lines = 0;
  for (const para of plain(s).split(/\n/)) {
    let line = 0;
    lines++;
    for (const word of para.split(/\s+/)) {
      const n = word.length + (line ? 1 : 0);
      if (line + n > perLine && line > 0) {
        lines++;
        line = word.length;
      } else line += n;
    }
  }
  return (lines * fontSize * 1.2 * lineSpacing) / 72;
}

function descriptionSize(s: string): number {
  const n = s.length;
  return n <= 160 ? 15 : n <= 320 ? 13 : 11;
}

export async function generatePptx(ctx: GeneratorContext): Promise<GeneratedFile> {
  const p = ctx.process;
  const b = brandOf(ctx.project);
  const L = labels(p.lang);
  const meta = coverMeta(ctx);
  const lang = meta.locale;
  const images = stepImages(ctx, { focus: true });
  const total = p.steps.length;

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = p.title;
  pptx.subject = L("guide");
  pptx.company = b.companyName;
  pptx.author = b.companyName || "Steplight";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const C = {
    primary: bare(b.primary),
    primaryDark: bare(b.primaryDark),
    accent: bare(b.accent),
    onPrimary: bare(b.onPrimary),
    ink: bare(b.ink),
    body: bare(b.body),
    muted: bare(b.muted),
    line: bare(b.line),
    tint: bare(b.tint),
    accentTint: bare(b.accentTint),
    panel: bare(mix(b.tint, "#ffffff", 0.35)),
    soft: bare(mix(b.onPrimary, b.primary, 0.12)),
    softer: bare(mix(b.onPrimary, b.primary, 0.25)),
  };
  const text = (o: Record<string, unknown>) => ({ fontFace: FONT, lang, margin: 0, ...o });

  pptx.defineSlideMaster({
    title: "STEPLIGHT_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { line: { x: 0.6, y: FOOTER_Y - 0.02, w: W - 1.2, h: 0, line: { color: C.line, width: 0.75 } } },
      { rect: { x: 0.6, y: FOOTER_Y + 0.15, w: 0.1, h: 0.1, fill: { color: C.primary }, line: { color: C.primary, width: 0 } } },
      {
        text: {
          text: b.companyName.toUpperCase(),
          options: text({ x: 0.78, y: FOOTER_Y + 0.07, w: 4, h: 0.26, fontSize: 9, bold: true, color: C.ink, charSpacing: 1 }),
        },
      },
      { text: { text: p.title, options: text({ x: 4.9, y: FOOTER_Y + 0.07, w: 6.5, h: 0.26, fontSize: 9, color: C.muted, align: "right" }) } },
    ],
    slideNumber: { x: W - 1.35, y: FOOTER_Y + 0.07, w: 0.75, h: 0.26, fontFace: FONT, fontSize: 9, color: C.ink, bold: true, align: "right" },
  });

  // ------------------------------------------------------------- title slide
  {
    const s = pptx.addSlide();
    s.background = { color: C.primary };
    s.addShape(pptx.ShapeType.ellipse, { x: 8.3, y: -2.6, w: 7.4, h: 7.4, fill: { color: bare(mix(b.primary, b.accent, 0.45)), transparency: 55 }, line: { type: "none" } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.accent }, line: { type: "none" } });
    let y = 0.65;
    if (b.logo) {
      const size = fit(b.logo.width, b.logo.height, 1.8, 0.5);
      s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: y - 0.08, w: size.width + 0.24, h: size.height + 0.16, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { type: "none" } });
      s.addImage({ data: `${b.logo.mime};base64,${b.logo.data.toString("base64")}`, x: 0.72, y, w: size.width, h: size.height });
      y += size.height + 0.35;
    }
    s.addText(b.companyName.toUpperCase(), text({ x: 0.7, y, w: 6, h: 0.35, fontSize: 13, bold: true, color: C.onPrimary, charSpacing: 2 }));
    const eyebrow = [meta.chapter, L("guide")].filter(Boolean).join("  •  ").toUpperCase();
    const titleSize = p.title.length > 60 ? 30 : p.title.length > 36 ? 34 : 40;
    const titleH = Math.min(2.4, textHeight(p.title, titleSize, 6.5, 0.95, true) + 0.1);
    const descSize = 17;
    const descH = p.description ? Math.min(1.6, textHeight(p.description, descSize, 6.3) + 0.1) : 0;
    let ty = Math.max(1.9, (H - (0.45 + titleH + (descH ? 0.25 + descH : 0))) / 2 - 0.1);
    s.addText(eyebrow, text({ x: 0.7, y: ty, w: 6.5, h: 0.32, fontSize: 12, bold: true, color: C.softer, charSpacing: 1.5 }));
    ty += 0.45;
    s.addText(p.title, text({ x: 0.7, y: ty, w: 6.5, h: titleH, fontSize: titleSize, bold: true, color: C.onPrimary, valign: "top", lineSpacingMultiple: 0.95, fit: "shrink" }));
    ty += titleH + 0.25;
    if (p.description) {
      s.addText(runs(p.description, { color: C.soft }), text({ x: 0.7, y: ty, w: 6.3, h: descH, fontSize: descSize, valign: "top", fit: "shrink" }));
    }
    const metaLine = [meta.appName, `${total} ${L("steps")}`, meta.languageName, meta.dateText].filter(Boolean).join("   |   ");
    s.addText(metaLine, text({ x: 0.7, y: 6.45, w: 8, h: 0.35, fontSize: 12, color: C.softer }));
    const first = p.steps.map((st) => images.get(st.id)?.focus).find(Boolean);
    if (first) {
      const size = fit(first.width, first.height, 5.3, 3.6);
      const x = 7.55;
      const yy = (H - size.height) / 2;
      s.addShape(pptx.ShapeType.roundRect, { x: x - 0.09, y: yy - 0.09, w: size.width + 0.18, h: size.height + 0.18, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { type: "none" }, shadow: { type: "outer", blur: 14, offset: 4, angle: 90, color: "000000", opacity: 0.3 } });
      s.addImage({ data: imgData(first.png), x, y: yy, w: size.width, h: size.height });
    }
    s.addNotes([p.title, plain(p.description)].filter(Boolean).join("\n\n"));
  }

  // ------------------------------------------------------------- overview slides
  const PER_COL = 7;
  const PER_SLIDE = PER_COL * 2;
  for (let start = 0; start < total; start += PER_SLIDE) {
    const s = pptx.addSlide({ masterName: "STEPLIGHT_CONTENT" });
    s.addText(L("inThisGuide").toUpperCase(), text({ x: 0.6, y: 0.55, w: 8, h: 0.3, fontSize: 12, bold: true, color: C.primary, charSpacing: 1.5 }));
    s.addText(L("overview"), text({ x: 0.6, y: 0.85, w: 10, h: 0.7, fontSize: 30, bold: true, color: C.ink }));
    const chunk = p.steps.slice(start, start + PER_SLIDE);
    const twoCols = chunk.length > PER_COL;
    const colW = twoCols ? 5.85 : 11.6;
    const rowH = 0.72;
    chunk.forEach((st, i) => {
      const col = Math.floor(i / PER_COL);
      const row = i % PER_COL;
      const x = 0.6 + col * 6.2;
      const y = 1.85 + row * rowH;
      s.addShape(pptx.ShapeType.ellipse, { x, y: y + 0.04, w: 0.44, h: 0.44, fill: { color: isNote(st) ? C.accent : C.primary }, line: { type: "none" } });
      s.addText(String(st.index), text({ x, y: y + 0.04, w: 0.44, h: 0.44, fontSize: 13, bold: true, color: C.onPrimary, align: "center", valign: "middle" }));
      s.addText(runs(stepTitle(st, p.lang), { color: C.body, boldColor: C.ink }), text({ x: x + 0.62, y, w: colW - 0.7, h: 0.52, fontSize: twoCols ? 14 : 17, valign: "middle", fit: "shrink" }));
    });
    s.addNotes(chunk.map((st) => `${st.index}. ${plain(stepTitle(st, p.lang))}`).join("\n"));
  }

  // ------------------------------------------------------------- step slides
  for (const st of p.steps) {
    stepSlide(pptx, st, images.get(st.id)?.full, { b, C, L, text, total, lang: p.lang });
  }

  // ------------------------------------------------------------- closing slide
  {
    const s = pptx.addSlide();
    s.background = { color: C.primary };
    s.addShape(pptx.ShapeType.ellipse, { x: -2.4, y: 3.6, w: 6.4, h: 6.4, fill: { color: bare(mix(b.primary, b.accent, 0.45)), transparency: 60 }, line: { type: "none" } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.16, w: W, h: 0.16, fill: { color: C.accent }, line: { type: "none" } });
    s.addShape(pptx.ShapeType.ellipse, { x: W / 2 - 0.55, y: 1.55, w: 1.1, h: 1.1, fill: { color: "FFFFFF" }, line: { type: "none" } });
    s.addText("✓", text({ x: W / 2 - 0.55, y: 1.55, w: 1.1, h: 1.1, fontSize: 40, bold: true, color: C.primary, align: "center", valign: "middle", fontFace: "Segoe UI Symbol" }));
    s.addText(L("complete"), text({ x: 1, y: 2.95, w: W - 2, h: 0.9, fontSize: 38, bold: true, color: C.onPrimary, align: "center" }));
    s.addText(L("done"), text({ x: 1, y: 3.85, w: W - 2, h: 0.6, fontSize: 18, color: C.soft, align: "center" }));
    s.addText(p.title, text({ x: 1, y: 4.75, w: W - 2, h: 0.45, fontSize: 15, bold: true, color: C.softer, align: "center" }));
    s.addText([b.companyName, meta.dateText].filter(Boolean).join("   |   "), text({ x: 1, y: 6.45, w: W - 2, h: 0.35, fontSize: 11, color: C.softer, align: "center" }));
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer | Uint8Array;
  return { buffer: Buffer.from(out), filename: outputFilename(p, "pptx"), mime: MIME.pptx };
}

interface StepSlideEnv {
  b: Brand;
  C: Record<string, string>;
  L: ReturnType<typeof labels>;
  text: (o: Record<string, unknown>) => Record<string, unknown>;
  total: number;
  lang: string;
}

function stepSlide(pptx: pptxgen, st: ResolvedStep, img: { png: Buffer; width: number; height: number } | undefined, env: StepSlideEnv): Slide {
  const { C, L, text, total } = env;
  const s = pptx.addSlide({ masterName: "STEPLIGHT_CONTENT" });
  const note = isNote(st);
  const color = note ? C.accent : C.primary;
  const title = stepTitle(st, env.lang);
  const desc = stepDescription(st);
  const textW = img ? PANEL_X - 0.6 - 0.45 : W - 1.2;

  // Number badge + kicker.
  s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: 0.6, w: 0.72, h: 0.72, fill: { color }, line: { type: "none" } });
  s.addText(note ? "i" : String(st.index), text({ x: 0.6, y: 0.6, w: 0.72, h: 0.72, fontSize: note ? 24 : 22, bold: true, color: C.onPrimary, align: "center", valign: "middle", fontFace: note ? "Georgia" : "Calibri" }));
  const kicker = note ? `${L("note")}  ·  ${stepOf(env.lang, st.index, total)}` : stepOf(env.lang, st.index, total);
  s.addText(kicker.toUpperCase(), text({ x: 1.5, y: 0.6, w: textW - 0.9, h: 0.72, fontSize: 11, bold: true, color: note ? C.accent : C.muted, charSpacing: 1.2, valign: "middle" }));
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.6, w: 0.6, h: 0.06, fill: { color }, line: { type: "none" } });

  // Instruction + description.
  const size = instructionSize(title);
  const titleH = Math.min(3.2, textHeight(title, size, textW, 1.05, true) + 0.12);
  s.addText(runs(title, { color: C.ink, boldColor: note ? C.ink : C.primaryDark }), text({ x: 0.6, y: 1.9, w: textW, h: titleH, fontSize: size, valign: "top", lineSpacingMultiple: 1.05, fit: "shrink" }));
  if (desc) {
    const y = 1.9 + titleH + 0.3;
    s.addText(runs(desc, { color: C.body }), text({ x: 0.6, y, w: textW, h: Math.max(0.6, FOOTER_Y - 0.3 - y), fontSize: descriptionSize(desc), valign: "top", lineSpacingMultiple: 1.1, fit: "shrink" }));
  }

  // Screenshot on a tinted panel.
  if (img) {
    s.addShape(pptx.ShapeType.rect, { x: PANEL_X, y: 0, w: W - PANEL_X, h: FOOTER_Y - 0.2, fill: { color: note ? C.accentTint : C.panel }, line: { type: "none" } });
    const box = fit(img.width, img.height, W - PANEL_X - 0.7, FOOTER_Y - 0.2 - 0.9);
    const x = PANEL_X + (W - PANEL_X - box.width) / 2;
    const y = (FOOTER_Y - 0.2 - box.height) / 2;
    s.addShape(pptx.ShapeType.rect, { x: x - 0.02, y: y - 0.02, w: box.width + 0.04, h: box.height + 0.04, fill: { color: "D6DCE6" }, line: { type: "none" }, shadow: { type: "outer", blur: 12, offset: 3, angle: 90, color: "0F172A", opacity: 0.18 } });
    s.addImage({ data: imgData(img.png), x, y, w: box.width, h: box.height, altText: plain(title) });
  }
  s.addNotes([plain(title), plain(desc)].filter(Boolean).join("\n\n"));
  return s;
}
