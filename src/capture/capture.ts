// Event capture: turns user interactions into CaptureEvents (see ARCHITECTURE "capture.js").
//  - click   → on pointerdown (capture phase) so the screenshot shows the state before the click;
//              keyboard activation (Enter/Space on a button/link) is captured from the click event
//  - type    → on change (or on Enter before the press step), value = final field value
//  - select  → on change, value = option LABEL, optionValue = option value
//  - check   → on change, value "true" | "false"
//  - press   → Enter / Escape in a field
// Pointer-downs on form controls are not steps (their change event is), nor are clicks on a <label>
// that only forwards to its control. Anything inside [data-steplight-ignore] is ignored.
import type { CaptureEvent, Target } from "../core/model.js";
import { actionableElement, isFormControl, isIgnored, isTextField, norm } from "./dom.js";
import { describeElement } from "./selectors.js";

export type Emit = (ev: CaptureEvent) => void | Promise<void>;

export interface CaptureOptions {
  /** Called when a text field gets focus (the extension pre-captures a screenshot of the empty field). */
  onFieldFocus?: (target: Target) => void;
}

interface State {
  emit: Emit;
  opts: CaptureOptions;
  lastValue: WeakMap<Element, string>;
  lastKey?: { el: Element; time: number };
  listeners: [string, EventListener][];
}

let state: State | null = null;

function baseEvent(action: CaptureEvent["action"], target?: Target): CaptureEvent {
  return {
    action,
    target,
    url: location.href,
    pageTitle: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timestamp: Date.now(),
  };
}

function send(ev: CaptureEvent) {
  try {
    const r = state?.emit(ev);
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
  } catch {
    /* never break the host page */
  }
}

function eventElement(e: Event): Element | null {
  const path = e.composedPath?.() ?? [];
  const first = (path[0] ?? e.target) as Node | null;
  if (!first) return null;
  return first.nodeType === Node.ELEMENT_NODE ? (first as Element) : first.parentElement;
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
}

function isSensitive(el: Element): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  return el.type === "password" || /cc-number|cc-csc|one-time-code|current-password|new-password/.test(ac);
}

function emitType(el: HTMLInputElement | HTMLTextAreaElement) {
  const value = el.value;
  state!.lastValue.set(el, value);
  const ev = baseEvent("type", describeElement(el));
  ev.value = value;
  if (isSensitive(el)) ev.sensitive = true;
  send(ev);
}

function onPointerDown(e: Event) {
  const pe = e as PointerEvent;
  if (pe.button !== undefined && pe.button !== 0) return;
  const raw = eventElement(e);
  if (!raw || isIgnored(raw)) return;
  const el = actionableElement(raw);
  if (el instanceof HTMLLabelElement) {
    if (el.control) return; // only forwards focus/toggle to its control; the control's change is the step
  }
  if (isFormControl(el)) return; // the change event becomes the step
  if (el.getAttribute("contenteditable") !== null && el.getAttribute("contenteditable") !== "false") return;
  if (isDisabled(el)) return;
  if (el === document.body || el === document.documentElement) return;
  send(baseEvent("click", describeElement(el)));
}

function onClick(e: Event) {
  const me = e as MouseEvent;
  if (me.detail !== 0 || !state?.lastKey) return; // only keyboard-activated clicks
  const raw = eventElement(e);
  if (!raw || isIgnored(raw)) return;
  const el = actionableElement(raw);
  const k = state.lastKey;
  state.lastKey = undefined;
  if (k.el !== el || Date.now() - k.time > 1000) return;
  if (isFormControl(el) || isDisabled(el)) return;
  send(baseEvent("click", describeElement(el)));
}

function onKeyDown(e: Event) {
  const ke = e as KeyboardEvent;
  const raw = eventElement(e);
  if (!raw || isIgnored(raw)) return;
  if (ke.isComposing) return;
  if (isTextField(raw) || raw instanceof HTMLSelectElement) {
    if (ke.key !== "Enter" && ke.key !== "Escape") return;
    if (raw instanceof HTMLTextAreaElement && ke.key === "Enter") return; // newline
    if (ke.key === "Enter" && (raw instanceof HTMLInputElement || raw instanceof HTMLTextAreaElement)) {
      const prev = state!.lastValue.get(raw);
      if (prev === undefined ? raw.value !== raw.defaultValue : prev !== raw.value) emitType(raw);
    }
    const ev = baseEvent("press", describeElement(raw));
    ev.value = ke.key;
    send(ev);
    return;
  }
  if (ke.key === "Enter" || ke.key === " ") state!.lastKey = { el: actionableElement(raw), time: Date.now() };
}

function onChange(e: Event) {
  const el = eventElement(e);
  if (!el || isIgnored(el)) return;
  if (el instanceof HTMLSelectElement) {
    if (el.multiple) {
      const opts = Array.from(el.selectedOptions);
      const ev = baseEvent("select", describeElement(el));
      ev.value = opts.map((o) => norm(o.text)).join(", ");
      ev.optionValue = opts.map((o) => o.value).join(",");
      send(ev);
      return;
    }
    const opt = el.options[el.selectedIndex];
    const ev = baseEvent("select", describeElement(el));
    ev.value = opt ? norm(opt.label || opt.text) : "";
    ev.optionValue = opt ? opt.value : "";
    send(ev);
    return;
  }
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const ev = baseEvent("check", describeElement(el));
    ev.value = String(el.checked);
    send(ev);
    return;
  }
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && isTextField(el)) {
    const prev = state!.lastValue.get(el);
    if (prev !== undefined && prev === el.value) return; // already emitted (e.g. on Enter)
    emitType(el);
  }
}

function onFocusIn(e: Event) {
  const el = eventElement(e);
  if (!el || isIgnored(el)) return;
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && isTextField(el)) {
    state!.lastValue.set(el, el.value);
    if (state!.opts.onFieldFocus) {
      try {
        state!.opts.onFieldFocus(describeElement(el));
      } catch {
        /* ignore */
      }
    }
  }
}

export function start(emit: Emit, opts: CaptureOptions = {}): void {
  if (state) stop();
  state = { emit, opts, lastValue: new WeakMap(), listeners: [] };
  const add = (type: string, fn: EventListener) => {
    window.addEventListener(type, fn, true);
    state!.listeners.push([type, fn]);
  };
  add("pointerdown", onPointerDown);
  add("click", onClick);
  add("keydown", onKeyDown);
  add("change", onChange);
  add("focusin", onFocusIn);
}

export function stop(): void {
  if (!state) return;
  for (const [type, fn] of state.listeners) window.removeEventListener(type, fn, true);
  state = null;
}

export function isRecording(): boolean {
  return !!state;
}
