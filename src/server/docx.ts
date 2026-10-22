// Reads a Word document (.docx) into what a guide importer needs, in reading order: headings,
// paragraphs, list items and table cells as text with **bold** runs (the way Steplight writes
// instructions), and the pictures between them. No layout, fonts or page structure.
import JSZip from "jszip";

export interface DocBlock {
  kind: "heading" | "paragraph" | "item" | "image";
  /** Text with **bold** markers and \n for line breaks ("" for an image). */
  text: string;
  /** Heading: 0 = Title, 1 = Heading 1, … List item: indent level, 0 = top. */
  level?: number;
  /** List item: numbered (1., a., i.) rather than bulleted. */
  numbered?: boolean;
  /** Inside a table: 1-based row and column of the cell. */
  cell?: { row: number; col: number };
  /** Image: index into WordDocument.images. */
  image?: number;
}

export interface DocImage {
  /** File name inside the document, e.g. "image3.png". */
  name: string;
  contentType: string;
  data: Buffer;
}

export interface WordDocument {
  /** Title from the document properties, if set. */
  title?: string;
  blocks: DocBlock[];
  images: DocImage[];
}

export class NotAWordDocument extends Error {}

const MAX_UNPACKED = 400 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
};

// ------------------------------------------------------------------ XML

interface Tag {
  name: string;
  close: boolean;
  selfClose: boolean;
  attrs: string;
}

const TOKEN = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;

function* tokens(xml: string): Generator<{ tag: Tag } | { text: string }> {
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(xml))) {
    if (m[1] !== undefined) yield { text: m[1] };
    else if (m[3]) yield { tag: { name: m[3], close: m[2] === "/", selfClose: m[5] === "/", attrs: m[4] } };
    else if (m[6] !== undefined) yield { text: decode(m[6]) };
  }
}

function attr(t: Tag, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, "\\$&")}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(t.attrs);
  return m ? decode(m[1] ?? m[2]) : undefined;
}

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (all, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : all;
  });
}

/** w:b, w:val="0"/"false"/"off" switches it off. */
function isOn(t: Tag): boolean {
  const v = attr(t, "w:val");
  return v === undefined || !["0", "false", "off", "none"].includes(v.toLowerCase());
}

// ------------------------------------------------------------------ styles and numbering

interface ParaStyle {
  name: string;
  basedOn?: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
}

function readStyles(xml: string | undefined): Map<string, ParaStyle> {
  const styles = new Map<string, ParaStyle>();
  if (!xml) return styles;
  let cur: ParaStyle | undefined;
  let inRPr = false;
  for (const tk of tokens(xml)) {
    if (!("tag" in tk)) continue;
    const t = tk.tag;
    if (t.name === "w:style") {
      inRPr = false;
      if (t.close) cur = undefined;
      else {
        cur = { name: "" };
        const id = attr(t, "w:styleId");
        if (id) styles.set(id, cur);
      }
      continue;
    }
    if (!cur || t.close) {
      if (t.name === "w:rPr" && t.close) inRPr = false;
      continue;
    }
    if (t.name === "w:rPr" && !t.selfClose) inRPr = true;
    else if (t.name === "w:name") cur.name = attr(t, "w:val") ?? "";
    else if (t.name === "w:basedOn") cur.basedOn = attr(t, "w:val");
    else if (t.name === "w:outlineLvl") cur.outline = Number(attr(t, "w:val"));
    else if (t.name === "w:numId") cur.numId = attr(t, "w:val");
    else if (t.name === "w:ilvl") cur.ilvl = Number(attr(t, "w:val"));
    else if (t.name === "w:b" && inRPr) cur.bold = isOn(t);
  }
  return styles;
}

/** numId → level → numbered (true) or bulleted (false). */
function readNumbering(xml: string | undefined): (numId: string, ilvl: number) => boolean {
  if (!xml) return () => true;
  const abstract = new Map<string, Map<number, string>>();
  const nums = new Map<string, string>();
  let absId: string | undefined;
  let lvl: number | undefined;
  let numId: string | undefined;
  for (const tk of tokens(xml)) {
    if (!("tag" in tk)) continue;
    const t = tk.tag;
    if (t.name === "w:abstractNum") absId = t.close ? undefined : attr(t, "w:abstractNumId");
    else if (t.name === "w:num") numId = t.close ? undefined : attr(t, "w:numId");
    else if (t.name === "w:lvl" && absId !== undefined) lvl = t.close ? undefined : Number(attr(t, "w:ilvl"));
    else if (t.name === "w:numFmt" && absId !== undefined && lvl !== undefined) {
      if (!abstract.has(absId)) abstract.set(absId, new Map());
      abstract.get(absId)!.set(lvl, attr(t, "w:val") ?? "decimal");
    } else if (t.name === "w:abstractNumId" && numId !== undefined && !t.close) nums.set(numId, attr(t, "w:val") ?? "");
  }
  return (id, ilvl) => {
    const fmt = abstract.get(nums.get(id) ?? "")?.get(ilvl) ?? "decimal";
    return fmt !== "bullet" && fmt !== "none";
  };
}

