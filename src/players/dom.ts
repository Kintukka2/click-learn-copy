// Tiny DOM helpers shared by the player modules (no framework).

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; html?: string; style?: Partial<CSSStyleDeclaration> | string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "html") el.innerHTML = String(v);
      else if (k === "style") {
        if (typeof v === "string") el.setAttribute("style", v);
        else Object.assign(el.style, v);
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** An element whose innerHTML is a static SVG icon string. */
export function icon(svg: string, cls = "sl-ico"): HTMLElement {
  const s = h("span", { class: cls, "aria-hidden": "true", html: svg });
  return s;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * Pausable, cancellable clock. Every animation run takes a token; tokens become invalid when
 * `cancel()` is called (prev/next/restart), which makes their pending waits throw Cancelled.
 * Waits progress only while not paused and are scaled by `speed`.
 */
export class Clock {
  paused = false;
  speed = 1;
  private gen = 0;
  private resumers: (() => void)[] = [];

  token(): Token {
    const g = this.gen;
    return { alive: () => g === this.gen, wait: (ms: number) => this.wait(ms, g), check: () => this.check(g) };
  }
  cancel(): void {
    this.gen++;
    this.flush();
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
    this.flush();
  }
  private flush() {
    const r = this.resumers;
    this.resumers = [];
    r.forEach((f) => f());
  }
  private check(g: number) {
    if (g !== this.gen) throw new Cancelled();
  }
  private async wait(ms: number, g: number): Promise<void> {
    let remaining = ms / this.speed;
    while (remaining > 0) {
      this.check(g);
      if (this.paused) {
        await new Promise<void>((r) => this.resumers.push(r));
        continue;
      }
      const chunk = Math.min(remaining, 40);
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, chunk));
      remaining -= Math.max(chunk, performance.now() - t0);
    }
    this.check(g);
  }
}

export interface Token {
  alive(): boolean;
  wait(ms: number): Promise<void>;
  check(): void;
}

export function visuallyHidden(el: HTMLElement): HTMLElement {
  el.className = (el.className ? el.className + " " : "") + "sl-sr";
  return el;
}

/** Deterministic pseudo-random generator (mulberry32), used to shuffle decoy options. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h1 = 2166136261;
  for (let i = 0; i < s.length; i++) h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
  return h1 >>> 0;
}
