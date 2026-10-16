// Resolve a recorded Target back to a live element: try the selectors in order and return the
// first one that matches exactly one visible element (ties broken by the recorded context).
// Used by capture.js (SteplightCapture.resolve → Replay) and by the Assist overlay.
import type { Selector, Target } from "../core/model.js";
import { accessibleName, contextOf, getRole, INTERACTIVE_SELECTOR, isVisible, labelOf, norm, sameText, visibleText } from "./dom.js";

export interface ResolveResult {
  element: Element;
  index: number;
  selector: Selector;
}

const FORM_CONTROLS = "input:not([type=hidden]), select, textarea, [role=textbox], [role=combobox], [role=searchbox], [role=spinbutton], [role=checkbox], [role=radio], [role=switch], [role=slider], [role=listbox]";

// Elements that can carry each implicit role, to avoid computing roles for the whole DOM.
const IMPLICIT_ROLE_TAGS: Record<string, string> = {
  button: "button, summary, input[type=button], input[type=submit], input[type=reset], input[type=image]",
  link: "a[href], area[href]",
  textbox: "input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=password], input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], textarea",
  searchbox: "input[type=search]",
  combobox: "select, input[list]",
  listbox: "select",
  checkbox: "input[type=checkbox]",
  radio: "input[type=radio]",
  spinbutton: "input[type=number]",
  slider: "input[type=range]",
  heading: "h1, h2, h3, h4, h5, h6",
  option: "option",
  cell: "td",
  row: "tr",
  img: "img",
  dialog: "dialog",
  navigation: "nav",
  listitem: "li",
  columnheader: "th",
  rowheader: "th",
};

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");
}
function attr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function candidatesForRole(role: string, doc: Document): Element[] {
  const tags = IMPLICIT_ROLE_TAGS[role];
  const sel = tags ? `${tags}, [role~="${attr(role)}"]` : `[role~="${attr(role)}"]`;
  return Array.from(doc.querySelectorAll(sel)).filter((el) => getRole(el) === role);
}

/** All elements matching one selector (visibility not checked). */
export function matchesForSelector(sel: Selector, doc: Document = document): Element[] {
  const v = sel.value ?? "";
  switch (sel.kind) {
    case "testid":
      return Array.from(doc.querySelectorAll(["data-testid", "data-test", "data-qa", "data-test-id", "data-cy"].map((a) => `[${a}="${attr(v)}"]`).join(",")));
    case "clid":
      return Array.from(doc.querySelectorAll(`[data-clid="${attr(v)}"]`));
    case "id":
      return Array.from(doc.querySelectorAll(`#${cssEscape(v)}`));
    case "role": {
      const i = v.indexOf("|");
      const role = i >= 0 ? v.slice(0, i) : v;
      const name = i >= 0 ? v.slice(i + 1) : "";
      const els = candidatesForRole(role, doc);
      return name ? els.filter((el) => sameText(accessibleName(el), name)) : els;
    }
    case "label":
      return Array.from(doc.querySelectorAll(FORM_CONTROLS)).filter((el) => sameText(labelOf(el), v));
    case "placeholder":
      return Array.from(doc.querySelectorAll("[placeholder]")).filter((el) => sameText(el.getAttribute("placeholder"), v));
    case "text": {
      const clickable = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTOR)).filter((el) => sameText(visibleText(el), v));
      if (clickable.length) return clickable;
      // any element whose own text matches; keep the innermost ones
      const all = Array.from(doc.body?.querySelectorAll("*") ?? []).filter((el) => sameText(visibleText(el), v));
      return all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    }
    case "css":
      return Array.from(doc.querySelectorAll(v));
    case "xpath": {
      const out: Element[] = [];
      const r = doc.evaluate(v, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < r.snapshotLength; i++) {
        const n = r.snapshotItem(i);
        if (n instanceof Element) out.push(n);
      }
      return out;
    }
  }
  return [];
}

/** Pick the single visible element among matches, using the recorded context to break ties. */
function pickUnique(matches: Element[], target: Target): Element | null {
  const vis = matches.filter(isVisible);
  if (vis.length === 1) return vis[0];
  if (vis.length > 1 && target.context) {
    const ctx = norm(target.context);
    const inCtx = vis.filter((el) => contextOf(el) === ctx);
    if (inCtx.length === 1) return inCtx[0];
  }
  return null;
}

/**
 * Resolve a Target in a document. Tries the selectors in order; the first selector that matches
 * exactly one visible element wins. `index > 0` means a fallback selector matched (healed).
 */
export function resolveTarget(target: Target, root: Document = document): ResolveResult | null {
  const sels = target?.selectors ?? [];
  for (let index = 0; index < sels.length; index++) {
    const selector = sels[index];
    let matches: Element[];
    try {
      matches = matchesForSelector(selector, root);
    } catch {
      continue;
    }
    const el = pickUnique(matches, target);
    if (el) return { element: el, index, selector };
  }
  // last resort: an element with the same role and accessible name / label (selectors may all be stale)
  if (target?.role && (target.name || target.label)) {
    const els = candidatesForRole(target.role, root).filter((el) => (target.label && sameText(labelOf(el), target.label)) || (target.name && sameText(accessibleName(el), target.name)));
    const el = pickUnique(els, target);
    if (el) return { element: el, index: sels.length, selector: { kind: "role", value: `${target.role}|${target.name ?? target.label}` } };
  }
  return null;
}

/** Convenience for overlays: element or null. */
export function findElement(target: Target, root: Document = document): Element | null {
  return resolveTarget(target, root)?.element ?? null;
}

// re-exported so overlay code can show names without importing dom.ts separately
export { accessibleName, getRole, isVisible };