function readRels(xml: string | undefined): Map<string, string> {
  const rels = new Map<string, string>();
  if (!xml) return rels;
  for (const tk of tokens(xml)) {
    if (!("tag" in tk) || tk.tag.name !== "Relationship" || attr(tk.tag, "TargetMode") === "External") continue;
    const id = attr(tk.tag, "Id");
    const target = attr(tk.tag, "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `word/${target}`);
  }
  return rels;
}

// ------------------------------------------------------------------ text

interface Run {
  text: string;
  bold: boolean;
}

/** Runs → text with **bold** around bold words (not around the spaces next to them). */
export function runsToText(runs: Run[]): string {
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && (last.bold === r.bold || !r.text.trim())) last.text += r.text;
    else merged.push({ ...r });
  }
  const text = merged
    .map((r) => {
      if (!r.bold || !r.text.trim()) return r.text;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text)!;
      return `${m[1]}**${m[2]}**${m[3]}`;
    })
    .join("");
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, all) => l || (i > 0 && i < all.length - 1 && all[i - 1]))
    .join("\n")
    .trim();
}

// ------------------------------------------------------------------ document

interface Para {
  runs: Run[];
  styleId?: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  images: number[];
  cell?: { row: number; col: number };
}

export async function readDocx(buf: Buffer): Promise<WordDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new NotAWordDocument("This is not a Word document (.docx). Open it in Word and save it as .docx.");
  }
  // a .docx is a zip: refuse one that unpacks to far more than any guide (JSZip knows the sizes up front)
  const unpacked = Object.values(zip.files).reduce((n, f) => n + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (unpacked > MAX_UNPACKED) throw new NotAWordDocument("This document is too large to import: it unpacks to more than 400 MB.");
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new NotAWordDocument("This file has no Word document inside. Open it in Word and save it as .docx.");
  const read = (name: string) => zip.file(name)?.async("string");
  const [xml, stylesXml, numberingXml, relsXml, coreXml] = await Promise.all([docFile.async("string"), read("word/styles.xml"), read("word/numbering.xml"), read("word/_rels/document.xml.rels"), read("docProps/core.xml")]);
  const styles = readStyles(stylesXml);
  const numbered = readNumbering(numberingXml);
  const rels = readRels(relsXml);

  const styleChain = (id: string | undefined): ParaStyle[] => {
    const out: ParaStyle[] = [];
    for (let s = id ? styles.get(id) : undefined; s && out.length < 12; s = s.basedOn ? styles.get(s.basedOn) : undefined) out.push(s);
    return out;
  };
  const headingLevel = (p: Para): number | undefined => {
    if (p.outline !== undefined && p.outline < 9) return p.outline + 1;
    for (const s of styleChain(p.styleId)) {
      const m = /^heading\s*(\d)$/i.exec(s.name.trim());
      if (m) return Number(m[1]);
      if (/^(title|subtitle)$/i.test(s.name.trim())) return 0;
      if (s.outline !== undefined && s.outline < 9) return s.outline + 1;
    }
    return undefined;
  };
  const isToc = (p: Para) => styleChain(p.styleId).some((s) => /^toc\s*(\d|heading)/i.test(s.name.trim()));
  const styleBold = (p: Para) => styleChain(p.styleId).find((s) => s.bold !== undefined)?.bold ?? false;
  const listOf = (p: Para): { numId: string; ilvl: number } | undefined => {
    if (p.numId !== undefined) return p.numId === "0" ? undefined : { numId: p.numId, ilvl: p.ilvl ?? 0 };
    for (const s of styleChain(p.styleId)) if (s.numId !== undefined) return s.numId === "0" ? undefined : { numId: s.numId, ilvl: p.ilvl ?? s.ilvl ?? 0 };
    return undefined;
  };

  const blocks: DocBlock[] = [];
  const images: DocImage[] = [];
  const imageByRel = new Map<string, number>();
  const addImage = (relId: string | undefined): number | undefined => {
    if (!relId) return undefined;
    if (imageByRel.has(relId)) return imageByRel.get(relId);
    const target = rels.get(relId);
    const file = target ? zip.file(target) : null;
    if (!target || !file) return undefined;
    const name = target.split("/").pop()!;
    const ext = name.split(".").pop()!.toLowerCase();
    images.push({ name, contentType: IMAGE_TYPES[ext] ?? "application/octet-stream", data: Buffer.alloc(0) });
    imageByRel.set(relId, images.length - 1);
    return images.length - 1;
  };

  const paras: Para[] = [];
  const tables: { row: number; col: number }[] = [];
  let inPPr = false;
  let inRun = false;
  let inRPr = false;
  let runBold: boolean | undefined;
  let inText = false;
  let skip = 0; // inside mc:Fallback (a copy of the mc:Choice content)

  const emit = (p: Para) => {
    const bold = styleBold(p);
    const text = runsToText(bold ? p.runs.map((r) => ({ ...r, bold: true })) : p.runs);
    if (text && !isToc(p)) {
      const level = headingLevel(p);
      const list = listOf(p);
      const b: DocBlock = level !== undefined ? { kind: "heading", text: text.replace(/\*\*/g, ""), level } : list ? { kind: "item", text, level: list.ilvl, numbered: numbered(list.numId, list.ilvl) } : { kind: "paragraph", text };
      if (p.cell) b.cell = p.cell;
      blocks.push(b);
    }
    for (const i of p.images) blocks.push({ kind: "image", text: "", image: i, ...(p.cell ? { cell: p.cell } : {}) });
  };

  for (const tk of tokens(xml)) {
    const p = paras[paras.length - 1];
    if (!("tag" in tk)) {
      if (inText && !skip && p) p.runs.push({ text: tk.text, bold: !!runBold });
      continue;
    }
    const t = tk.tag;
    if (t.name === "mc:Fallback") {
      if (!t.selfClose) skip += t.close ? -1 : 1;
      continue;
    }
    if (skip) continue;
    switch (t.name) {
      case "w:p":
        if (t.close) {
          const done = paras.pop();
          if (done) emit(done);
        } else if (!t.selfClose) {
          const tb = tables[tables.length - 1];
          paras.push({ runs: [], images: [], cell: tb ? { row: tb.row, col: tb.col } : undefined });
        }
        break;
      case "w:pPr":
        inPPr = !t.close && !t.selfClose;
        break;
      case "w:pStyle":
        if (inPPr && p) p.styleId = attr(t, "w:val");
        break;
      case "w:outlineLvl":
        if (inPPr && p) p.outline = Number(attr(t, "w:val"));
        break;
      case "w:numId":
        if (inPPr && p) p.numId = attr(t, "w:val");
        break;
      case "w:ilvl":
        if (inPPr && p) p.ilvl = Number(attr(t, "w:val"));
        break;
      case "w:r":
        inRun = !t.close && !t.selfClose;
        runBold = undefined;
        break;
      case "w:rPr":
        inRPr = inRun && !t.close && !t.selfClose;
        break;
      case "w:b":
        if (inRun && inRPr) runBold = isOn(t);
        break;
      case "w:rStyle":
        if (inRun && inRPr && runBold === undefined && /strong|bold/i.test(attr(t, "w:val") ?? "")) runBold = true;
        break;
      case "w:t":
        inText = !t.close && !t.selfClose;
        break;
      case "w:tab":
        if (inRun && p && !inPPr) p.runs.push({ text: " ", bold: !!runBold });
        break;
      case "w:br":
      case "w:cr":
        if (inRun && p) p.runs.push({ text: "\n", bold: false });
        break;
      case "w:noBreakHyphen":
        if (inRun && p) p.runs.push({ text: "-", bold: !!runBold });
        break;
      case "a:blip":
      case "v:imagedata": {
        if (t.close) break;
        const i = addImage(attr(t, t.name === "a:blip" ? "r:embed" : "r:id"));
        if (i === undefined) break;
        if (p) p.images.push(i);
        else blocks.push({ kind: "image", text: "", image: i });
        break;
      }
      case "w:tbl":
        if (t.close) tables.pop();
        else if (!t.selfClose) tables.push({ row: 0, col: 0 });
        break;
      case "w:tr":
        if (!t.close && tables.length) {
          tables[tables.length - 1].row++;
          tables[tables.length - 1].col = 0;
        }
        break;
      case "w:tc":
        if (!t.close && tables.length) tables[tables.length - 1].col++;
        break;
    }
  }

  await Promise.all(
    [...imageByRel.entries()].map(async ([rel, i]) => {
      images[i].data = await zip.file(rels.get(rel)!)!.async("nodebuffer");
    }),
  );

  const title = coreXml ? /<dc:title>([\s\S]*?)<\/dc:title>/.exec(coreXml)?.[1] : undefined;
  return { title: title ? decode(title).trim() || undefined : undefined, blocks, images };
}
