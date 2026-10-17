// Word written guide (docx). Cover page, overview with page references, one block per step
// (number badge, instruction with bold runs, description, annotated screenshot), notes as callouts.
import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LeaderType,
  LineRuleType,
  Packer,
  PageNumber,
  PageReference,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type IBorderOptions,
  type ParagraphChild,
} from "docx";
import { estimatePageNumbersWith } from "docx/layout";
import { textRuns } from "../core/instructions.js";
import {
  MIME,
  bare,
  brandOf,
  coverMeta,
  fit,
  isNote,
  labels,
  outputFilename,
  stepDescription,
  stepImages,
  stepOf,
  stepTitle,
  type Brand,
} from "./common.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

// A4 with 2 cm margins, in twips (1/20 pt). 1 px (96 dpi) = 15 twips.
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9638 twips ≈ 642 px
const BADGE_W = 720;
const FONT = "Calibri";

const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

/** **bold** markup → TextRuns; bold parts optionally coloured. */
function runs(s: string, o: { size?: number; color?: string; boldColor?: string } = {}): TextRun[] {
  return textRuns(s).map((r) => new TextRun({ text: r.text, bold: r.bold, size: o.size, color: r.bold ? (o.boldColor ?? o.color) : o.color }));
}

/** Multi-line text (descriptions) → paragraphs. */
function textParagraphs(s: string, o: { size?: number; color?: string; indent?: number; after?: number; keepNext?: boolean }): Paragraph[] {
  return s
    .split(/\n+/)
    .filter((l) => l.trim())
    .map(
      (line) =>
        new Paragraph({
          children: runs(line, { size: o.size, color: o.color }),
          indent: o.indent ? { left: o.indent } : undefined,
          spacing: { after: o.after ?? 80 },
          keepNext: o.keepNext,
        }),
    );
}

function spacer(after: number): Paragraph {
  return new Paragraph({ spacing: { before: 0, after }, children: [] });
}

function cover(ctx: GeneratorContext, b: Brand): (Paragraph | Table)[] {
  const p = ctx.process;
  const L = labels(p.lang);
  const meta = coverMeta(ctx);
  const out: (Paragraph | Table)[] = [spacer(3000)];
  if (b.logo && b.logo.type !== "svg") {
    const size = fit(b.logo.width, b.logo.height, 220, 64);
    out.push(
      new Paragraph({
        spacing: { after: 360 },
        children: [new ImageRun({ type: b.logo.type, data: b.logo.data, transformation: { width: Math.round(size.width), height: Math.round(size.height) } })],
      }),
    );
  }
  out.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: b.companyName, bold: true, allCaps: true, color: bare(b.primary), size: 22, characterSpacing: 30 })],
    }),
    new Paragraph({
      spacing: { after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 36, color: bare(b.primary), space: 1 } },
      children: [],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: [meta.chapter, L("guide")].filter(Boolean).join("  •  "), allCaps: true, bold: true, color: bare(b.muted), size: 19, characterSpacing: 20 }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
      children: [new TextRun({ text: p.title })],
    }),
  );
  if (p.description) out.push(...textParagraphs(p.description, { size: 28, color: bare(b.body), after: 120 }));
  out.push(spacer(720));

  // Metadata: label row over value row, one column per item, rules above and below.
  const rows = meta.rows;
  const colW = Math.floor(CONTENT_W / Math.max(1, rows.length));
  const rule: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: bare(b.line) };
  const cell = (children: Paragraph[], top: boolean) =>
    new TableCell({
      width: { size: colW, type: WidthType.DXA },
      margins: { top: top ? 160 : 20, bottom: top ? 20 : 160, left: 0, right: 120 },
      borders: { top: top ? rule : NONE, bottom: top ? NONE : rule, left: NONE, right: NONE },
      children,
    });
  out.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: rows.map(() => colW),
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [
        new TableRow({
          children: rows.map((r) =>
            cell([new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: r.label, allCaps: true, bold: true, size: 16, color: bare(b.muted), characterSpacing: 16 })] })], true),
          ),
        }),
        new TableRow({
          children: rows.map((r) => cell([new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: r.value, bold: true, size: 22, color: bare(b.ink) })] })], false)),
        }),
      ],
    }),
  );
  out.push(
    spacer(2400),
    new Paragraph({ children: [new TextRun({ text: [b.companyName, meta.dateText, L("generated")].filter(Boolean).join("  ·  "), size: 16, color: bare(b.muted) })] }),
  );
  return out;
}

