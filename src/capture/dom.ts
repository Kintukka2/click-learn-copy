// DOM helpers shared by capture (recording), resolve (Replay / Assist) and the extension:
// ARIA role, accessible name (a pragmatic subset of the accname spec), form-control labels,
// context (dialog / FastTab / page heading), visibility and bounding boxes.
// Browser-only (uses the DOM), but free of any global side effects.
import type { Rect } from "../core/model.js";

export function norm(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s ]+/g, " ").trim();
}

/** Case-insensitive, whitespace-normalised comparison used for names and labels. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a).toLowerCase() === norm(b).toLowerCase();
}

const TEXT_INPUT_TYPES = new Set(["", "text", "email", "tel", "url", "search", "password", "number", "date", "datetime-local", "month", "week", "time"]);
const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "file", "range", "color", "hidden"]);

export function inputType(el: Element): string {
  return el instanceof HTMLInputElement ? (el.getAttribute("type") ?? "text").toLowerCase() : "";
}

/** A field whose value the user types (input text-likes, textarea, contenteditable textbox). */
export function isTextField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = inputType(el);
    return TEXT_INPUT_TYPES.has(t) || !NON_TEXT_INPUT_TYPES.has(t);
  }
  const role = el.getAttribute("role");
  return role === "textbox" || role === "searchbox";
}

/**
 * A read-only text box shown as a link: D365 draws grid links (a journal batch number, say) as
 * read-only text boxes with a hand cursor. No typing follows a click on one: the click is the step.
 */
export function isLinkField(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !isTextField(el)) return false;
  if (!el.readOnly && el.getAttribute("aria-readonly") !== "true") return false;
  return el.getAttribute("role") === "link" || /\bhyperlink\b/i.test(el.className) || getComputedStyle(el).cursor === "pointer";
}

/** Controls whose own change/input events produce the step (so their pointerdown is not a step). */
export function isFormControl(el: Element): boolean {
  if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = inputType(el);
    return !["button", "submit", "reset", "image", "file"].includes(t);
  }
  return false;
}

export function isLabelable(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLMeterElement ||
    el instanceof HTMLOutputElement ||
    el instanceof HTMLProgressElement
  );
}

// ------------------------------------------------------------------ role

export function getRole(el: Element): string {
  const explicit = norm(el.getAttribute("role")).split(" ")[0];
  if (explicit && explicit !== "presentation" && explicit !== "none") return explicit;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : "";
    case "button":
      return "button";
    case "summary":
      return "button";
    case "select": {
      const s = el as HTMLSelectElement;
      return s.multiple || s.size > 1 ? "listbox" : "combobox";
    }
    case "textarea":
      return "textbox";
    case "option":
      return "option";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "dialog":
      return "dialog";
    case "table":
      return "table";
    case "tr":
      return "row";
    case "td":
      return "cell";
    case "th":
      return el.closest("thead") ? "columnheader" : "rowheader";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "form":
      return "form";
    case "fieldset":
      return "group";
    case "progress":
      return "progressbar";
    case "input": {
      const t = inputType(el);
      if (t === "button" || t === "submit" || t === "reset" || t === "image") return "button";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "range") return "slider";
      if (t === "number") return "spinbutton";
      if (t === "search") return el.hasAttribute("list") ? "combobox" : "searchbox";
      if (t === "hidden" || t === "file" || t === "color") return "";
      return el.hasAttribute("list") ? "combobox" : "textbox";
    }
  }
  return "";
}

/** Roles whose accessible name may come from their content (accname "name from content"). */
const NAME_FROM_CONTENT = new Set([
  "button", "cell", "checkbox", "columnheader", "gridcell", "heading", "link", "menuitem", "menuitemcheckbox",
  "menuitemradio", "option", "radio", "row", "rowheader", "switch", "tab", "tooltip", "treeitem", "listitem",
]);

