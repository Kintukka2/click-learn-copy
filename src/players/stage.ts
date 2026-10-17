// The stage: a screenshot scaled to fit its container, with an overlay layer whose children are
// positioned in percentages of the screenshot's viewport (step.viewport), so bboxes captured in
// CSS pixels stay exact at any rendered size. Supports an optional "zoom to target" transform used
// on narrow (mobile) screens.
import type { Rect, ResolvedStep } from "../core/model.js";
import { clamp, h } from "./dom.js";

export interface StageOptions {
  /** The host has a definite height: fit the screenshot inside both dimensions. */
  fixed: boolean;
  /** Show the browser-window chrome bar above the screenshot. */
  chrome: boolean;
  /** Fluid mode: height reserved for the rest of the player when capping height to the window. */
  reserve?: number;
}

export function padRect(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, width: r.width + 2 * p, height: r.height + 2 * p };
}

export class Stage {
  readonly el: HTMLElement;
  readonly frame: HTMLElement;
  readonly chrome: HTMLElement;
  readonly view: HTMLElement;
  readonly shot: HTMLElement;
  readonly layer: HTMLElement;
  /** Unzoomed overlay layer in view pixels (bubbles, cards). */
  readonly float: HTMLElement;
  private imgs: HTMLElement;
  private urlText: HTMLElement;
  vw = 1280;
  vh = 800;
  W = 0;
  H = 0;
  scale = 1;
  z = 1;
  tx = 0;
  ty = 0;
  private zoomRect: Rect | null = null;
  private opts: StageOptions;
  onLayout?: () => void;