function overview(ctx: GeneratorContext, b: Brand): Paragraph[] {
  const p = ctx.process;
  const L = labels(p.lang);
  const out: Paragraph[] = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(L("inThisGuide"))] })];
  for (const s of p.steps) {
    out.push(
      new Paragraph({
        spacing: { after: 100 },
        indent: { left: 520, hanging: 520 },
        tabStops: [
          { type: TabStopType.LEFT, position: 520 },
          { type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT },
        ],
        children: [
          new InternalHyperlink({
            anchor: `step_${s.index}`,
            children: [
              new TextRun({ text: String(s.index), bold: true, color: bare(b.primary) }),
              new TextRun({ text: "\t" }),
              ...runs(plainOneLine(stepTitle(s, p.lang)), { color: bare(b.body), boldColor: bare(b.ink) }),
            ],
          }),
          new TextRun({ text: "\t", color: bare(b.line) }),
          new PageReference(`step_${s.index}`, { hyperlink: true }),
        ],
      }),
    );
  }
  return out;
}

/** Keep **bold** markers but collapse line breaks (overview lines). */
const plainOneLine = (s: string) => s.replace(/\s*\n\s*/g, " ");

function stepBlock(ctx: GeneratorContext, b: Brand, s: GeneratorContext["process"]["steps"][number], img: { png: Buffer; width: number; height: number } | undefined): (Paragraph | Table)[] {
  const p = ctx.process;
  const L = labels(p.lang);
  const total = p.steps.length;
  const title = stepTitle(s, p.lang);
  const desc = stepDescription(s);
  const out: (Paragraph | Table)[] = [];
  const kicker = stepOf(p.lang, s.index, total);

  if (isNote(s)) {
    const accent = bare(b.accent);
    out.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [CONTENT_W],
        layout: TableLayoutType.FIXED,
        borders: noBorders,
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: CONTENT_W, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: bare(b.accentTint), color: "auto" },
                margins: { top: 160, bottom: 160, left: 280, right: 240 },
                borders: {
                  left: { style: BorderStyle.SINGLE, size: 36, color: accent },
                  top: NONE,
                  bottom: NONE,
                  right: NONE,
                },
                children: [
                  new Paragraph({
                    heading: HeadingLevel.HEADING_2,
                    keepNext: true,
                    spacing: { before: 0, after: 60 },
                    children: [
                      new Bookmark({
                        id: `step_${s.index}`,
                        children: [new TextRun({ text: `ⓘ  ${L("note")}`, allCaps: true, bold: true, size: 18, color: accent, characterSpacing: 16 })],
                      }),
                      new TextRun({ text: `   ·   ${kicker}`, allCaps: true, size: 16, color: bare(b.muted), bold: false }),
                    ],
                  }),
                  new Paragraph({ spacing: { after: desc ? 60 : 0 }, children: runs(title, { size: 24, color: bare(b.ink) }) }),
                  ...(desc ? textParagraphs(desc, { size: 21, color: bare(b.body), after: 0 }) : []),
                  ...(img ? [imageParagraph(img, CONTENT_W - 520)] : []),
                ],
              }),
            ],
          }),
        ],
      }),
    );
    out.push(spacer(240));
    return out;
  }

  // Header row: number badge | kicker + instruction.
  out.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [BADGE_W, CONTENT_W - BADGE_W],
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: BADGE_W, type: WidthType.DXA },
              verticalAlign: VerticalAlignTable.TOP,
              margins: { top: 40, bottom: 40, left: 0, right: 0 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  keepNext: true,
                  spacing: { before: 0, after: 0 },
                  shading: { type: ShadingType.CLEAR, fill: bare(b.primary), color: "auto" },
                  children: [new TextRun({ text: String(s.index), bold: true, size: 30, color: bare(b.onPrimary) })],
                }),
              ],
            }),
            new TableCell({
              width: { size: CONTENT_W - BADGE_W, type: WidthType.DXA },
              margins: { top: 0, bottom: 0, left: 240, right: 0 },
              children: [
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  keepNext: true,
                  children: [new Bookmark({ id: `step_${s.index}`, children: [new TextRun({ text: kicker })] })],
                }),
                new Paragraph({
                  keepNext: true,
                  spacing: { after: desc ? 80 : 0, line: 300, lineRule: LineRuleType.AUTO },
                  children: runs(title, { size: 28, color: bare(b.ink), boldColor: bare(b.primaryDark) }),
                }),
                ...(desc ? textParagraphs(desc, { size: 21, color: bare(b.body), after: 40, keepNext: true }) : []),
                ...(img ? [imageParagraph(img, CONTENT_W - BADGE_W - 240)] : []),
              ],
            }),
          ],
        }),
      ],
    }),
  );
  out.push(spacer(360));
  return out;
}