/** Elements that are interactive in their own right — the "actionable" ancestor of a pointer target. */
export const INTERACTIVE_SELECTOR = [
  "button", "a[href]", "input", "select", "textarea", "summary", "label",
  "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=menuitemcheckbox]", "[role=menuitemradio]",
  "[role=option]", "[role=checkbox]", "[role=radio]", "[role=switch]", "[role=treeitem]", "[role=gridcell]",
  "[role=combobox]", "[role=textbox]", "[role=searchbox]", "[role=slider]", "[contenteditable=true]", "[contenteditable='']",
].join(",");

// ------------------------------------------------------------------ visibility / geometry

export function isHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false;
  const style = getComputedStyle(el);
  return style.display === "none" || style.visibility === "hidden" || el.hasAttribute("hidden");
}

/** Rendered and visible to a user (non-zero size, not display:none / visibility:hidden / opacity 0 / inert). */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (typeof anyEl.checkVisibility === "function") {
    if (!anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })) return false;
  } else {
    for (let n: Element | null = el; n; n = n.parentElement) if (isHidden(n)) return false;
  }
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  if (el.closest("[inert]")) return false;
  return true;
}

export function bboxOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

// ------------------------------------------------------------------ accessible name

function byIdRefs(el: Element, attr: string): Element[] {
  const ids = norm(el.getAttribute(attr)).split(" ").filter(Boolean);
  const doc = el.ownerDocument;
  return ids.map((id) => doc.getElementById(id)).filter((x): x is HTMLElement => !!x);
}

/** Text of a subtree as a user would read it: skips hidden/aria-hidden parts, uses alt/aria-label of embedded nodes. */
export function textAlternative(node: Node, skip?: Element, depth = 0): string {
  if (depth > 25) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  if (skip && el === skip) return "";
  if (el.getAttribute("aria-hidden") === "true") return "";
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "template" || tag === "noscript") return "";
  if (depth > 0 && isHidden(el)) return "";
  if (depth > 0) {
    const al = norm(el.getAttribute("aria-label"));
    if (al) return " " + al + " ";
    if (tag === "img") return " " + norm(el.getAttribute("alt")) + " ";
    if (el instanceof HTMLInputElement && ["button", "submit", "reset"].includes(inputType(el))) return " " + el.value + " ";
    if (el instanceof HTMLSelectElement) return " " + (el.selectedOptions[0]?.text ?? "") + " ";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return " " + (el.value ?? "") + " ";
  }
  if (tag === "svg") {
    const t = el.querySelector("title");
    return t ? " " + norm(t.textContent) + " " : "";
  }
  let out = "";
  const block = /^(div|p|li|tr|td|th|h[1-6]|section|br|dt|dd)$/.test(tag);
  for (const child of Array.from(el.childNodes)) out += textAlternative(child, skip, depth + 1);
  return block ? ` ${out} ` : out;
}

/** Text of the label(s) of a form control (`<label for>`, wrapping label, aria-labelledby, aria-label). */
export function labelOf(el: Element): string {
  const lb = byIdRefs(el, "aria-labelledby");
  if (lb.length) return norm(lb.map((x) => textAlternative(x, el)).join(" "));
  const al = norm(el.getAttribute("aria-label"));
  if (al) return al;
  if (isLabelable(el)) {
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) {
      const t = norm(Array.from(labels).map((l) => textAlternative(l, el)).join(" "));
      if (t) return stripRequiredMarker(t);
    }
  }
  return "";
}

function stripRequiredMarker(s: string): string {
  return s.replace(/\s*[*:]\s*$/, "").trim();
}

