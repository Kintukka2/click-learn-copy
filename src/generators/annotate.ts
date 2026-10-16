// Screenshot annotation for document generators (pure pngjs, no native deps).
// Draws an anti-aliased rounded highlight around the step's target, a numbered badge and an
// optional subtle dimming outside the target; can also crop a "focus" region around the target.
import fs from "node:fs";
import { PNG } from "pngjs";
import type { Rect, ResolvedStep } from "../core/model.js";

export interface AnnotateOptions {
  /** Highlight + badge colour (hex). */
  color?: string;
  /** Badge content (usually the step index). `false` hides the badge. */
  badge?: number | string | false;
  /** Dim everything outside the highlight. Default true. */
  dim?: boolean;
  /** Dimming strength 0–1. Default 0.18 (subtle). */
  dimAmount?: number;
  /** Space between the element and the highlight, in CSS px. Default 6. */
  padding?: number;
  /** Highlight stroke width in CSS px. Default 3. */
  stroke?: number;
  /** Corner radius in CSS px. Default 8. */
  radius?: number;
}

export interface FocusOptions extends AnnotateOptions {
  /** Minimum crop size in CSS px. Default 640×360. */
  minWidth?: number;
  minHeight?: number;
  /** Crop aspect ratio (w/h). Default 16/9. */
  aspect?: number;
}

export interface AnnotatedImage {
  png: Buffer;
  width: number;
  height: number;
  /** True when a highlight was drawn (the step had a usable bbox). */
  annotated: boolean;
}

type RGB = [number, number, number];

export function parseHex(hex: string | undefined, fallback: RGB = [47, 111, 237]): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Read a PNG file; undefined when missing or unreadable. */
export function loadPng(file: string | undefined): PNG | undefined {
  if (!file) return undefined;
  try {
    return PNG.sync.read(fs.readFileSync(file));
  } catch {
    return undefined;
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function blend(img: PNG, x: number, y: number, c: RGB, a: number) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  if (a > 1) a = 1;
  const i = (y * img.width + x) << 2;
  const d = img.data;
  d[i] = d[i] + (c[0] - d[i]) * a;
  d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * a;
  d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * a;
  d[i + 3] = 255;
}

/** Signed distance from (px,py) to a rounded rectangle (negative inside). */
function sdRoundRect(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ------------------------------------------------------------------ digit glyphs
// A tiny monoline vector font for 0-9: each glyph is a set of polylines in a 0.6 × 1.0 box
// (y down). Rendered with distance fields, so the digits are smooth at any size.
type Pt = [number, number];

function arc(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, n = 28): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(t), cy - ry * Math.sin(t)]);
  }
  return pts;
}

function quad(a: Pt, c: Pt, b: Pt, n = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

const GLYPHS: Record<string, Pt[][]> = {
  "0": [arc(0.3, 0.5, 0.29, 0.49, 0, 360, 48)],
  "1": [[[0.08, 0.2], [0.34, 0.01], [0.34, 0.99]]],
  "2": [[...arc(0.3, 0.27, 0.27, 0.26, 165, -25), [0.03, 0.99], [0.6, 0.99]]],
  "3": [arc(0.29, 0.25, 0.25, 0.24, 155, -90), arc(0.29, 0.735, 0.3, 0.255, 90, -155)],
  "4": [[[0.46, 0.99], [0.46, 0.01], [0.01, 0.69], [0.6, 0.69]]],
  "5": [[[0.55, 0.01], [0.1, 0.01], [0.05, 0.46], ...arc(0.3, 0.665, 0.29, 0.325, 140, -150)]],
  "6": [quad([0.53, 0.04], [0.02, 0.12], [0.02, 0.66]), arc(0.31, 0.68, 0.29, 0.31, 0, 360, 48)],
  "7": [[[0.01, 0.01], [0.6, 0.01], [0.2, 0.99]]],
  "8": [arc(0.3, 0.255, 0.24, 0.235, 0, 360, 40), arc(0.3, 0.735, 0.29, 0.255, 0, 360, 44)],
  "9": [arc(0.29, 0.32, 0.29, 0.31, 0, 360, 48), quad([0.58, 0.34], [0.58, 0.88], [0.07, 0.96])],
};

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = px - a[0];
  const wy = py - a[1];
  const len = vx * vx + vy * vy;
  const t = len ? clamp((wx * vx + wy * vy) / len, 0, 1) : 0;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Draw a string of digits (other characters are skipped) with its top-left at (x, y). */
function drawDigits(img: PNG, text: string, x: number, y: number, height: number, color: RGB) {
  const sw = height * 0.15; // stroke width
  const adv = height * 0.6 + height * 0.16;
  let ox = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    // Transform polylines into image space once.
    const lines = g.map((pl) => pl.map(([gx, gy]) => [ox + gx * height, y + gy * height] as Pt));
    const x0 = Math.floor(ox - sw);
    const x1 = Math.ceil(ox + 0.6 * height + sw);
    const y0 = Math.floor(y - sw);
    const y1 = Math.ceil(y + height + sw);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        let d = Infinity;
        for (const pl of lines) for (let i = 1; i < pl.length; i++) d = Math.min(d, segDist(px + 0.5, py + 0.5, pl[i - 1], pl[i]));
        blend(img, px, py, color, clamp(sw / 2 - d + 0.5, 0, 1));
      }
    }
    ox += adv;
  }
}

