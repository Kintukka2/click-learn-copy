// Overlay primitives drawn on top of the screenshot (inside Stage.layer, positioned in %).
import type { Rect, ResolvedProcess, ResolvedStep } from "../core/model.js";
import { h, hashString, seeded } from "./dom.js";
import { ICONS } from "./icons.js";
import { padRect, type Stage } from "./stage.js";

export type Tone = "primary" | "ok" | "bad" | "reveal";

/** Highlight ring + optional dimmed spotlight around a rect. Moves smoothly between rects. */
export class Spot {
  readonly el = h("div", { class: "sl-spot", "aria-hidden": "true" }, h("span", { class: "sl-spot-pulse" }));
  constructor(private stage: Stage) {
    stage.layer.append(this.el);
  }
  show(r: Rect, opts: { dim?: boolean; tone?: Tone; pulse?: boolean } = {}) {
    const pad = Math.max(2, 4 / (this.stage.scale * this.stage.z));
    this.stage.place(this.el, padRect(r, pad));
    this.el.dataset.tone = opts.tone ?? "primary";
    this.el.classList.toggle("sl-dim", !!opts.dim);
    this.el.classList.toggle("sl-pulse", opts.pulse !== false);
    this.el.classList.add("sl-on");
  }
  hide() {
    this.el.classList.remove("sl-on", "sl-dim");
  }
}

/** A click ripple at a point (screenshot px). */
export function ripple(stage: Stage, x: number, y: number, tone: Tone = "primary") {
  const r = h("span", { class: "sl-ripple", "data-tone": tone, "aria-hidden": "true" });
  stage.placePoint(r, x, y);
  stage.layer.append(r);
  window.setTimeout(() => r.remove(), 900);
}

/** Font sizing for overlays drawn over a field: proportional to the field height on screen. */
export function sizeToField(el: HTMLElement, b: Rect) {
  el.style.setProperty("--sl-h", String(b.height));
}

/** A read-only "field with text" overlay (Show Me typing, revealed answers). */
export class FieldText {
  readonly el: HTMLElement;
  private text: HTMLElement;
  constructor(private stage: Stage, b: Rect, kind: "text" | "select" = "text") {
    this.text = h("span", { class: "sl-ftext" });
    this.el = h("div", { class: `sl-field sl-field-${kind}`, "aria-hidden": "true" }, this.text, kind === "text" ? h("span", { class: "sl-caret" }) : null);
    if (kind === "select") this.el.append(h("span", { class: "sl-field-chev", html: ICONS.chevronDown }));
    stage.place(this.el, b);
    sizeToField(this.el, b);
    stage.layer.append(this.el);
  }
  set(v: string) {
    this.text.textContent = v;
  }
  get value() {
    return this.text.textContent ?? "";
  }
  typing(on: boolean) {
    this.el.classList.toggle("sl-typing", on);
  }
  remove() {
    this.el.remove();
  }
}

/**
 * A dropdown list drawn under (or above) a field. `interactive` builds real role=option buttons
 * with keyboard support; otherwise a decorative list (Show Me).
 */
export class ListOverlay {
  readonly el: HTMLElement;
  readonly items: HTMLElement[] = [];
  constructor(
    private stage: Stage,
    b: Rect,
    options: string[],
    opts: { interactive?: boolean; label?: string; onPick?: (value: string, el: HTMLElement) => void; id?: string } = {},
  ) {
    const optH = Math.max(b.height * 0.92, 18);
    const listH = optH * options.length + 8;
    const below = b.y + b.height + 4 + listH <= stage.vh || b.y < listH;
    const rect: Rect = { x: b.x, y: below ? b.y + b.height + 3 : b.y - listH - 3, width: Math.max(b.width, 120), height: listH };
    this.el = h("div", {
      class: "sl-list",
      role: opts.interactive ? "listbox" : undefined,
      "aria-label": opts.label,
      id: opts.id,
      "aria-hidden": opts.interactive ? undefined : "true",
    });
    stage.place(this.el, rect);
    this.el.style.height = "auto";
    sizeToField(this.el, b);
    options.forEach((o, i) => {
      const it = opts.interactive
        ? h("div", { class: "sl-opt", role: "option", tabindex: i === 0 ? "0" : "-1", "aria-selected": "false", "data-value": o }, o)
        : h("div", { class: "sl-opt", "data-value": o }, o);
      if (opts.interactive) {
        it.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onPick?.(o, it);
        });
        it.addEventListener("keydown", (e) => {
          const k = (e as KeyboardEvent).key;
          if (k === "ArrowDown" || k === "ArrowUp") {
            e.preventDefault();
            const n = this.items[(i + (k === "ArrowDown" ? 1 : this.items.length - 1)) % this.items.length];
            this.focusItem(n);
          } else if (k === "Enter" || k === " ") {
            e.preventDefault();
            opts.onPick?.(o, it);
          }
        });
      }
      this.items.push(it);
      this.el.append(it);
    });
    stage.layer.append(this.el);
  }
  focusItem(it: HTMLElement | undefined) {
    if (!it) return;
    this.items.forEach((x) => x.setAttribute("tabindex", x === it ? "0" : "-1"));
    it.focus({ preventScroll: true });
  }
  mark(value: string, cls = "sl-hot") {
    this.items.forEach((x) => x.classList.toggle(cls, x.dataset.value === value));
  }
  remove() {
    this.el.remove();
  }
}

/** A check-mark badge drawn on a checkbox target. */
export function checkBadge(stage: Stage, b: Rect, checked: boolean): HTMLElement {
  const size = Math.min(b.width, b.height, 28);
  const r: Rect = { x: b.x + Math.min(b.width, b.height) / 2 - size / 2, y: b.y + b.height / 2 - size / 2, width: size, height: size };
  const el = h("div", { class: `sl-checkbadge${checked ? " sl-checked" : ""}`, "aria-hidden": "true", html: checked ? ICONS.check : "" });
  stage.place(el, r);
  stage.layer.append(el);
  return el;
}

/** Options for a select step: the right one plus 2-3 plausible decoys, deterministically shuffled. */
export function selectOptions(proc: ResolvedProcess, step: ResolvedStep, generic: string[] = ["—"]): string[] {
  const right = step.value ?? "";
  const pool: string[] = [];
  const push = (v?: string) => {
    const t = (v ?? "").trim();
    if (t && t.length <= 40 && !pool.some((p) => p.toLowerCase() === t.toLowerCase()) && t.toLowerCase() !== right.toLowerCase()) pool.push(t);
  };
  proc.steps.filter((s) => s.action === "select" && s.id !== step.id).forEach((s) => push(s.value));
  for (const g of generic) if (pool.length < 3) push(g);
  const rnd = seeded(hashString(step.id + right));
  const decoys = pool.sort(() => rnd() - 0.5).slice(0, 3);
  const all = [right, ...decoys];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** Normalise a typed answer for comparison. */
export const norm = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** A step the learner must act on (scored in Test Me). */
export function isScorable(st: ResolvedStep): boolean {
  if (st.action === "press") return true;
  return !!st.bbox && (st.action === "click" || st.action === "type" || st.action === "select" || st.action === "check");
}

/** The area worth keeping in view for a step: the target, plus the dropdown list for selects. */
export function focusRect(st: ResolvedStep): Rect | undefined {
  const b = st.bbox;
  if (!b) return undefined;
  if (st.action !== "select") return b;
  return { x: b.x, y: b.y, width: b.width, height: b.height + Math.max(b.height * 0.92, 18) * 4 + 12 };
}