/** Accessible name — the subset of accname that real apps actually rely on. */
export function accessibleName(el: Element): string {
  const lb = byIdRefs(el, "aria-labelledby");
  if (lb.length) {
    const t = norm(lb.map((x) => textAlternative(x, el)).join(" "));
    if (t) return t;
  }
  const al = norm(el.getAttribute("aria-label"));
  if (al) return al;
  const tag = el.tagName.toLowerCase();
  if (el instanceof HTMLInputElement) {
    const t = inputType(el);
    if (t === "button" || t === "submit" || t === "reset") return norm(el.value) || (t === "submit" ? "Submit" : t === "reset" ? "Reset" : "");
    if (t === "image") return norm(el.alt) || norm(el.title);
  }
  if (isLabelable(el) && tag !== "button") {
    const lab = labelOf(el);
    if (lab) return lab;
  }
  if (tag === "img" || tag === "area") {
    const alt = norm(el.getAttribute("alt"));
    if (alt) return alt;
  }
  if (tag === "fieldset") {
    const legend = el.querySelector(":scope > legend");
    if (legend) return norm(textAlternative(legend));
  }
  if (tag === "table") {
    const cap = el.querySelector(":scope > caption");
    if (cap) return norm(textAlternative(cap));
  }
  const role = getRole(el);
  if (NAME_FROM_CONTENT.has(role) || tag === "button" || tag === "a" || tag === "label") {
    const t = norm(textAlternative(el));
    if (t) return t;
  }
  const title = norm(el.getAttribute("title"));
  if (title) return title;
  const ph = norm(el.getAttribute("placeholder") ?? el.getAttribute("aria-placeholder"));
  if (ph) return ph;
  if (tag === "button" && el instanceof HTMLButtonElement) {
    const lab = labelOf(el);
    if (lab) return lab;
  }
  return "";
}

/** Short visible text of an element (used for text selectors), capped. */
export function visibleText(el: Element): string {
  const t = el instanceof HTMLElement ? el.innerText : el.textContent;
  return norm(t);
}

// ------------------------------------------------------------------ context

/** Where the element sits: dialog title, FastTab / section / fieldset name, or the page heading. */
export function contextOf(el: Element): string {
  const dialog = el.closest("dialog, [role=dialog], [role=alertdialog]");
  if (dialog) {
    const name = accessibleNameOfContainer(dialog);
    if (name) return name;
  }
  for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
    const tag = n.tagName.toLowerCase();
    const role = n.getAttribute("role");
    if (tag === "fieldset" || tag === "section" || tag === "form" || role === "region" || role === "group" || role === "tabpanel" || role === "menu" || role === "toolbar" || n.classList.contains("fasttab")) {
      const name = accessibleNameOfContainer(n);
      if (name) return name;
    }
    if (tag === "nav" || role === "navigation") {
      const name = accessibleNameOfContainer(n);
      if (name) return name;
    }
  }
  const h1 = el.ownerDocument.querySelector("main h1, [role=main] h1, h1");
  return h1 ? norm(textAlternative(h1)) : "";
}

function accessibleNameOfContainer(c: Element): string {
  const lb = byIdRefs(c, "aria-labelledby");
  if (lb.length) return norm(lb.map((x) => textAlternative(x)).join(" "));
  const al = norm(c.getAttribute("aria-label"));
  if (al) return al;
  const legend = c.querySelector(":scope > legend");
  if (legend) return norm(textAlternative(legend));
  const heading = c.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header h1, :scope > header h2, :scope > header h3, :scope > div > h2, :scope > div > h3");
  if (heading) return norm(textAlternative(heading));
  return "";
}

/** Walk from a raw event target to the element the user meant (nearest interactive ancestor). */
export function actionableElement(raw: Element): Element {
  const hit = raw.closest(INTERACTIVE_SELECTOR);
  if (hit) return hit;
  // clickable rows/cards with handlers marked by tabindex
  const focusable = raw.closest("[tabindex]:not([tabindex='-1'])");
  if (focusable && focusable !== raw.ownerDocument.body && focusable.getBoundingClientRect().width < 900) return focusable;
  return raw;
}

/** True when the event originated inside an element that asks Steplight to ignore it (Assist overlay etc.). */
export function isIgnored(el: Element | null): boolean {
  return !!el?.closest("[data-steplight-ignore]");
}