  constructor(opts: StageOptions) {
    this.opts = opts;
    this.urlText = h("span", { class: "sl-url-text" });
    this.chrome = h(
      "div",
      { class: "sl-chrome", "aria-hidden": "true" },
      h("span", { class: "sl-dots" }, h("i"), h("i"), h("i")),
      h("span", { class: "sl-url" }, h("span", { class: "sl-url-lock", html: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>` }), this.urlText),
    );
    if (!opts.chrome) this.chrome.hidden = true;
    this.imgs = h("div", { class: "sl-imgs" });
    this.layer = h("div", { class: "sl-layer" });
    this.shot = h("div", { class: "sl-shot" }, this.imgs, this.layer);
    this.float = h("div", { class: "sl-float" });
    this.view = h("div", { class: "sl-view" }, this.shot, this.float);
    this.frame = h("div", { class: "sl-frame" }, this.chrome, this.view);
    this.el = h("div", { class: "sl-stage" }, this.frame);
  }

  setUrl(url: string | undefined) {
    let text = url ?? "";
    try {
      const u = new URL(text);
      text = u.host + u.pathname + u.search + u.hash;
    } catch {
      /* keep raw */
    }
    this.urlText.textContent = text;
  }

  /** Swap to a step's screenshot with a short crossfade. Resolves once the image is decoded. */
  async setStep(step: ResolvedStep | undefined, instant = false): Promise<void> {
    const vp = step?.viewport;
    const src = step?.screenshot;
    let node: HTMLElement;
    if (src) {
      const img = h("img", { class: "sl-img", alt: "", draggable: "false", decoding: "async" });
      img.src = src;
      try {
        await img.decode();
      } catch {
        /* broken image: still show the frame */
      }
      if (!vp && img.naturalWidth) this.setViewport(img.naturalWidth, img.naturalHeight);
      node = img;
    } else {
      node = h("div", { class: "sl-img sl-noimg" });
    }
    if (vp) this.setViewport(vp.width, vp.height);
    this.setUrl(step?.url);
    const old = Array.from(this.imgs.children) as HTMLElement[];
    if (instant || old.length === 0) {
      node.classList.add("sl-on", "sl-instant");
      this.imgs.replaceChildren(node);
      return;
    }
    this.imgs.append(node);
    void node.offsetWidth;
    node.classList.add("sl-on");
    window.setTimeout(() => old.forEach((o) => o.remove()), 420);
  }

  setViewport(w: number, hgt: number) {
    if (w > 0 && hgt > 0 && (w !== this.vw || hgt !== this.vh)) {
      this.vw = w;
      this.vh = hgt;
      this.layout();
    }
  }

  layout() {
    const cs = getComputedStyle(this.el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const frameCs = getComputedStyle(this.frame);
    const border = parseFloat(frameCs.borderLeftWidth) + parseFloat(frameCs.borderRightWidth);
    const chromeH = this.chrome.hidden ? 0 : this.chrome.offsetHeight;
    const availW = Math.max(80, this.el.clientWidth - padX - border);
    const availH = this.opts.fixed
      ? Math.max(60, this.el.clientHeight - padY - chromeH - border)
      : Math.max(220, window.innerHeight - (this.opts.reserve ?? 200) - chromeH);
    const ratio = this.vw / this.vh;
    const W = Math.floor(Math.min(availW, availH * ratio));
    const H = Math.round(W / ratio);
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.scale = W / this.vw;
    this.view.style.width = `${W}px`;
    this.view.style.height = `${H}px`;
    this.shot.style.width = `${W}px`;
    this.shot.style.height = `${H}px`;
    this.el.style.setProperty("--sl-scale", String(this.scale));
    this.applyZoom(false);
    this.onLayout?.();
  }

  /** CSS percentages for a rect in screenshot pixels. */
  place(el: HTMLElement, r: Rect) {
    el.style.left = `${(r.x / this.vw) * 100}%`;
    el.style.top = `${(r.y / this.vh) * 100}%`;
    el.style.width = `${(r.width / this.vw) * 100}%`;
    el.style.height = `${(r.height / this.vh) * 100}%`;
  }

  placePoint(el: HTMLElement, x: number, y: number) {
    el.style.left = `${(x / this.vw) * 100}%`;
    el.style.top = `${(y / this.vh) * 100}%`;
  }

  /** A screenshot rect in view pixels (after zoom). */
  toPx(r: Rect): Rect {
    const k = this.scale * this.z;
    return { x: r.x * k + this.tx, y: r.y * k + this.ty, width: r.width * k, height: r.height * k };
  }

  /** Client coordinates to screenshot pixels. */
  toShot(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.shot.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * this.vw, y: ((clientY - rect.top) / rect.height) * this.vh };
  }

  /** Zoom in around a rect (narrow screens), or reset with null. */
  zoomTo(r: Rect | null, animate = true) {
    this.zoomRect = r;
    this.applyZoom(animate);
  }

  private applyZoom(animate: boolean) {
    const r = this.zoomRect;
    let z = 1;
    let tx = 0;
    let ty = 0;
    if (r) {
      z = clamp(Math.min(this.vw / Math.max(r.width * 1.3, this.vw * 0.4), this.vh / Math.max(r.height * 4, this.vh * 0.4)), 1, 2.5);
      const cx = (r.x + r.width / 2) * this.scale * z;
      const cy = (r.y + r.height / 2) * this.scale * z;
      tx = clamp(this.W / 2 - cx, this.W - this.W * z, 0);
      ty = clamp(this.H / 2 - cy, this.H - this.H * z, 0);
    }
    this.z = z;
    this.tx = tx;
    this.ty = ty;
    this.shot.classList.toggle("sl-zoom-anim", animate);
    this.shot.style.transform = z === 1 ? "" : `translate(${tx}px, ${ty}px) scale(${z})`;
    this.shot.style.setProperty("--sl-z", String(z));
  }
}

/**
 * Position a floating card next to a target rect (view pixels) inside a W×H area. Prefers below,
 * then above, right, left; falls back to the side with most room. Sets data-side and an arrow
 * offset (--sl-arrow) on the card.
 */
export function positionCard(card: HTMLElement, t: Rect, W: number, H: number, gap = 14, margin = 10) {
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const room = { below: H - (t.y + t.height) - gap, above: t.y - gap, right: W - (t.x + t.width) - gap, left: t.x - gap };
  let side: keyof typeof room = "below";
  if (room.below >= ch + margin) side = "below";
  else if (room.above >= ch + margin) side = "above";
  else if (room.right >= cw + margin) side = "right";
  else if (room.left >= cw + margin) side = "left";
  else side = (Object.keys(room) as (keyof typeof room)[]).sort((a, b) => room[b] - room[a])[0];
  let x: number;
  let y: number;
  if (side === "below" || side === "above") {
    x = clamp(t.x + t.width / 2 - cw / 2, margin, Math.max(margin, W - cw - margin));
    y = side === "below" ? t.y + t.height + gap : t.y - gap - ch;
    y = clamp(y, margin, Math.max(margin, H - ch - margin));
    card.style.setProperty("--sl-arrow", `${clamp(t.x + t.width / 2 - x, 18, cw - 18)}px`);
  } else {
    y = clamp(t.y + t.height / 2 - ch / 2, margin, Math.max(margin, H - ch - margin));
    x = side === "right" ? t.x + t.width + gap : t.x - gap - cw;
    x = clamp(x, margin, Math.max(margin, W - cw - margin));
    card.style.setProperty("--sl-arrow", `${clamp(t.y + t.height / 2 - y, 18, ch - 18)}px`);
  }
  card.dataset.side = side;
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}
