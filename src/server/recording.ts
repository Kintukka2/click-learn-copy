// Recording sessions: the extension (or the Playwright recorder) streams CapturePayloads here and
// they become Steps. Noise reduction happens here so every capture source benefits:
//  - a click into a text field followed by typing into the same field collapses into one "type" step
//  - repeated "type" events on the same field keep only the final value
//  - a click on a <select>/checkbox immediately followed by its select/check event is dropped
// A session can also record a process drafted from a written guide (build: true): the extension
// shows each draft step in the application and every action either becomes that step or an extra
// step before it (applyBuildCapture).
import { canLearnerChoose } from "../core/choice.js";
import { draftMatches } from "../core/draft.js";
import { newId, now } from "../core/ids.js";
import { instructionFor } from "../core/instructions.js";
import type { CaptureEvent, CapturePayload, Lang, Process, ResolvedProcess, Step, Target } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import type { Store } from "./store.js";

interface Session {
  token: string;
  processId: string;
  startedAt: string;
  count: number;
  active: boolean;
  /** Recording a process drafted from a guide: actions replace its draft steps. */
  build?: boolean;
}

const sessions = new Map<string, Session>();

/**
 * Per build session: the steps recorded in it, the draft each recorded draft step replaced, and the
 * extra steps (actions the guide doesn't have), which "That was this step" can turn into a draft step.
 */
const builds = new Map<string, { recorded: Set<string>; replaced: Map<string, Step>; extras: Set<string> }>();
function buildOf(token: string) {
  let b = builds.get(token);
  if (!b) builds.set(token, (b = { recorded: new Set(), replaced: new Map(), extras: new Set() }));
  return b;
}

