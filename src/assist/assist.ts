// Assist: in-app guidance on the live application. Highlights the element of the current step,
// shows a tooltip card next to it and advances when the user performs the recorded action.
// The overlay lives in an open shadow root on a host marked data-steplight-ignore.
import { plainText, richText } from "../core/instructions.js";
import type { ResolvedProcess, ResolvedStep, Target } from "../core/model.js";
import { positionCard } from "../players/stage.js";
import { playerStrings } from "../players/strings.js";
import css from "./assist.css";
import { rowCandidates } from "../capture/rows.js";
import { accessibleName, isVisible, resolveTarget as fallbackResolve, type Resolved } from "./fallback-resolve.js";

export type AssistEventType = "start" | "step" | "complete" | "exit";
export interface AssistOptions {
  ui?: Record<string, string>;
  startAt?: number;
  onEvent?: (type: AssistEventType, data?: unknown) => void;
  /** Brand colour (hex), applied as --sl-primary. */
  primaryColor?: string;
  /** Steplight analytics endpoint (…/api/events); kept with the saved session so it survives navigation. */
  eventsUrl?: string;
  /** Keep the session in sessionStorage so it resumes after navigation (default true). */
  persist?: boolean;
  /** Show the Back button (default true). */
  back?: boolean;
  /** More buttons for a step, shown before Skip / Next (e.g. when recording from a guide). */
  buttons?: (step: ResolvedStep) => { label: string; primary?: boolean; onClick: () => void }[];
}

/** Optional external resolver (e.g. SteplightCapture.resolve when capture.js is on the page). */
type ResolveFn = (t: NonNullable<ResolvedStep["target"]>, root?: Document) => Resolved | null;

const KEY_ACTIVE = "steplight.assist.active";
const keyFor = (pid: string) => `steplight.assist.${pid}`;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface SavedState {
  pid: string;
  i: number;
  proc: ResolvedProcess;
  ui?: Record<string, string>;
  eventsUrl?: string;
}

export function loadActive(): SavedState | null {
  try {
    const raw = storage()?.getItem(KEY_ACTIVE);
    return raw ? (JSON.parse(raw) as SavedState) : null;
  } catch {
    return null;
  }
}

const ICON_CHECK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** The element still carries the recorded name (or the target has none to compare). */
function nameMatches(e: Element, t: Target): boolean {
  const want = norm(t.name ?? t.label);
  if (!want) return true;
  const got = accessibleName(e);
  return got === want || (got.length > 2 && (got.includes(want) || want.includes(got)));
}

/**
 * A structural match (css / xpath path) is only trusted while the element still has the recorded
 * name: once the real element is hidden (e.g. its menu group was collapsed), the same path can
 * point at a neighbouring element.
 */
function plausible(r: Resolved, t: Target): boolean {
  return (r.selector.kind !== "css" && r.selector.kind !== "xpath") || nameMatches(r.element, t);
}

/** Pop-ups an app opens next to a field: the Assist card must not cover them. */
const POPUPS = "[role=dialog], [role=listbox], [role=menu], [role=tree], .ui-datepicker, .ui-autocomplete";

const CLICKABLE = "a[href],button,input,select,textarea,summary,[role=link],[role=button],[role=menuitem],[role=treeitem],[role=tab],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox]";

/**
 * Another clickable element is drawn where this one is: it is clipped away (e.g. inside a menu
 * group collapsed to zero height, as in D365) or covered, although the browser calls it visible.
 */
function covered(e: Element): boolean {
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false; // off screen: scrolled to later
  const top = document.elementFromPoint(x, y);
  if (!top || top === e || e.contains(top) || top.contains(e)) return false;
  const label = top.closest("label");
  if (label && (label.control === e || label.contains(e))) return false;
  const other = top.closest(CLICKABLE);
  return !!other && !other.contains(e) && !e.contains(other);
}

// Steps learned to be toggles (clicking them hid the next step's element), per browser.
const KEY_TOGGLES = "steplight.assist.toggles";

function knownToggles(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY_TOGGLES) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function rememberToggle(key: string) {
  try {
    const all = knownToggles().filter((k) => k !== key);
    window.localStorage.setItem(KEY_TOGGLES, JSON.stringify([...all, key].slice(-200)));
  } catch {
    /* storage blocked */
  }
}

/**
 * aria-expanded of an expander element (on itself, a descendant or its parent), if any. A link's
 * parent is not consulted: a link inside an expanded tree node navigates, it does not collapse.
 */