function digitsWidth(text: string, height: number): number {
  const n = [...text].filter((c) => GLYPHS[c]).length;
  return n ? n * height * 0.6 + (n - 1) * height * 0.16 : 0;
}

// ------------------------------------------------------------------ drawing

/** Annotate a decoded PNG in place. `bbox` is in CSS px; `scale` = image px per CSS px. */
function annotateInPlace(img: PNG, bbox: Rect, scale: number, o: AnnotateOptions): { box: Box; badge?: Box } {
  const color = parseHex(o.color);
  const pad = (o.padding ?? 6) * scale;
  const stroke = Math.max(1, (o.stroke ?? 3) * scale);
  const dimA = o.dim === false ? 0 : clamp(o.dimAmount ?? 0.18, 0, 1);
  const W = img.width;
  const H = img.height;

  // Padded highlight rectangle, clamped so the stroke stays visible inside the image.
  const inset = stroke / 2 + 1;
  const x0 = clamp(bbox.x * scale - pad, inset, W - inset);
  const y0 = clamp(bbox.y * scale - pad, inset, H - inset);
  const x1 = clamp((bbox.x + bbox.width) * scale + pad, x0 + 2, W - inset);
  const y1 = clamp((bbox.y + bbox.height) * scale + pad, y0 + 2, H - inset);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2;
  const hh = (y1 - y0) / 2;
  const r = Math.min((o.radius ?? 8) * scale, hw, hh);
  const halo = 6 * scale;

  const dark: RGB = [15, 23, 42];
  const reach = stroke + halo + 2;
  for (let py = 0; py < H; py++) {
    const nearY = py >= y0 - reach && py <= y1 + reach;
    for (let px = 0; px < W; px++) {
      if (!nearY || px < x0 - reach || px > x1 + reach) {
        if (dimA) blend(img, px, py, dark, dimA);
        continue;
      }
      const d = sdRoundRect(px + 0.5, py + 0.5, cx, cy, hw, hh, r);
      // Dim outside the box (soft edge).
      if (dimA) blend(img, px, py, dark, dimA * clamp(d + 0.5, 0, 1));
      // Soft halo outside the stroke.
      const outer = d - stroke / 2;
      if (outer > 0 && outer < halo) blend(img, px, py, color, 0.28 * (1 - outer / halo) ** 2);
      // The stroke itself, centred on the box edge.
      blend(img, px, py, color, clamp(stroke / 2 - Math.abs(d) + 0.5, 0, 1));
    }
  }
  const box: Box = { x: x0 - stroke, y: y0 - stroke, w: x1 - x0 + 2 * stroke, h: y1 - y0 + 2 * stroke };

  if (o.badge === false || o.badge === undefined || o.badge === "") return { box };
  const label = String(o.badge);
  const bh = 30 * scale; // badge height (diameter)
  const textH = bh * 0.46;
  const tw = digitsWidth(label, textH);
  const bw = Math.max(bh, tw + bh * 0.62);
  const gap = 8 * scale;
  // Prefer the left side of the highlight, vertically centred; else above-left; else inside top-left.
  let bx: number;
  let by: number;
  if (x0 - stroke - gap - bw >= 2) {
    bx = x0 - stroke - gap - bw;
    by = clamp(cy - bh / 2, 2, H - bh - 2);
  } else if (y0 - stroke - gap - bh >= 2) {
    bx = clamp(x0, 2, W - bw - 2);
    by = y0 - stroke - gap - bh;
  } else if (x1 + stroke + gap + bw <= W - 2) {
    bx = x1 + stroke + gap;
    by = clamp(cy - bh / 2, 2, H - bh - 2);
  } else {
    bx = clamp(x0 + stroke + 4 * scale, 2, W - bw - 2);
    by = clamp(y0 + stroke + 4 * scale, 2, H - bh - 2);
  }
  drawBadge(img, bx, by, bw, bh, label, textH, tw, color, scale);
  return { box, badge: { x: bx, y: by, w: bw, h: bh } };
}

