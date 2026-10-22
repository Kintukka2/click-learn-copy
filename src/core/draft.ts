// Steps drafted from an imported written guide (Step.draft): the element a guide names ("Click **New**")
// becomes a Target with selectors built from its name, so instructions are generated and translated as
// for recorded steps and the element can be found in the live application. Pure functions, browser-safe.
import type { ActionType, Selector, Step, Target } from "./model.js";

export type ElementKind = "button" | "link" | "tab" | "menuitem" | "field" | "dropdown" | "checkbox" | "text";

export const ELEMENT_KINDS: { kind: ElementKind; label: string }[] = [
  { kind: "button", label: "Button" },
  { kind: "link", label: "Link or menu entry" },
  { kind: "tab", label: "Tab" },
  { kind: "menuitem", label: "Menu item" },
  { kind: "field", label: "Text field" },
  { kind: "dropdown", label: "Drop-down list" },
  { kind: "checkbox", label: "Check box" },
  { kind: "text", label: "Other text" },
];

const SHAPE: Record<ElementKind, { tag: string; role?: string; inputType?: string; byLabel?: boolean }> = {
  button: { tag: "button", role: "button" },
  link: { tag: "a", role: "link" },
  tab: { tag: "button", role: "tab" },
  menuitem: { tag: "button", role: "menuitem" },
  field: { tag: "input", role: "textbox", inputType: "text", byLabel: true },
  dropdown: { tag: "select", role: "combobox", byLabel: true },
  checkbox: { tag: "input", role: "checkbox", inputType: "checkbox", byLabel: true },
  text: { tag: "span" },
};

/** The kind of element an action usually works on, when a guide doesn't say. */
export function defaultKind(action: ActionType): ElementKind {
  if (action === "type") return "field";
  if (action === "select") return "dropdown";
  if (action === "check") return "checkbox";
  return "button";
}

/** A Target for the element a guide names: no screenshot position yet, selectors from the name. */
export function draftTarget(kind: ElementKind, name: string): Target {
  const n = name.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const s = SHAPE[kind];
  const selectors: Selector[] = [];
  if (s.byLabel) selectors.push({ kind: "label", value: n });
  if (s.role) selectors.push({ kind: "role", value: `${s.role}|${n}` });
  if (!s.byLabel) selectors.push({ kind: "text", value: n });
  return { selectors, tag: s.tag, role: s.role, inputType: s.inputType, name: n, label: s.byLabel ? n : undefined };
}

/** The kind and name of a step's element, for the Studio's element editor. */
export function draftElementOf(t: Target | undefined): { kind: ElementKind; name: string } | undefined {
  if (!t) return undefined;
  const name = t.label ?? t.name ?? "";
  const kind = (Object.keys(SHAPE) as ElementKind[]).find((k) => !!SHAPE[k].role && SHAPE[k].role === t.role) ?? "text";
  return { kind, name };
}

/** Steps of a process that the author still needs to check. */
export function flaggedSteps(steps: Step[]): Step[] {
  return steps.filter((s) => s.draft?.flag);
}
