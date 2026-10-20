// Recording sessions: the extension (or the Playwright recorder) streams CapturePayloads here and
// they become Steps. Noise reduction happens here so every capture source benefits:
//  - a click into a text field followed by typing into the same field collapses into one "type" step
//  - repeated "type" events on the same field keep only the final value
//  - a click on a <select>/checkbox immediately followed by its select/check event is dropped
import { newId, now } from "../core/ids.js";
import { instructionFor } from "../core/instructions.js";
import type { CapturePayload, Process, Step, Target } from "../core/model.js";
import type { Store } from "./store.js";

interface Session {
  token: string;
  processId: string;
  startedAt: string;
  count: number;
  active: boolean;
}

const sessions = new Map<string, Session>();

export function startSession(store: Store, processId: string, replace = false): Session | undefined {
  const proc = store.getProcess(processId);
  if (!proc) return undefined;
  if (replace) store.updateProcess(processId, { steps: [], localizations: {}, lastReplay: undefined });
  // only one active session per process
  for (const s of sessions.values()) if (s.processId === processId) s.active = false;
  const s: Session = { token: newId("rec"), processId, startedAt: now(), count: 0, active: true };
  sessions.set(s.token, s);
  return s;
}

export function getSession(token: string) {
  return sessions.get(token);
}

export function activeSessions() {
  return [...sessions.values()].filter((s) => s.active);
}

export function stopSession(token: string) {
  const s = sessions.get(token);
  if (s) s.active = false;
  return s;
}

function sameTarget(a?: Target, b?: Target): boolean {
  if (!a || !b) return false;
  const ka = a.selectors[0];
  const kb = b.selectors[0];
  if (ka && kb && ka.kind === kb.kind && ka.value === kb.value) return true;
  return !!a.name && a.name === b.name && a.tag === b.tag && a.label === b.label;
}

function sameField(name: string, t?: Target): boolean {
  const n = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return !!t && !!n(name) && (n(name) === n(t.label) || n(name) === n(t.name));
}

function isTextField(t?: Target) {
  if (!t) return false;
  if (t.tag === "textarea") return true;
  if (t.tag === "input") return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(t.inputType ?? "text");
  return t.role === "textbox" || t.role === "searchbox";
}

/** Apply one captured event to a process. Returns the affected step (or undefined if dropped). */
export function applyCapture(store: Store, proc: Process, payload: CapturePayload): Step | undefined {
  const ev = payload.event;
  const steps = proc.steps;
  const last = steps[steps.length - 1];

  // collapse type-after-type on the same field
  if (ev.action === "type" && last && last.action === "type" && sameTarget(last.target, ev.target)) {
    last.value = ev.value;
    last.sensitive = ev.sensitive || last.sensitive;
    if (!last.titleEdited) last.title = instructionFor({ action: "type", target: last.target, value: last.value, sensitive: last.sensitive }, proc.lang);
    store.saveProcess(proc);
    return last;
  }

  // a click that only focused a field (or opened a select / toggled a checkbox) is replaced by the real action
  const absorbs =
    last &&
    last.action === "click" &&
    sameTarget(last.target, ev.target) &&
    ((ev.action === "type" && isTextField(last.target)) || ev.action === "select" || ev.action === "check");
  // opening a field's calendar, then picking a day, is one step: the date that went into the field
  const pickedDate = last?.action === "click" && last.target?.field?.kind === "calendar" && ev.action === "type" && isTextField(ev.target) && sameField(last.target.field.name, ev.target);

  // Don't record pressing Enter right after typing as a separate step if the author didn't want it?
  // We keep it: "Press Enter" is a real instruction in many ERPs.

  let screenshot: string | undefined;
  if (payload.screenshotDataUrl) screenshot = store.saveMedia(proc.projectId, payload.screenshotDataUrl);

  const step: Step = {
    id: newId("stp"),
    action: ev.action,
    target: ev.target,
    value: ev.value,
    optionValue: ev.optionValue,
    sensitive: ev.sensitive,
    url: ev.url,
    pageTitle: ev.pageTitle,
    title: instructionFor({ action: ev.action, target: ev.target, value: ev.value, sensitive: ev.sensitive }, proc.lang),
    screenshot,
    viewport: ev.viewport,
    capturedAt: now(),
  };

  if (pickedDate) {
    // the calendar button's screenshot shows the field before the date was picked
    step.screenshot = last.screenshot ?? step.screenshot;
    steps[steps.length - 1] = step;
  } else if (absorbs) {
    // keep the click's screenshot (taken before the field had focus) if the new event has none
    step.screenshot = step.screenshot ?? last.screenshot;
    steps[steps.length - 1] = step;
  } else {
    steps.push(step);
  }
  markLearnerChoice(proc, step);
  if (!proc.startUrl) proc.startUrl = ev.url;
  store.saveProcess(proc);
  return step;
}

const lower = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Typing a value into a search/filter field and then clicking the row link that shows it (e.g. "000992"
 * in Filter, then the requisition 000992) is an example, not the one record every learner needs: both
 * steps become "learner chooses", so Assist accepts any value and any row.
 */
function markLearnerChoice(proc: Process, click: Step) {
  if (click.action !== "click" || !click.target?.row) return;
  const name = lower(click.target.name);
  const i = proc.steps.indexOf(click);
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
    const t = proc.steps[j];
    if (t.action !== "type") continue;
    const v = lower(t.value);
    if (t.sensitive || v.length < 2 || !name || !(name.includes(v) || v.includes(name))) return;
    for (const s of [t, click]) {
      s.learnerChooses = true;
      if (!s.titleEdited) s.title = instructionFor({ action: s.action, target: s.target, value: s.value, sensitive: s.sensitive, learnerChooses: true, hint: s.choiceHint }, proc.lang);
    }
    return;
  }
}
