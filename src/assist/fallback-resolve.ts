// Self-contained element resolver for Assist (same semantics as the capture contract):
// try target.selectors in order and return the first one that matches exactly one visible element.
// `index > 0` means the match was healed (a less robust selector was needed).
import type { Selector, Target } from "../core/model.js";

export interface Resolved {
  element: Element;
  index: number;
  selector: Selector;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function cssEscape(v: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&");
}

export function isVisible(el: Element): boolean {
  if (!(el as HTMLElement).isConnected) return false;
  if (el.closest("[data-steplight-ignore]")) return false;
  const rects = el.getClientRects();
  if (!rects.length) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.01;
}

/** ARIA role, explicit or implicit (the subset recorders produce). */
export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.split(/\s+/)[0];
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || tag === "summary") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (tag === "select") return (el as HTMLSelectElement).multiple ? "listbox" : "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "option") return "option";
  if (tag === "input") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (["button", "submit", "reset", "image"].includes(t)) return "button";
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "range") return "slider";
    if (t === "search") return "searchbox";
    if (["text", "email", "tel", "url", "password", "number", ""].includes(t)) return "textbox";
  }
  if (/^h[1-6]$/.test(tag)) return "heading";
  return "";
}

function labelText(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  const id = el.getAttribute("id");
  if (id) doc.querySelectorAll(`label[for="${cssEscape(id)}"]`).forEach((l) => parts.push(l.textContent ?? ""));
  const wrap = el.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
    parts.push(clone.textContent ?? "");
  }
  return parts.join(" ");
}

/** Accessible name (a pragmatic approximation of the accname algorithm). */
export function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const aria = el.getAttribute("aria-label");
  if (aria) return norm(aria);
  const lb = el.getAttribute("aria-labelledby");
  if (lb) {
    const t = lb
      .split(/\s+/)
      .map((i) => doc.getElementById(i)?.textContent ?? "")
      .join(" ");
    if (norm(t)) return norm(t);
  }
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") {
    const l = labelText(el);
    if (norm(l)) return norm(l);
    const t = ((el as HTMLInputElement).type || "").toLowerCase();
    if (["button", "submit", "reset"].includes(t)) return norm((el as HTMLInputElement).value);
    return norm(el.getAttribute("placeholder") || el.getAttribute("title") || "");
  }
  const text = norm(el.textContent);
  return text || norm(el.getAttribute("title") || "");
}

const CLICKABLE = "a,button,summary,label,input,select,textarea,[role],[onclick],[tabindex],li,td,th,span,div";

function byText(doc: Document, v: string): Element[] {
  const want = norm(v);
  const hits = Array.from(doc.querySelectorAll(CLICKABLE)).filter((e) => norm(e.textContent) === want || (e as HTMLInputElement).value === v);
  // Prefer the innermost matches (a <span> inside a <button> -> keep the button only if no interactive child).
  const inner = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)));
  const interactive = inner.map((e) => e.closest("a,button,[role=button],[role=tab],[role=menuitem],[role=link],[role=option],summary,label") ?? e);
  return Array.from(new Set(interactive));
}

function controlsByLabel(doc: Document, v: string): Element[] {
  const want = norm(v);
  const out: Element[] = [];
  doc.querySelectorAll("input,select,textarea,[role=textbox],[role=combobox],[role=checkbox],[role=switch],[contenteditable=true]").forEach((el) => {
    if (norm(labelText(el)) === want || norm(el.getAttribute("aria-label")) === want || accessibleName(el) === want) out.push(el);
  });
  return out;
}

export function candidates(sel: Selector, doc: Document): Element[] {
  const v = sel.value;
  try {
    switch (sel.kind) {
      case "testid":
        return Array.from(doc.querySelectorAll(`[data-testid="${cssEscape(v)}"],[data-test="${cssEscape(v)}"],[data-qa="${cssEscape(v)}"]`));
      case "clid":
        return Array.from(doc.querySelectorAll(`[data-clid="${cssEscape(v)}"]`));
      case "id": {
        return Array.from(doc.querySelectorAll(`[id="${cssEscape(v)}"]`));
      }
      case "role": {
        const bar = v.indexOf("|");
        const role = bar >= 0 ? v.slice(0, bar) : v;
        const name = norm(bar >= 0 ? v.slice(bar + 1) : "");
        const all = Array.from(doc.querySelectorAll(`[role="${cssEscape(role)}"],a,button,input,select,textarea,summary,option,h1,h2,h3,h4,h5,h6`));
        return all.filter((e) => roleOf(e) === role && (!name || accessibleName(e) === name));
      }
      case "label":
        return controlsByLabel(doc, v);
      case "placeholder":
        return Array.from(doc.querySelectorAll(`[placeholder="${cssEscape(v)}"]`));
      case "text":
        return byText(doc, v);
      case "css":
        return Array.from(doc.querySelectorAll(v));
      case "xpath": {
        const res = doc.evaluate(v, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const out: Element[] = [];
        for (let i = 0; i < res.snapshotLength; i++) {
          const n = res.snapshotItem(i);
          if (n instanceof Element) out.push(n);
        }
        return out;
      }
    }
  } catch {
    return [];
  }
  return [];
}

export function resolveTarget(target: Target, root: Document = document): Resolved | null {
  const sels = target.selectors ?? [];
  for (let i = 0; i < sels.length; i++) {
    let found = candidates(sels[i], root).filter(isVisible);
    if (found.length > 1 && target.tag) {
      const sameTag = found.filter((e) => e.tagName.toLowerCase() === target.tag);
      if (sameTag.length) found = sameTag;
    }
    if (found.length > 1 && target.name) {
      const named = found.filter((e) => accessibleName(e) === norm(target.name));
      if (named.length) found = named;
    }
    if (found.length === 1) return { element: found[0], index: i, selector: sels[i] };
  }
  // Last resort: role + name / label from the target description.
  if (target.role && target.name) {
    const sel: Selector = { kind: "role", value: `${target.role}|${target.name}` };
    const found = candidates(sel, root).filter(isVisible);
    if (found.length === 1) return { element: found[0], index: sels.length, selector: sel };
  }
  if (target.label) {
    const sel: Selector = { kind: "label", value: target.label };
    const found = candidates(sel, root).filter(isVisible);
    if (found.length === 1) return { element: found[0], index: sels.length, selector: sel };
  }
  return null;
}
