// Steplight core data model. This file is the contract shared by every subsystem:
// capture, recorder, replay, generators, players, assist, portal, server and studio.
// It must stay free of Node- or DOM-only imports so it can be bundled for the browser.

export type Lang = string; // BCP-47-ish short code: "en", "da", "de", "fr", "es", "nl", "sv"

/** How an element can be found again. Ordered from most to least robust in Target.selectors. */
export type SelectorKind =
  | "testid" // [data-testid] / [data-test] / [data-qa]
  | "clid" // [data-clid] — explicit Steplight anchor an app can add
  | "id" // #id (only if it looks stable, i.e. not auto-generated)
  | "role" // ARIA role + accessible name, value "button|Save"
  | "label" // form control by its label text, value "Customer name"
  | "placeholder"
  | "text" // visible text of a clickable element
  | "css" // structural CSS path
  | "xpath";

export interface Selector {
  kind: SelectorKind;
  value: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Target {
  /** Candidate selectors, most robust first. Replay / Assist try them in order. */
  selectors: Selector[];
  /** Lower-case tag name, e.g. "button", "input", "select", "a". */
  tag: string;
  /** ARIA role (explicit or implicit), e.g. "button", "textbox", "combobox", "link", "tab", "checkbox". */
  role?: string;
  /** Accessible name — what a user would call this element ("Save", "Customer name"). */
  name?: string;
  /** Label of the form control, if any. */
  label?: string;
  /** input type attribute for inputs. */
  inputType?: string;
  /** Bounding box in CSS pixels relative to the viewport at capture time (matches the screenshot). */
  bbox: Rect;
  /** Optional nearby context for disambiguation, e.g. the section/dialog heading. */
  context?: string;
}

export type ActionType =
  | "click"
  | "type" // fill a text field (value = text)
  | "select" // choose an option in a <select> or listbox (value = option label)
  | "check" // tick a checkbox / radio (value "true" | "false")
  | "press" // keyboard key (value = key, e.g. "Enter")
  | "navigate" // go to a URL (value = url)
  | "note"; // an author-inserted explanation step with no action

export interface Step {
  id: string;
  action: ActionType;
  target?: Target; // absent for navigate / note / press without focus target
  /** Typed text, chosen option LABEL (as displayed), "true"/"false" for check, key for press, URL for navigate. */
  value?: string;
  /** For "select": the underlying <option value> — language-independent, used by replay in other UI languages. */
  optionValue?: string;
  /** Mask the value in all outputs (passwords, personal data). */
  sensitive?: boolean;
  /** Page URL when the step was captured. */
  url: string;
  /** Page title when the step was captured. */
  pageTitle?: string;
  /** Instruction shown to learners. Auto-generated from the action, editable by authors. Supports **bold**. */
  title: string;
  /** True once an author edited the title by hand (stops auto-regeneration). */
  titleEdited?: boolean;
  /** Optional longer explanation written by the author. Supports **bold** and line breaks. */
  description?: string;
  /** Screenshot file name inside the project's media folder (PNG, viewport-sized, taken before the action). */
  screenshot?: string;
  /** Viewport size the screenshot was taken at. */
  viewport?: { width: number; height: number };
  capturedAt?: string; // ISO
  /** Set by Replay when the step could not be re-found or re-executed. */
  replayStatus?: "ok" | "healed" | "failed";
}

export interface StepLocalization {
  title?: string;
  titleEdited?: boolean;
  description?: string;
  /** Screenshot captured by a localized replay (UI in that language). */
  screenshot?: string;
  /** Element bbox in the localized screenshot. */
  bbox?: Rect;
  /** Accessible name / label of the target as shown in the localized UI. */
  name?: string;
  label?: string;
  /** Localized value (e.g. an option label shown in another language). */
  value?: string;
}

export interface ProcessLocalization {
  title?: string;
  description?: string;
  steps: Record<string, StepLocalization>; // keyed by step id
  /** "auto" = machine translated / template-generated and not reviewed. */
  status?: "auto" | "reviewed";
  updatedAt?: string;
}

export interface Process {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  /** Chapter in the portal table of contents, e.g. "Sales" or "Finance / Payables". */
  chapter?: string;
  /** Name of the application this process runs in, e.g. "Northwind ERP". */
  appName?: string;
  /** Where replay and in-app guidance start. */
  startUrl: string;
  /** Source language of the step texts (the project's first language by default). */
  lang: Lang;
  steps: Step[];
  /** Translations keyed by language code (never contains the source language). */
  localizations: Record<Lang, ProcessLocalization>;
  /** Test Me pass mark in percent. */
  passMark?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  lastReplay?: ReplayReport;
}

export interface Branding {
  companyName: string;
  primaryColor: string; // hex, e.g. "#2f6fed"
  accentColor?: string;
  logoDataUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  /** First entry is the source/default language. */
  languages: Lang[];
  branding: Branding;
  /** Ordered list of process ids (portal order). */
  processIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// ---------------------------------------------------------------- recording

/** One raw event emitted by the capture script (extension content script or Playwright recorder). */
export interface CaptureEvent {
  action: ActionType;
  target?: Target;
  value?: string;
  optionValue?: string;
  sensitive?: boolean;
  url: string;
  pageTitle?: string;
  viewport: { width: number; height: number };
  timestamp: number; // ms epoch
}

/** Payload posted to the server for each captured step. */
export interface CapturePayload {
  event: CaptureEvent;
  /** PNG data URL of the viewport taken just before the action happened. */
  screenshotDataUrl?: string;
}

// ---------------------------------------------------------------- replay / testing

export interface ReplayStepResult {
  stepId: string;
  status: "ok" | "healed" | "failed";
  /** Selector that matched (when ok/healed). */
  matched?: Selector;
  /** Index of the matched selector in target.selectors; >0 means "healed". */
  matchedIndex?: number;
  message?: string;
  durationMs: number;
  /** New screenshot file written during replay (update mode). */
  screenshot?: string;
  bbox?: Rect;
  /** Name/label of the element as found during replay (may differ, e.g. localized UI). */
  name?: string;
  label?: string;
}

export interface ReplayReport {
  processId: string;
  mode: "update" | "test";
  lang: Lang;
  startedAt: string;
  finishedAt: string;
  passed: boolean;
  results: ReplayStepResult[];
}

// ---------------------------------------------------------------- outputs

export type OutputFormat =
  | "docx" // Word
  | "pdf"
  | "pptx" // PowerPoint
  | "html" // standalone written guide
  | "scorm" // SCORM 1.2 zip (Try Me + Test Me)
  | "video"; // Show Me rendered to WebM

/** Player modes (browser). */
export type PlayerMode = "show" | "try" | "test";

/**
 * A process with all text and media resolved for one language — what generators and
 * players consume. Built by core/resolve.ts from a Process + language.
 */
export interface ResolvedProcess {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  chapter?: string;
  appName?: string;
  startUrl: string;
  lang: Lang;
  passMark: number;
  steps: ResolvedStep[];
}

export interface ResolvedStep {
  id: string;
  index: number; // 1-based
  action: ActionType;
  title: string; // localized
  description?: string;
  value?: string; // already masked if sensitive
  sensitive?: boolean;
  /** Screenshot URL or path (resolver decides: relative URL for web, absolute path for generators). */
  screenshot?: string;
  bbox?: Rect;
  viewport?: { width: number; height: number };
  target?: Target; // kept for Assist (live selectors)
  url: string;
}

// ---------------------------------------------------------------- analytics

export interface AnalyticsEvent {
  projectId: string;
  processId?: string;
  type: "view" | "show_complete" | "try_complete" | "test_complete" | "assist_start" | "assist_complete" | "search" | "ask" | "download";
  lang?: Lang;
  score?: number; // test_complete: 0-100
  format?: string; // download
  query?: string;
  at: string;
}