function drawBadge(img: PNG, bx: number, by: number, bw: number, bh: number, label: string, textH: number, tw: number, color: RGB, scale: number) {
  const ring = 2.5 * scale;
  const shadow = 4 * scale;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const white: RGB = [255, 255, 255];
  const sx0 = Math.floor(bx - ring - shadow - 1);
  const sx1 = Math.ceil(bx + bw + ring + shadow + 1);
  const sy0 = Math.floor(by - ring - shadow - 1);
  const sy1 = Math.ceil(by + bh + ring + shadow + 2 * scale + 1);
  const r = bh / 2;
  for (let py = sy0; py <= sy1; py++) {
    for (let px = sx0; px <= sx1; px++) {
      const x = px + 0.5;
      const y = py + 0.5;
      // Drop shadow (offset down).
      const ds = sdRoundRect(x, y - 1.5 * scale, cx, cy, bw / 2 + ring, bh / 2 + ring, r + ring);
      if (ds > 0 && ds < shadow) blend(img, px, py, [0, 0, 0], 0.22 * (1 - ds / shadow) ** 2);
      const d = sdRoundRect(x, y, cx, cy, bw / 2, bh / 2, r);
      blend(img, px, py, white, clamp(ring - d + 0.5, 0, 1)); // white ring
      blend(img, px, py, color, clamp(-d + 0.5, 0, 1)); // fill
    }
  }
  drawDigits(img, label, cx - tw / 2, cy - textH / 2, textH, white);
}

function crop(img: PNG, b: Box): PNG {
  const x = Math.round(clamp(b.x, 0, img.width - 1));
  const y = Math.round(clamp(b.y, 0, img.height - 1));
  const w = Math.round(clamp(b.w, 1, img.width - x));
  const h = Math.round(clamp(b.h, 1, img.height - y));
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(img, out, x, y, w, h, 0, 0);
  return out;
}

const encode = (img: PNG, annotated: boolean): AnnotatedImage => ({
  png: PNG.sync.write(img, { colorType: 2 }),
  width: img.width,
  height: img.height,
  annotated,
});

function scaleOf(img: PNG, step: ResolvedStep): number {
  const vw = step.viewport?.width;
  return vw && vw > 0 ? img.width / vw : 1;
}

function usableBox(step: ResolvedStep): Rect | undefined {
  const b = step.bbox;
  if (!b || !(b.width > 0) || !(b.height > 0) || ![b.x, b.y].every(Number.isFinite)) return undefined;
  return b;
}

/**
 * The full screenshot with the target highlighted. Returns undefined when the step has no
 * readable screenshot; without a bbox the plain screenshot is returned (annotated = false).
 */
export function annotateScreenshot(step: ResolvedStep, opts: AnnotateOptions = {}): AnnotatedImage | undefined {
  const img = loadPng(step.screenshot);
  if (!img) return undefined;
  const bbox = usableBox(step);
  if (!bbox) return encode(img, false);
  annotateInPlace(img, bbox, scaleOf(img, step), { badge: step.index, ...opts });
  return encode(img, true);
}

/**
 * A cropped region around the target (with context), at least minWidth × minHeight CSS px and
 * with a fixed aspect ratio. Without a bbox, the full screenshot is returned.
 */
export function focusScreenshot(step: ResolvedStep, opts: FocusOptions = {}): AnnotatedImage | undefined {
  const img = loadPng(step.screenshot);
  if (!img) return undefined;
  const bbox = usableBox(step);
  if (!bbox) return encode(img, false);
  const scale = scaleOf(img, step);
  const { box, badge } = annotateInPlace(img, bbox, scale, { badge: step.index, ...opts });
  // Region of interest = highlight ∪ badge.
  let rx0 = box.x;
  let ry0 = box.y;
  let rx1 = box.x + box.w;
  let ry1 = box.y + box.h;
  if (badge) {
    rx0 = Math.min(rx0, badge.x);
    ry0 = Math.min(ry0, badge.y);
    rx1 = Math.max(rx1, badge.x + badge.w);
    ry1 = Math.max(ry1, badge.y + badge.h);
  }
  const aspect = opts.aspect ?? 16 / 9;
  let w = Math.max((opts.minWidth ?? 640) * scale, (rx1 - rx0) * 1.5);
  let h = Math.max((opts.minHeight ?? 360) * scale, (ry1 - ry0) * 2.2);
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  if (w > img.width) {
    w = img.width;
    h = Math.min(img.height, w / aspect);
  }
  if (h > img.height) {
    h = img.height;
    w = Math.min(img.width, h * aspect);
  }
  const cx = (rx0 + rx1) / 2;
  const cy = (ry0 + ry1) / 2;
  const x = clamp(cx - w / 2, 0, img.width - w);
  const y = clamp(cy - h / 2, 0, img.height - h);
  return encode(crop(img, { x, y, w, h }), true);
}

export const pngDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