export function startSession(store: Store, processId: string, replace = false, build = false): Session | undefined {
  const proc = store.getProcess(processId);
  if (!proc) return undefined;
  if (replace && !build) store.updateProcess(processId, { steps: [], localizations: {}, lastReplay: undefined });
  // only one active session per process
  for (const s of sessions.values()) if (s.processId === processId) s.active = false;
  const s: Session = { token: newId("rec"), processId, startedAt: now(), count: 0, active: true };
  if (build) s.build = true;
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
  builds.delete(token);
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

const titleOf = (s: Step, lang: Lang) => instructionFor({ action: s.action, target: s.target, value: s.value, sensitive: s.sensitive, learnerChooses: s.learnerChooses, hint: s.choiceHint }, lang);

/**
 * How a new action replaces the click recorded just before it: "absorb", a click that only focused a
 * field (or opened a select / toggled a checkbox) before its real action; "date", opening a field's
 * calendar before picking a day, which is one step: the date that went into the field.
 */
function supersedes(last: Step | undefined, ev: CaptureEvent): "absorb" | "date" | undefined {
  if (!last || last.action !== "click") return undefined;
  if (sameTarget(last.target, ev.target) && ((ev.action === "type" && isTextField(last.target)) || ev.action === "select" || ev.action === "check")) return "absorb";
  if (last.target?.field?.kind === "calendar" && ev.action === "type" && isTextField(ev.target) && sameField(last.target.field.name, ev.target)) return "date";
  return undefined;
}

/** The screenshot of the step that replaces `last`: the calendar click's shows the field before the date was picked. */
function keepShot(step: Step, last: Step, how: "absorb" | "date") {
  step.screenshot = how === "date" ? (last.screenshot ?? step.screenshot) : (step.screenshot ?? last.screenshot);
}

/** A new step for a captured event (its screenshot saved to the project's media). */
function newStep(store: Store, proc: Process, payload: CapturePayload): Step {
  const ev = payload.event;
  const step: Step = {
    id: newId("stp"),
    action: ev.action,
    target: ev.target,
    value: ev.value,
    optionValue: ev.optionValue,
    sensitive: ev.sensitive,
    url: ev.url,
    pageTitle: ev.pageTitle,
    title: "",
    screenshot: payload.screenshotDataUrl ? store.saveMedia(proc.projectId, payload.screenshotDataUrl) : undefined,
    viewport: ev.viewport,
    capturedAt: now(),
  };
  step.title = titleOf(step, proc.lang) || (step.action === "note" ? (NOTE_TITLE[proc.lang] ?? NOTE_TITLE.en) : "");
  return step;
}

/** The title of a note added while recording (the recorder's Note button), until the author writes one. */
const NOTE_TITLE: Record<Lang, string> = { en: "Note", da: "Bemærk", de: "Hinweis", fr: "Remarque", es: "Nota", nl: "Opmerking", sv: "Obs" };

/** Typing again into the field of `last`: it keeps the final value. */
function retype(last: Step | undefined, ev: CaptureEvent, lang: Lang): boolean {
  if (ev.action !== "type" || last?.action !== "type" || !sameTarget(last.target, ev.target)) return false;
  last.value = ev.value;
  last.sensitive = ev.sensitive || last.sensitive;
  if (!last.titleEdited) last.title = titleOf(last, lang);
  return true;
}

/** Apply one captured event to a process. Returns the affected step (or undefined if dropped). */
export function applyCapture(store: Store, proc: Process, payload: CapturePayload): Step | undefined {
  const ev = payload.event;
  const steps = proc.steps;
  const last = steps[steps.length - 1];

  // collapse type-after-type on the same field
  if (retype(last, ev, proc.lang)) {
    store.saveProcess(proc);
    return last;
  }

  // Don't record pressing Enter right after typing as a separate step if the author didn't want it?
  // We keep it: "Press Enter" is a real instruction in many ERPs.

  const step = newStep(store, proc, payload);
  const how = supersedes(last, ev);
  if (how) {
    keepShot(step, last, how);
    steps[steps.length - 1] = step;
  } else {
    steps.push(step);
  }
  markLearnerChoice(proc, step);
  if (!proc.startUrl) proc.startUrl = ev.url;
  store.saveProcess(proc);
  return step;
}

// ------------------------------------------------------------------ recording a drafted process

/** The draft steps of a process, for the extension to show one by one in the application. */
export function buildPlan(proc: Process): ResolvedProcess {
  const r = resolveProcess(proc, proc.lang);
  const drafts = new Set(proc.steps.filter((s) => s.draft).map((s) => s.id));
  const steps = r.steps
    .filter((s) => drafts.has(s.id))
    .map((s, i) => ({
      ...s,
      index: i + 1,
      screenshot: undefined,
      bbox: undefined,
      url: "", // drafts were not captured on a page: no "Go to the page"
      // no element named in the guide: never found, so the author does the step and says so
      target: s.target ?? (s.action === "note" || s.action === "press" ? undefined : { selectors: [], tag: "" }),
    }));
  return { ...r, steps };
}

export function draftsLeft(proc: Process): number {
  return proc.steps.filter((s) => s.draft).length;
}

/** A recorded step takes the place of the draft: the draft's id, explanation and learner choice stay. */
function mergeDraft(draft: Step, rec: Step, lang: Lang): Step {
  const out: Step = { ...rec, id: draft.id };
  delete out.draft;
  if (draft.description) out.description = draft.description;
  if (draft.sensitive) out.sensitive = true;
  if (draft.learnerChooses && canLearnerChoose(out)) {
    out.learnerChooses = true;
    if (draft.choiceHint) out.choiceHint = draft.choiceHint;
  }
  // an instruction the author wrote stays; a draft without an element only had the guide's words
  if (draft.titleEdited && draft.target?.selectors.length) {
    out.title = draft.title;
    out.titleEdited = true;
  } else {
    delete out.titleEdited;
    out.title = titleOf(out, lang);
  }
  return out;
}

/** Translations made from the draft: generated text and the guide's screenshots no longer fit. */
function forgetLocalized(proc: Process, stepId: string) {
  for (const loc of Object.values(proc.localizations)) {
    const l = loc.steps[stepId];
    if (!l) continue;
    if (!l.titleEdited) delete loc.steps[stepId];
    else loc.steps[stepId] = { title: l.title, titleEdited: true, description: l.description };
  }
}

export interface BuildResult {
  step: Step;
  /** replaced: the action became the draft step; inserted: an extra step before it; updated: typed again into the step before. */
  placed: "replaced" | "inserted" | "updated";
  /** The draft step the action was for (replaced, or the one it was inserted before). */
  draftId?: string;
  draftsLeft: number;
}

/**
 * Apply a captured event while recording from a guide. The action is for the draft step shown, or
 * the next draft once that one is recorded (two events for one action). It becomes that step when
 * it was done on the highlighted element or on one with the guide's name for it; otherwise it is an
 * extra step the guide left out (opening a menu, say), inserted before the draft.
 */
export function applyBuildCapture(store: Store, proc: Process, payload: CapturePayload, token: string): BuildResult {
  const ev = payload.event;
  const b = buildOf(token);
  const steps = proc.steps;
  const shown = steps.findIndex((s) => s.id === payload.build?.stepId);
  let at = shown >= 0 && steps[shown].draft ? shown : steps.findIndex((s, i) => i > shown && !!s.draft);
  if (at < 0) at = steps.length;
  const onTarget = at === shown && !!payload.build?.onTarget;
  const done = (step: Step, placed: BuildResult["placed"], draftId?: string): BuildResult => {
    store.saveProcess(proc);
    return { step, placed, draftId, draftsLeft: draftsLeft(proc) };
  };

  const prev = steps[at - 1] as Step | undefined;
  if (prev && !prev.draft && retype(prev, ev, proc.lang)) return done(prev, "updated");

  const step = newStep(store, proc, payload);
  // a click recorded just before only opened this field or its calendar: this action replaces it
  const how = prev && b.recorded.has(prev.id) ? supersedes(prev, ev) : undefined;
  if (prev && how) {
    keepShot(step, prev, how);
    const draft = b.replaced.get(prev.id);
    if (draft) {
      // the click had already become a draft step: the real action becomes it instead
      const merged = mergeDraft(draft, step, proc.lang);
      steps[at - 1] = merged;
      markLearnerChoice(proc, merged);
      return done(merged, "replaced", draft.id);
    }
    steps.splice(at - 1, 1);
    b.recorded.delete(prev.id);
    b.extras.delete(prev.id);
    at--;
  }

  const draft = steps[at] as Step | undefined;
  if (draft?.draft && (onTarget || draftMatches(draft, ev))) {
    const merged = mergeDraft(draft, step, proc.lang);
    steps[at] = merged;
    b.recorded.add(merged.id);
    b.replaced.set(merged.id, draft);
    forgetLocalized(proc, merged.id);
    markLearnerChoice(proc, merged);
    return done(merged, "replaced", draft.id);
  }
  steps.splice(at, 0, step);
  b.recorded.add(step.id);
  b.extras.add(step.id);
  markLearnerChoice(proc, step);
  return done(step, "inserted", draft?.draft ? draft.id : undefined);
}

/**
 * "That was this step": the extra step recorded just before a draft step (the author did the step
 * on an element Steplight could not find) becomes that draft step.
 */
export function assignLastAction(store: Store, proc: Process, stepId: string, token: string): Step | undefined {
  const b = buildOf(token);
  const at = proc.steps.findIndex((s) => s.id === stepId);
  const draft = proc.steps[at];
  const prev = proc.steps[at - 1];
  if (!draft?.draft || !prev || !b.extras.has(prev.id)) return undefined;
  const merged = mergeDraft(draft, prev, proc.lang);
  proc.steps.splice(at - 1, 2, merged);
  b.recorded.delete(prev.id);
  b.extras.delete(prev.id);
  b.recorded.add(merged.id);
  b.replaced.set(merged.id, draft);
  forgetLocalized(proc, merged.id);
  store.saveProcess(proc);
  return merged;
}

/** A draft note shown in the application: it gets a screenshot of the page instead of the guide's. */
export function recordNote(store: Store, proc: Process, stepId: string, shot: { screenshotDataUrl?: string; url?: string; pageTitle?: string; viewport?: { width: number; height: number } }, token: string): Step | undefined {
  const st = proc.steps.find((s) => s.id === stepId);
  if (!st || st.action !== "note" || !st.draft) return undefined;
  if (shot.screenshotDataUrl) {
    st.screenshot = store.saveMedia(proc.projectId, shot.screenshotDataUrl);
    if (shot.viewport) st.viewport = shot.viewport;
  }
  if (shot.url) st.url = shot.url;
  if (shot.pageTitle) st.pageTitle = shot.pageTitle;
  st.capturedAt = now();
  delete st.draft;
  buildOf(token).recorded.add(st.id);
  forgetLocalized(proc, st.id);
  store.saveProcess(proc);
  return st;
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
      if (!s.titleEdited) s.title = titleOf(s, proc.lang);
    }
    return;
  }
}
