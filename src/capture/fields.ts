// Buttons that belong to a form field (D365's calendar and lookup buttons: a nameless
// div.lookupButton inside the field's container), and calendar pop-ups that fill a date field.
import type { FieldButton } from "../core/model.js";
import { accessibleName, isTextField, labelOf, norm } from "./dom.js";
import { isCalendarDay } from "./rows.js";

const CONTROLS = "input, textarea, select, [role=combobox], [role=textbox], [role=spinbutton]";
const DATE_HINT = /date|calendar|datetime|datepicker/i;
const LOOKUP_HINT = /lookup|dropdown|combo|picker/i;

/** The text field of the closest container around el that holds exactly one field. */
function fieldAround(el: Element): Element | null {
  let n: Element | null = el.parentElement;
  for (let depth = 0; n && depth < 5; depth++, n = n.parentElement) {
    const controls = Array.from(n.querySelectorAll(CONTROLS)).filter((c) => c !== el && !el.contains(c));
    if (controls.length === 1) return controls[0];
    if (controls.length > 1) return null;
  }
  return null;
}

function fieldName(f: Element): string {
  return norm(accessibleName(f) || labelOf(f));
}

/** For a nameless button inside a field's container: which field it opens, and whether it is its calendar or lookup. */
export function fieldButtonOf(el: Element): FieldButton | undefined {
  if (accessibleName(el) || el.matches(CONTROLS)) return undefined;
  const f = fieldAround(el);
  const name = f ? fieldName(f) : "";
  if (!f || !name || name.length > 80) return undefined;
  let classes = "";
  for (let n: Element | null = el; n && n !== f.parentElement; n = n.parentElement) classes += ` ${n.getAttribute("class") ?? ""}`;
  const type = (f as HTMLInputElement).type ?? "";
  if (DATE_HINT.test(classes) || /^(date|datetime-local|month|week)$/.test(type)) return { kind: "calendar", name };
  if (LOOKUP_HINT.test(classes) || f.getAttribute("role") === "combobox") return { kind: "lookup", name };
  return { kind: "button", name };
}

/**
 * A click on a nameless box around one named field (D365 draws a field's label, input and
 * calendar button in a div that takes clicks on its padding): the field it was meant for.
 */
export function fieldInside(el: Element): Element | null {
  if (accessibleName(el) || el.matches(CONTROLS)) return null;
  const controls = Array.from(el.querySelectorAll(CONTROLS)).filter((c) => (c as HTMLElement).offsetParent !== null || c.getClientRects().length > 0);
  if (controls.length !== 1) return null;
  const name = fieldName(controls[0]);
  if (!name || name.length > 80) return null;
  // only a box close around the field (label, input, buttons), not a whole panel with one field in it
  const a = el.getBoundingClientRect();
  const f = controls[0].getBoundingClientRect();
  return a.width * a.height <= Math.max(1, f.width * f.height) * 6 ? controls[0] : null;
}

let pickerField: { input: HTMLInputElement; at: number } | null = null;

/** Remember the date field whose calendar button was just clicked: its calendar pop-up fills it. */
export function noteFieldButton(el: Element) {
  const f = fieldButtonOf(el);
  const input = f?.kind === "calendar" ? fieldAround(el) : null;
  pickerField = input instanceof HTMLInputElement ? { input, at: Date.now() } : null;
}

/**
 * The text field a click on a calendar day fills: the field whose calendar button was clicked last
 * (within a minute), or else the focused text field. Null when the click is not on a calendar day.
 */
export function dateFieldForDay(el: Element): HTMLInputElement | null {
  if (!isCalendarDay(el)) return null;
  if (pickerField && pickerField.input.isConnected && Date.now() - pickerField.at < 60_000) return pickerField.input;
  const a = el.ownerDocument.activeElement;
  return a instanceof HTMLInputElement && isTextField(a) && !a.contains(el) ? a : null;
}

export function forgetPickerField() {
  pickerField = null;
}
