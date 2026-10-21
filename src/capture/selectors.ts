// Selector generation: several candidates for one element, ordered by robustness
// (testid > clid > stable id > role|name > label > placeholder > text > css path).
// A candidate is only kept if it identifies the element uniquely at capture time
// (optionally within its context — dialog / FastTab), because resolution requires uniqueness.
import type { Selector, Target } from "../core/model.js";
import { accessibleName, bboxOf, contextOf, getRole, inputType, isFormControl, labelOf, norm, visibleText } from "./dom.js";
import { matchesForSelector } from "./resolve.js";
import { fieldButtonOf } from "./fields.js";
import { rowPlaceOf } from "./rows.js";

const TESTID_ATTRS = ["data-testid", "data-test", "data-qa", "data-test-id", "data-cy"];

/** Heuristic for auto-generated ids that will not survive a reload or a new release. */
export function looksGeneratedId(id: string): boolean {
  if (!id || id.length > 64) return true;
  if (/^\d/.test(id)) return true;
  if (/\d{3,}/.test(id)) return true; // ext-gen1234, ember123, field_0042
  if (/[:{}]/.test(id)) return true; // React useId ":r1:"
  if (/^(ember|ext-|ext-gen|mui-|react-|radix-|headlessui-|j_id|gwt-|yui_|ui-id-|ng-|cdk-|mat-|rc-|uid-|el-|x-auto)/i.test(id)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return true; // uuid
  // long hex/base36 chunks that mix letters and digits, e.g. "a8f3k2x9" / "c4ca4238a0b9"
  for (const part of id.split(/[-_.]/)) {
    if (part.length >= 6 && /\d/.test(part) && /[a-z]/i.test(part) && !/^[a-z]+\d{1,2}$/i.test(part)) return true;
  }
  return false;
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");
}

function attrValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Structural CSS path anchored at the nearest ancestor with a stable id. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let n: Element | null = el;
  while (n && n.nodeType === Node.ELEMENT_NODE && n !== n.ownerDocument.documentElement) {
    const id = n.getAttribute("id");
    if (id && !looksGeneratedId(id) && n.ownerDocument.querySelectorAll(`#${cssEscape(id)}`).length === 1) {
      parts.unshift(`#${cssEscape(id)}`);
      break;
    }
    const tag = n.tagName.toLowerCase();
    const parent: Element | null = n.parentElement;
    if (!parent || tag === "body") {
      parts.unshift(tag);
      break;
    }
    const same = Array.from(parent.children).filter((c) => c.tagName === n!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
    n = parent;
  }
  return parts.join(" > ");
}

function unique(sel: Selector, el: Element, context: string, doc: Document): boolean {
  try {
    const m = matchesForSelector(sel, doc);
    if (m.length === 1) return m[0] === el;
    if (m.length > 1 && context && m.includes(el)) {
      const inCtx = m.filter((x) => contextOf(x) === context);
      return inCtx.length === 1 && inCtx[0] === el;
    }
  } catch {
    /* invalid selector */
  }
  return false;
}

/** Generate the ordered selector candidates for an element. */
export function generateSelectors(el: Element, opts: { role?: string; name?: string; label?: string; context?: string } = {}): Selector[] {
  const doc = el.ownerDocument;
  const role = opts.role ?? getRole(el);
  const name = opts.name ?? accessibleName(el);
  const label = opts.label ?? (isFormControl(el) ? labelOf(el) : "");
  const context = opts.context ?? contextOf(el);
  const out: Selector[] = [];
  const push = (s: Selector, check = true) => {
    if (!s.value) return;
    if (out.some((o) => o.kind === s.kind && o.value === s.value)) return;
    if (!check || unique(s, el, context, doc)) out.push(s);
  };

  for (const a of TESTID_ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      push({ kind: "testid", value: v });
      break;
    }
  }
  const clid = el.getAttribute("data-clid");
  if (clid) push({ kind: "clid", value: clid });
  const id = el.getAttribute("id");
  if (id && !looksGeneratedId(id)) push({ kind: "id", value: id });
  if (role && name && name.length <= 80 && !["generic", "presentation", "none"].includes(role)) push({ kind: "role", value: `${role}|${name}` });
  if (label && label.length <= 80) push({ kind: "label", value: label });
  const ph = norm(el.getAttribute("placeholder"));
  if (ph) push({ kind: "placeholder", value: ph });
  if (!isFormControl(el)) {
    const text = visibleText(el);
    if (text && text.length <= 60) push({ kind: "text", value: text });
  }
  push({ kind: "css", value: cssPath(el) }, false);
  return out;
}

/** Full Target description of an element: selectors + role/name/label/bbox/context. */
export function describeElement(el: Element): Target {
  const role = getRole(el);
  const name = accessibleName(el);
  const label = isFormControl(el) ? labelOf(el) : "";
  const context = contextOf(el);
  const t: Target = {
    selectors: generateSelectors(el, { role, name, label, context }),
    tag: el.tagName.toLowerCase(),
    bbox: bboxOf(el),
  };
  if (role) t.role = role;
  if (name) t.name = name;
  if (label) t.label = label;
  const it = inputType(el);
  if (it) t.inputType = it;
  if (context) t.context = context;
  const row = rowPlaceOf(el, cssPath);
  if (row) t.row = row;
  const field = name ? undefined : fieldButtonOf(el);
  if (field) t.field = field;
  return t;
}

export { attrValue };