/** Screenshot paragraph sized to fit `widthTwips` (and at most 420 px tall). */
function imageParagraph(img: { png: Buffer; width: number; height: number }, widthTwips: number): Paragraph {
  const maxW = widthTwips / 15 - 4; // px
  const size = fit(img.width, img.height, maxW, 420);
  return new Paragraph({
    spacing: { before: 160, after: 0 },
    children: [
      new ImageRun({
        type: "png",
        data: img.png,
        transformation: { width: Math.round(size.width), height: Math.round(size.height) },
        outline: { type: "solidFill", solidFillType: "rgb", value: "D6DCE6" },
        altText: { name: "Screenshot", title: "Screenshot", description: "Screenshot" },
      }),
    ],
  });
}

function buildDocument(ctx: GeneratorContext, withPageNumbers: boolean): Document {
  const p = ctx.process;
  const b = brandOf(ctx.project);
  const meta = coverMeta(ctx);
  const L = labels(p.lang);
  const images = stepImages(ctx);

  const body: (Paragraph | Table)[] = [...overview(ctx, b)];
  body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 240 }, children: [new TextRun(L("procedure"))] }));
  for (const s of p.steps) {
    const img = images.get(s.id)?.full;
    body.push(...stepBlock(ctx, b, s, img));
  }
  body.push(
    new Paragraph({
      spacing: { before: 240 },
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: bare(b.line), space: 12 } },
      children: [new TextRun({ text: `✓  ${L("complete")}`, bold: true, color: bare(b.primaryDark), size: 26 })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: L("done"), color: bare(b.body) })] }),
  );

  const header = new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: bare(b.line), space: 6 } },
        children: [
          new TextRun({ text: "■ ", color: bare(b.primary), size: 16 }),
          new TextRun({ text: b.companyName, bold: true, allCaps: true, size: 16, color: bare(b.ink), characterSpacing: 16 }),
          new TextRun({ text: `\t${p.title}`, size: 16, color: bare(b.muted) }),
        ],
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        children: [
          new TextRun({ text: [meta.chapter, meta.dateText].filter(Boolean).join("  ·  "), size: 16, color: bare(b.muted) }),
          new TextRun({ text: `\t${L("page")} `, size: 16, color: bare(b.muted) }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, bold: true, color: bare(b.ink) }),
          new TextRun({ text: " / ", size: 16, color: bare(b.muted) }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: bare(b.muted) }),
        ],
      }),
    ],
  });
  const empty = () => new Header({ children: [new Paragraph({ children: [] })] });
  const emptyFooter = () => new Footer({ children: [new Paragraph({ children: [] })] });
  const page = { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN + 220, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 560, footer: 520 } };

  return new Document({
    title: p.title,
    subject: L("guide"),
    description: p.description,
    creator: b.companyName || "Steplight",
    lastModifiedBy: "Steplight",
    keywords: [p.chapter, p.appName].filter(Boolean).join(", "),
    ...(withPageNumbers ? { pageNumbers: estimatePageNumbersWith({ guess: true }) } : {}),
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 21, color: bare(b.body), language: { value: meta.locale } },
          paragraph: { spacing: { after: 120, line: 276, lineRule: LineRuleType.AUTO } },
        },
        title: { run: { font: FONT, size: 64, bold: true, color: bare(b.ink) }, paragraph: { spacing: { after: 240 } } },
        heading1: {
          run: { font: FONT, size: 22, bold: true, allCaps: true, color: bare(b.primaryDark), characterSpacing: 24 },
          paragraph: { spacing: { before: 240, after: 240 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: bare(b.line), space: 4 } } },
        },
        heading2: {
          run: { font: FONT, size: 17, bold: true, allCaps: true, color: bare(b.muted), characterSpacing: 16 },
          paragraph: { spacing: { before: 0, after: 40 }, keepNext: true },
        },
        hyperlink: { run: { color: bare(b.body), underline: {} } },
      },
    },
    sections: [
      {
        properties: { page, titlePage: true },
        headers: { first: empty(), default: header },
        footers: { first: emptyFooter(), default: footer },
        children: cover(ctx, b),
      },
      {
        properties: { page },
        headers: { default: header },
        footers: { default: footer },
        children: body,
      },
    ],
  });
}

export async function generateDocx(ctx: GeneratorContext): Promise<GeneratedFile> {
  let buffer: Buffer;
  try {
    buffer = await Packer.toBuffer(buildDocument(ctx, true));
  } catch {
    // Page-number estimation is best effort; without it Word fills PAGEREF fields itself.
    buffer = await Packer.toBuffer(buildDocument(ctx, false));
  }
  return { buffer, filename: outputFilename(ctx.process, "docx"), mime: MIME.docx };
}
