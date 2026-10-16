// Shared helpers for the document generators (docx, pdf, pptx, html).
import { slugify } from "../core/ids.js";
import { SUPPORTED_LANGS, plainText, ui } from "../core/instructions.js";
import type { Lang, Project, ResolvedProcess, ResolvedStep } from "../core/model.js";
import { annotateScreenshot, focusScreenshot, parseHex, type AnnotatedImage } from "./annotate.js";
import type { GeneratorContext } from "./index.js";

// ------------------------------------------------------------------ file names

export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  html: "text/html",
} as const;

export function fileSlug(proc: ResolvedProcess): string {
  return slugify(proc.title || "process");
}

export function outputFilename(proc: ResolvedProcess, ext: string): string {
  return `${fileSlug(proc)}.${ext}`;
}

// ------------------------------------------------------------------ colours

export type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Mix colour a towards b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminance(hex: string): number {
  const c = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** "#2F6FED" → "2F6FED" (docx / pptx colour format). */
export const bare = (hex: string) => hex.replace(/^#/, "").toUpperCase();

export interface LogoImage {
  data: Buffer;
  type: "png" | "jpg" | "gif" | "svg";
  mime: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface Brand {
  companyName: string;
  /** All colours are normalised "#rrggbb". */
  primary: string;
  accent: string;
  /** Darker primary for text on white (headings, bold runs). */
  primaryDark: string;
  /** Very light tint of primary for backgrounds. */
  tint: string;
  /** Light tint of accent for callouts. */
  accentTint: string;
  /** Readable text colour on a primary background. */
  onPrimary: string;
  ink: string;
  body: string;
  muted: string;
  line: string;
  logo?: LogoImage;
}

export function brandOf(project: Project): Brand {
  const b = project.branding ?? ({} as Project["branding"]);
  const primary = toHex(parseHex(b.primaryColor, [47, 111, 237]));
  const accent = toHex(parseHex(b.accentColor, parseHex(mix(primary, "#14b8a6", 0.65))));
  // Keep text-on-white colours dark enough for contrast.
  let primaryDark = mix(primary, "#0b1220", 0.28);
  if (luminance(primaryDark) > 0.18) primaryDark = mix(primary, "#0b1220", 0.5);
  return {
    companyName: (b.companyName || project.name || "").trim(),
    primary,
    accent,
    primaryDark,
    tint: mix(primary, "#ffffff", 0.92),
    accentTint: mix(accent, "#ffffff", 0.9),
    onPrimary: luminance(primary) > 0.45 ? "#0f172a" : "#ffffff",
    ink: "#0f172a",
    body: "#334155",
    muted: "#64748b",
    line: "#e2e8f0",
    logo: parseLogo(b.logoDataUrl),
  };
}

/** Decode a logo data URL and read its pixel size (PNG, JPEG, GIF; SVG gets a nominal size). */
export function parseLogo(dataUrl: string | undefined): LogoImage | undefined {
  const m = /^data:(image\/(png|jpe?g|gif|svg\+xml))(;base64)?,(.*)$/is.exec(dataUrl ?? "");
  if (!m) return undefined;
  try {
    const mime = m[1].toLowerCase();
    const data = m[3] ? Buffer.from(m[4], "base64") : Buffer.from(decodeURIComponent(m[4]), "utf8");
    const kind = m[2].toLowerCase();
    const type: LogoImage["type"] = kind.startsWith("svg") ? "svg" : kind === "gif" ? "gif" : kind === "png" ? "png" : "jpg";
    const size = imageSize(data, type);
    if (!size) return undefined;
    return { data, type, mime, width: size.width, height: size.height, dataUrl: `data:${mime};base64,${data.toString("base64")}` };
  } catch {
    return undefined;
  }
}

function imageSize(d: Buffer, type: LogoImage["type"]): { width: number; height: number } | undefined {
  if (type === "png" && d.length > 24 && d.readUInt32BE(12) === 0x49484452) return { width: d.readUInt32BE(16), height: d.readUInt32BE(20) };
  if (type === "gif" && d.length > 10) return { width: d.readUInt16LE(6), height: d.readUInt16LE(8) };
  if (type === "jpg") {
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) return undefined;
      const marker = d[i + 1];
      const len = d.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: d.readUInt16BE(i + 7), height: d.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return undefined;
  }
  if (type === "svg") {
    const s = d.toString("utf8");
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(s);
    const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(s);
    if (w && h) return { width: +w[1], height: +h[1] };
    if (vb) return { width: +vb[1], height: +vb[2] };
    return { width: 200, height: 60 };
  }
  return undefined;
}

// ------------------------------------------------------------------ labels

/** Generator labels that the shared UI table (core/instructions.ts) does not carry. */
const DOC_LABELS: Record<Lang, Record<string, string>> = {
  en: { guide: "Training guide", overview: "Overview", procedure: "Procedure", application: "Application", chapter: "Chapter", language: "Language", stepCount: "Steps", date: "Date", note: "Note", page: "Page", generated: "Created with Steplight", complete: "Process complete", agenda: "Agenda", inThisGuide: "What you will do" },
  da: { guide: "Træningsvejledning", overview: "Oversigt", procedure: "Fremgangsmåde", application: "Program", chapter: "Kapitel", language: "Sprog", stepCount: "Trin", date: "Dato", note: "Bemærk", page: "Side", generated: "Oprettet med Steplight", complete: "Processen er fuldført", agenda: "Dagsorden", inThisGuide: "Det skal du gøre" },
  de: { guide: "Schulungsunterlage", overview: "Übersicht", procedure: "Vorgehensweise", application: "Anwendung", chapter: "Kapitel", language: "Sprache", stepCount: "Schritte", date: "Datum", note: "Hinweis", page: "Seite", generated: "Erstellt mit Steplight", complete: "Prozess abgeschlossen", agenda: "Agenda", inThisGuide: "Das werden Sie tun" },
  fr: { guide: "Guide de formation", overview: "Vue d’ensemble", procedure: "Procédure", application: "Application", chapter: "Chapitre", language: "Langue", stepCount: "Étapes", date: "Date", note: "Remarque", page: "Page", generated: "Créé avec Steplight", complete: "Processus terminé", agenda: "Programme", inThisGuide: "Ce que vous allez faire" },
  es: { guide: "Guía de formación", overview: "Resumen", procedure: "Procedimiento", application: "Aplicación", chapter: "Capítulo", language: "Idioma", stepCount: "Pasos", date: "Fecha", note: "Nota", page: "Página", generated: "Creado con Steplight", complete: "Proceso completado", agenda: "Agenda", inThisGuide: "Lo que va a hacer" },
  nl: { guide: "Trainingshandleiding", overview: "Overzicht", procedure: "Werkwijze", application: "Applicatie", chapter: "Hoofdstuk", language: "Taal", stepCount: "Stappen", date: "Datum", note: "Opmerking", page: "Pagina", generated: "Gemaakt met Steplight", complete: "Proces voltooid", agenda: "Agenda", inThisGuide: "Wat u gaat doen" },
  sv: { guide: "Utbildningsguide", overview: "Översikt", procedure: "Tillvägagångssätt", application: "Program", chapter: "Kapitel", language: "Språk", stepCount: "Steg", date: "Datum", note: "Obs!", page: "Sida", generated: "Skapad med Steplight", complete: "Processen är klar", agenda: "Agenda", inThisGuide: "Det här ska du göra" },
};

export type LabelKey =
  | keyof (typeof DOC_LABELS)["en"]
  | "step"
  | "of"
  | "steps"
  | "contents"
  | "updated"
  | "done"
  | "written";

/** Localized label: document-specific table first, then the shared UI strings. */
export function label(lang: Lang, key: LabelKey): string {
  const own = DOC_LABELS[lang]?.[key] ?? DOC_LABELS[baseLang(lang)]?.[key];
  if (own) return own;
  if (key in DOC_LABELS.en) return DOC_LABELS.en[key];
  return ui(baseLang(lang), key);
}

/** Bound label function for one language. */
export function labels(lang: Lang): (key: LabelKey) => string {
  return (key) => label(lang, key);
}

const baseLang = (lang: Lang) => (lang || "en").toLowerCase().split(/[-_]/)[0];

const LOCALES: Record<string, string> = { en: "en-US", da: "da-DK", de: "de-DE", fr: "fr-FR", es: "es-ES", nl: "nl-NL", sv: "sv-SE" };

/** Full BCP-47 locale for document language tags ("da" → "da-DK"). */
export function locale(lang: Lang): string {
  return lang.includes("-") ? lang : (LOCALES[baseLang(lang)] ?? lang);
}

export function languageName(lang: Lang): string {
  return SUPPORTED_LANGS.find((l) => l.code === baseLang(lang))?.native ?? lang;
}

export function formatDate(d: Date, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(locale(lang), { dateStyle: "long" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** "Step 2 of 7" in the process language. */
export function stepOf(lang: Lang, n: number, total: number): string {
  return `${label(lang, "step")} ${n} ${label(lang, "of")} ${total}`;
}

// ------------------------------------------------------------------ cover / metadata

export interface CoverMeta {
  company: string;
  title: string;
  description?: string;
  chapter?: string;
  appName?: string;
  lang: Lang;
  languageName: string;
  locale: string;
  stepCount: number;
  date: Date;
  dateText: string;
  /** Ordered label/value rows for metadata tables (empty values removed). */
  rows: { label: string; value: string }[];
}

export function coverMeta(ctx: GeneratorContext, date = new Date()): CoverMeta {
  const p = ctx.process;
  const L = labels(p.lang);
  const dateText = formatDate(date, p.lang);
  const rows = [
    { label: L("application"), value: p.appName ?? "" },
    { label: L("chapter"), value: p.chapter ?? "" },
    { label: L("language"), value: languageName(p.lang) },
    { label: L("stepCount"), value: String(p.steps.length) },
    { label: L("date"), value: dateText },
  ].filter((r) => r.value);
  return {
    company: brandOf(ctx.project).companyName,
    title: p.title,
    description: p.description,
    chapter: p.chapter,
    appName: p.appName,
    lang: p.lang,
    languageName: languageName(p.lang),
    locale: locale(p.lang),
    stepCount: p.steps.length,
    date,
    dateText,
    rows,
  };
}

// ------------------------------------------------------------------ steps

export const isNote = (s: ResolvedStep) => s.action === "note";

/** Plain one-line instruction (for alt text, speaker notes, outlines). */
export const plain = (s: string | undefined) => plainText(s).replace(/\s+/g, " ").trim();

export interface StepImages {
  full?: AnnotatedImage;
  focus?: AnnotatedImage;
}

/** Annotated images for each step (by step id), computed once per generator run. */
export function stepImages(ctx: GeneratorContext, opts: { focus?: boolean; full?: boolean; dim?: boolean } = {}): Map<string, StepImages> {
  const brand = brandOf(ctx.project);
  const out = new Map<string, StepImages>();
  for (const s of ctx.process.steps) {
    const o = { color: brand.primary, badge: s.index, dim: opts.dim ?? true };
    out.set(s.id, {
      full: opts.full === false ? undefined : safe(() => annotateScreenshot(s, o)),
      focus: opts.focus ? safe(() => focusScreenshot(s, o)) : undefined,
    });
  }
  return out;
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Fit (w, h) into a box, keeping the aspect ratio. */
export function fit(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const s = Math.min(maxW / w, maxH / h);
  return { width: w * s, height: h * s };
}

export function escapeHtml(s: string | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