function expandedState(e: Element): "true" | "false" | null {
  const parent = e.parentElement;
  const host = e.hasAttribute("aria-expanded") ? e : (e.querySelector("[aria-expanded]") ?? (!e.matches("a[href]") && parent?.hasAttribute("aria-expanded") ? parent : null));
  const v = host?.getAttribute("aria-expanded");
  return v === "true" || v === "false" ? v : null;
}

function sameRect(a: DOMRect | null, b: DOMRect) {
  return !!a && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

export class AssistSession {
  readonly proc: ResolvedProcess;
  private opts: AssistOptions;
  private s: Record<string, string>;
  private i = 0;
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private ring: HTMLElement;
  private card: HTMLElement;
  private target: Element | null = null;
  /** A step where the learner picks the row: the same cell in every row, any of which completes it. */
  private choices: Element[] = [];
  private lastRect: DOMRect | null = null;
  private raf = 0;
  private poll = 0;
  private searchStarted = 0;
  private scrolled = false;
  private advancing = false;
  /** The current step was reached by moving forward (not Back / start), so it may be skipped. */
  private forward = false;
  private skipChecked = false;
  /** Index of the step whose click happened while the next step's element was already visible. */
  private clickedWithNextVisible = -1;
  private done = false;
  private stopped = false;
  private resolver: ResolveFn;
  private onDocClick = (e: Event) => this.handleClick(e);
  private onDocChange = (e: Event) => this.handleChange(e);
  private onDocInput = (e: Event) => {
    if (this.isTarget(e.target)) this.typed = true;
  };
  /** Type step: the field's value when it was found, and whether the user typed in it since. */
  private valueAtStart: string | null = null;
  private typed = false;
  private onDocKey = (e: KeyboardEvent) => this.handleKey(e);
  /** A line under the instruction (setNote), until the step changes. */
  private note: string | null = null;
  /** setPaused: the card shows the step but doesn't move on (recording paused while the author navigates). */
  private paused = false;
  private onNav = () => this.handleNav();
  private onResize = () => this.place(true);

  constructor(proc: ResolvedProcess, opts: AssistOptions = {}, resolver?: ResolveFn) {
    this.proc = proc;
    this.opts = opts;
    this.s = playerStrings(proc.lang, opts.ui);
    this.resolver = resolver ?? fallbackResolve;
    this.host = document.createElement("div");
    this.host.setAttribute("data-steplight-ignore", "");
    this.host.setAttribute("data-steplight-assist", "");
    this.host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000;";
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    this.ring = el("div", "ring");
    this.ring.setAttribute("data-steplight-ignore", "");
    this.ring.append(el("span", "beacon"));
    this.card = el("div", "card");
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-live", "polite");
    this.card.setAttribute("data-steplight-ignore", "");
    this.card.setAttribute("lang", proc.lang);
    this.shadow.append(style, this.ring, this.card);
    if (opts.primaryColor) this.host.style.setProperty("--sl-primary", opts.primaryColor);
  }

  start(at = 0) {
    (document.body ?? document.documentElement).append(this.host);
    document.addEventListener("click", this.onDocClick, true);
    document.addEventListener("change", this.onDocChange, true);
    document.addEventListener("input", this.onDocInput, true);
    document.addEventListener("keydown", this.onDocKey, true);
    window.addEventListener("hashchange", this.onNav);
    window.addEventListener("popstate", this.onNav);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onResize, true);
    this.opts.onEvent?.("start", { processId: this.proc.id, step: at });
    this.go(Math.max(0, Math.min(at, this.proc.steps.length - 1)));
    const tick = () => {
      if (this.stopped) return;
      this.place(false);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(reason: "exit" | "complete" | "silent" = "silent") {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.poll);
    document.removeEventListener("click", this.onDocClick, true);
    document.removeEventListener("change", this.onDocChange, true);
    document.removeEventListener("input", this.onDocInput, true);
    document.removeEventListener("keydown", this.onDocKey, true);
    window.removeEventListener("hashchange", this.onNav);
    window.removeEventListener("popstate", this.onNav);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onResize, true);
    this.host.remove();
    if (reason !== "silent") this.clearSaved();
    if (reason === "exit") this.opts.onEvent?.("exit", { processId: this.proc.id, step: this.i });
  }

  get index() {
    return this.i;
  }

  /** The step shown, or undefined once the process is complete. */
  get current(): ResolvedStep | undefined {
    return this.done ? undefined : this.step;
  }

  /** The node is (inside) the element highlighted for the current step, or contains it. */
  owns(node: EventTarget | null): boolean {
    return this.isTarget(node) || (node instanceof Element && !!this.target && node.contains(this.target));
  }

  /** Keep showing the current step, but don't move on from it, e.g. while the author navigates. */
  setPaused(paused: boolean) {
    this.paused = paused;
  }

  /** Hide the overlay without stopping, e.g. while a screenshot of the application is taken. */
  setHidden(hidden: boolean) {
    this.host.style.visibility = hidden ? "hidden" : "";
  }

  /** Show a line (rich text) under the instruction of the current step; null removes it. */
  setNote(text: string | null) {
    if (this.done || this.stopped) return;
    this.note = text;
    this.renderCard();
    this.updateStatus();
    this.place(true);
  }

  /** The current step was done elsewhere (e.g. confirmed by the server): move on as if the user did it here. */
  completeStep(stepId: string) {
    if (!this.done && !this.stopped && this.step?.id === stepId) this.advanceSoon(60);
  }

  // ------------------------------------------------------------------ persistence

  private save(i: number) {
    if (this.opts.persist === false) return;
    try {
      const st = storage();
      st?.setItem(keyFor(this.proc.id), JSON.stringify({ i }));
      st?.setItem(KEY_ACTIVE, JSON.stringify({ pid: this.proc.id, i, proc: this.proc, ui: this.opts.ui, eventsUrl: this.opts.eventsUrl } satisfies SavedState));
    } catch {
      /* storage full or blocked */
    }
  }

  private clearSaved() {
    if (this.opts.persist === false) return;
    try {
      storage()?.removeItem(keyFor(this.proc.id));
      storage()?.removeItem(KEY_ACTIVE);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ steps

  private get step(): ResolvedStep | undefined {
    return this.proc.steps[this.i];
  }

  go(i: number, forward = false) {
    if (this.stopped) return;
    if (i >= this.proc.steps.length) {
      this.complete();
      return;
    }
    this.forward = forward;
    this.skipChecked = false;
    if (i !== this.clickedWithNextVisible + 1) this.clickedWithNextVisible = -1;
    this.i = Math.max(0, i);
    this.done = false;
    this.advancing = false;
    this.target = null;
    this.choices = [];
    this.note = null;
    this.valueAtStart = null;
    this.typed = false;
    this.lastRect = null;
    this.scrolled = false;
    this.searchStarted = Date.now();
    this.save(this.i);
    this.renderCard();
    this.ring.classList.remove("on");
    this.opts.onEvent?.("step", { index: this.i, stepId: this.step?.id });
    this.find();
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => this.find(), 350);
  }

  next() {
    this.go(this.i + 1, true);
  }

  private needsTarget(st: ResolvedStep) {
    return !!st.target && st.action !== "note" && st.action !== "navigate" && !(st.action === "press" && !st.target.selectors?.length);
  }

  private find() {
    const st = this.step;
    if (!st || this.stopped || this.done) return;
    this.checkPopups();
    if (st.action === "navigate" && st.value && !this.paused && this.urlMatches(st.value)) {
      this.next();
      return;
    }
    if (!this.needsTarget(st)) {
      this.target = null;
      this.updateStatus();
      return;
    }
    if (this.filledWithoutTyping(st)) return;
    const row = st.learnerChooses ? st.target!.row : undefined;
    this.choices = row ? rowCandidates(row).filter((e) => !covered(e)) : [];
    if (this.choices.length) {
      // highlight the first row (or keep the one already highlighted); a click on any row counts
      const pick = this.target && this.choices.includes(this.target) ? this.target : this.choices[0];
      if (pick !== this.target) {
        this.target = pick;
        this.lastRect = null;
        this.updateStatus();
        this.place(true);
      }
      return;
    }
    // Apps that re-use elements (D365's navigation pane) can relabel the highlighted one.
    if (this.target && this.target.isConnected && isVisible(this.target) && nameMatches(this.target, st.target!) && !covered(this.target)) return;
    const found = this.resolve(st.target!);
    if (found && !this.paused && this.skipExpanded(found)) return;
    if (!found && !this.paused && this.backToExpander()) return;
    if (found !== this.target) {
      this.target = found;
      if (found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement) this.valueAtStart ??= found.value;
      this.lastRect = null;
      if (found && !this.scrolled) {
        this.scrolled = true;
        const rect = found.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
          found.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        }
      }
      this.updateStatus();
      this.place(true);
    } else if (!found) this.updateStatus();
  }

  /**
   * A date picker (D365's calendar) writes the field's value without input or change events: a type
   * step is done once the value changes while the user has not typed in it.
   */
  private filledWithoutTyping(st: ResolvedStep): boolean {
    const t = this.target;
    if (st.action !== "type" || !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return false;
    if (this.valueAtStart === null) {
      this.valueAtStart = t.value;
      return false;
    }
    if (this.typed || this.advancing || t.value === this.valueAtStart || !t.value.trim()) return false;
    this.advanceSoon(60);
    return true;
  }

  private resolve(t: Target): Element | null {
    let r: Resolved | null = null;
    try {
      r = this.resolver(t, document);
    } catch {
      r = null;
    }
    if (r && (!plausible(r, t) || covered(r.element))) r = null;
    if (!r && this.resolver !== fallbackResolve) {
      r = fallbackResolve(t, document);
      if (r && (!plausible(r, t) || covered(r.element))) r = null;
    }
    return r?.element ?? null;
  }

  private toggleKey(st: ResolvedStep) {
    return `${this.proc.id}:${st.id}`;
  }

  /**
   * Arriving at "click <expander>" while it is already expanded and the next step's element is
   * already visible: skip it, since the click would collapse what the next step needs. An expander
   * is recognised by aria-expanded="true", or by having collapsed the next element before.
   */
  private skipExpanded(found: Element): boolean {
    if (this.skipChecked) return false;
    this.skipChecked = true;
    const st = this.step!;
    const nxt = this.proc.steps[this.i + 1];
    if (!this.forward || st.action !== "click" || !nxt?.target || !this.needsTarget(nxt)) return false;
    const expanded = expandedState(found) === "true" || (expandedState(found) === null && knownToggles().includes(this.toggleKey(st)));
    if (!expanded || !this.resolve(nxt.target)) return false;
    this.next();
    return true;
  }

  /**
   * The element is missing and the previous step's expander is collapsed (e.g. the user clicked an
   * open menu group and closed it): go back to that step so it gets expanded again. Collapsed means
   * aria-expanded="false", or that clicking it hid this element, which was visible at the time.
   */
  private backToExpander(): boolean {
    const prev = this.proc.steps[this.i - 1];
    if (!prev?.target || prev.action !== "click" || !this.needsTarget(prev)) return false;
    if (Date.now() - this.searchStarted < 600) return false;
    const el = this.resolve(prev.target);
    if (!el) return false;
    const state = expandedState(el);
    const hidIt = this.clickedWithNextVisible === this.i - 1;
    if (state !== "false" && !(state === null && hidIt)) return false;
    if (hidIt) rememberToggle(this.toggleKey(prev));
    this.clickedWithNextVisible = -1;
    this.go(this.i - 1);
    return true;
  }

  private urlMatches(url: string): boolean {
    try {
      const want = new URL(url, location.href);
      const here = new URL(location.href);
      return want.pathname === here.pathname && (want.hash.split("?")[0] || "") === (here.hash.split("?")[0] || "");
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ rendering

  private renderCard() {
    const st = this.step!;
    const n = this.proc.steps.length;
    const s = this.s;
    // a note has nothing to find on the page: it looks different, and its Next pulses like a highlight
    this.card.className = st.action === "note" ? "card is-note" : "card";
    this.card.innerHTML = "";
    this.card.setAttribute("aria-label", `${s.step} ${st.index} ${s.of} ${n}`);
    const head = el("div", "head");
    const count = el("span", "count");
    count.textContent = `${s.step} ${st.index} ${s.of} ${n}`;
    const proc = el("span", "proc");
    proc.textContent = plainText(this.proc.title);
    const close = el("button", "x", ICON_X);
    close.type = "button";
    close.setAttribute("aria-label", s.exit);
    close.title = s.exit;
    close.addEventListener("click", () => this.stop("exit"));
    head.append(count, proc, close);
    const title = el("div", "title", richText(st.title));
    this.card.append(head, title);
    if (st.description) this.card.append(el("div", "desc", richText(st.description)));
    if (this.note) this.card.append(el("div", "note", richText(this.note)));
    const status = el("div", "status");
    status.hidden = true;
    this.card.append(status);
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${((st.index - 1) / n) * 100}%`;
    bar.append(fill);
    const actions = el("div", "actions");
    const exit = this.button(s.exit, "ghost", () => this.stop("exit"));
    const back = this.button(s.back, "", () => this.go(this.i - 1));
    back.disabled = this.i === 0;
    // a check box the learner sets as needed may be left as it is
    const optional = st.learnerChooses && st.action === "check";
    const needsAction = (this.needsTarget(st) || st.action === "press") && !optional;
    const fwd = needsAction ? this.button(s.skip, "", () => this.next()) : this.button(s.next, "primary", () => this.next());
    fwd.classList.add("fwd");
    if (st.action === "note") fwd.classList.add("pulse");
    const right = el("div", "right");
    if (this.opts.back !== false) right.append(back);
    for (const b of this.opts.buttons?.(st) ?? []) right.append(this.button(b.label, b.primary ? "primary" : "", b.onClick));
    right.append(fwd);
    actions.append(exit, right);
    this.card.append(actions, bar);
    if (st.action === "navigate" && st.value) {
      const go = this.button(s.goToPage, "primary", () => (location.href = st.value!));
      right.prepend(go);
    }
  }

  private button(label: string, kind: string, on: () => void) {
    const b = el("button", `btn ${kind}`.trim());
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      on();
    });
    return b;
  }

  private updateStatus() {
    const st = this.step;
    const status = this.card.querySelector<HTMLElement>(".status");
    if (!st || !status) return;
    if (!this.needsTarget(st) || this.target) {
      status.hidden = true;
      this.card.classList.remove("searching");
      return;
    }
    const waited = Date.now() - this.searchStarted;
    status.hidden = false;
    this.card.classList.add("searching");
    const lost = waited > 5000;
    const key = lost ? "lost" : "finding";
    if (status.dataset.key === key) return;
    status.dataset.key = key;
    status.innerHTML = "";
    const msg = el("span", "msg");
    msg.textContent = lost ? this.s.notFound : this.s.finding;
    if (!lost) status.append(el("span", "spin"));
    status.append(msg);
    if (lost && st.url && !this.urlMatches(st.url)) {
      const go = this.button(this.s.goToPage, "link", () => (location.href = st.url));
      status.append(go);
    }
  }

  /** Position ring and card; `force` re-positions even if the target did not move. */
  /** Open pop-ups next to the element (a date picker, lookup, menu): the card keeps clear of them. */
  private popups: DOMRect[] = [];
  private popupKey = "";
  private checkPopups() {
    const t = this.target;
    const found: DOMRect[] = [];
    if (t) {
      const tr = t.getBoundingClientRect();
      const max = window.innerWidth * window.innerHeight * 0.6;
      for (const p of Array.from(document.querySelectorAll(POPUPS))) {
        if (this.host.contains(p) || p.contains(t) || !isVisible(p)) continue;
        const r = p.getBoundingClientRect();
        if (r.width < 20 || r.height < 20 || r.width * r.height > max) continue;
        const gap = Math.max(r.left - tr.right, tr.left - r.right, r.top - tr.bottom, tr.top - r.bottom);
        if (gap < 200) found.push(r);
      }
    }
    const key = found.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`).join("|");
    if (key === this.popupKey) return;
    this.popupKey = key;
    this.popups = found;
    this.place(true);
  }

  private place(force: boolean) {
    if (this.stopped) return;
    const t = this.target;
    if (this.done) return;
    if (t && !t.isConnected) {
      this.target = null;
      this.lastRect = null;
      this.find();
      return;
    }
    if (!t) {
      this.ring.classList.remove("on");
      this.card.classList.add("floating");
      this.card.dataset.side = "none";
      this.card.style.left = "";
      this.card.style.top = "";
      return;
    }
    const r = t.getBoundingClientRect();
    if (!force && sameRect(this.lastRect, r)) return;
    this.lastRect = r;
    const pad = 4;
    // First placement for a (new) element: jump there instead of animating from the old spot.
    const jump = !this.ring.classList.contains("on");
    if (jump) this.ring.classList.add("jump");
    this.ring.style.left = `${r.left - pad}px`;
    this.ring.style.top = `${r.top - pad}px`;
    this.ring.style.width = `${r.width + pad * 2}px`;
    this.ring.style.height = `${r.height + pad * 2}px`;
    this.ring.classList.add("on");
    if (jump) {
      void this.ring.offsetWidth;
      this.ring.classList.remove("jump");
    }
    this.card.classList.remove("floating");
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W < 520) {
      // Phones: dock the card at the bottom, away from the element if it sits low.
      this.card.dataset.side = "dock";
      this.card.style.left = "";
      this.card.style.top = r.top > H * 0.55 ? "12px" : "";
      this.card.classList.toggle("dock-top", r.top > H * 0.55);
      return;
    }
    this.card.classList.remove("dock-top");
    // next to the element itself, on a side that keeps clear of open pop-ups (a date picker, a menu flyout)
    const box = { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    positionCard(this.card, box, W, H, 14, 12, this.popups.map((p) => ({ x: p.left, y: p.top, width: p.width, height: p.height })));
  }

  // ------------------------------------------------------------------ action detection

  private isTarget(node: EventTarget | null): boolean {
    const t = this.target;
    if (!t || !(node instanceof Node)) return false;
    if (t === node || t.contains(node)) return true;
    if (this.choices.some((c) => c === node || c.contains(node))) return true;
    // A click on the <label> of the target control (or the control of a target label).
    if (node instanceof HTMLLabelElement && node.control === t) return true;
    if (t instanceof HTMLLabelElement && t.control === node) return true;
    return false;
  }

  private advanceSoon(delay = 120) {
    if (this.advancing || this.paused) return;
    this.advancing = true;
    this.ring.classList.add("ok");
    // Persist first: the action may navigate away.
    this.save(this.i + 1);
    const at = this.i;
    window.setTimeout(() => {
      this.ring.classList.remove("ok");
      if (!this.stopped && this.i === at) this.next();
    }, delay);
  }

  private handleClick(e: Event) {
    const st = this.step;
    if (!st || this.done || this.host.contains(e.target as Node)) return;
    if (!this.isTarget(e.target)) return;
    if (st.action === "click") {
      // Runs in the capture phase, before the app reacts to the click.
      const nxt = this.proc.steps[this.i + 1];
      this.clickedWithNextVisible = nxt?.target && this.needsTarget(nxt) && this.resolve(nxt.target) ? this.i : -1;
      this.advanceSoon();
    }
    else if (st.action === "check" && !(this.target instanceof HTMLInputElement)) this.advanceSoon(); // custom checkbox
    else if (st.action === "select" && !(this.target instanceof HTMLSelectElement) && this.target?.getAttribute("role") !== "combobox") this.advanceSoon();
  }

  private handleChange(e: Event) {
    const st = this.step;
    if (!st || this.done || !this.isTarget(e.target)) return;
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (st.action === "type") {
      if ((t as HTMLInputElement).value?.trim()) this.advanceSoon(60);
    } else if (st.action === "select" || st.action === "check") this.advanceSoon(60);
  }

  private handleKey(e: KeyboardEvent) {
    const st = this.step;
    if (!st || this.done || this.host.contains(e.target as Node)) return;
    if (e.key === "Escape" && e.target === document.body) return;
    if (st.action === "press") {
      if (e.key.toLowerCase() === (st.value || "Enter").toLowerCase() && (!this.target || this.isTarget(e.target) || e.target === document.body)) this.advanceSoon(60);
      return;
    }
    if (st.action === "type" && e.key === "Enter" && this.isTarget(e.target) && (e.target as HTMLInputElement).value?.trim()) this.advanceSoon(60);
  }

  private handleNav() {
    this.target = null;
    this.lastRect = null;
    this.searchStarted = Date.now();
    this.find();
  }

  // ------------------------------------------------------------------ completion

  private complete() {
    this.done = true;
    window.clearInterval(this.poll);
    this.target = null;
    this.ring.classList.remove("on");
    this.clearSaved();
    const s = this.s;
    this.card.className = "card floating done";
    this.card.dataset.side = "none";
    this.card.style.left = "";
    this.card.style.top = "";
    this.card.innerHTML = "";
    const badge = el("div", "badge", ICON_CHECK);
    const title = el("div", "title");
    title.textContent = s.done;
    const sub = el("div", "desc", richText(this.proc.title));
    const actions = el("div", "actions");
    const close = this.button(s.close, "primary", () => this.stop("silent"));
    actions.append(el("span"), close);
    this.card.append(badge, title, sub, actions);
    this.opts.onEvent?.("complete", { processId: this.proc.id });
    close.focus({ preventScroll: true });
  }
}
