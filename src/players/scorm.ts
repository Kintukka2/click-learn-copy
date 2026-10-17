// SCORM 1.2 run-time reporting. Finds the LMS API object (window.API) in the parent/opener frame
// chain, and keeps one shared session per window so several player mounts (Try Me + Test Me in
// one SCO) initialize and finish only once.

export interface Scorm12API {
  LMSInitialize(arg: string): string | boolean;
  LMSFinish(arg: string): string | boolean;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string | boolean;
  LMSCommit(arg: string): string | boolean;
  LMSGetLastError?(): string | number;
}

interface ScormState {
  api: Scorm12API | null;
  searched: boolean;
  initialized: boolean;
  finished: boolean;
  startedAt: number;
}

declare global {
  interface Window {
    API?: Scorm12API;
    __steplightScorm?: ScormState;
  }
}

function state(): ScormState {
  return (window.__steplightScorm ??= { api: null, searched: false, initialized: false, finished: false, startedAt: Date.now() });
}

function scan(win: Window | null): Scorm12API | null {
  let w: Window | null = win;
  for (let depth = 0; w && depth < 12; depth++) {
    try {
      if (w.API && typeof w.API.LMSInitialize === "function") return w.API;
    } catch {
      return null; // cross-origin frame
    }
    if (w.parent === w) break;
    w = w.parent;
  }
  return null;
}

/** Locate the SCORM 1.2 API: this window and its parents, then the opener and its parents. */
export function findAPI(win: Window = window): Scorm12API | null {
  let api = scan(win);
  if (!api) {
    try {
      api = scan(win.top?.opener ?? null) ?? scan(win.opener ?? null);
    } catch {
      api = null;
    }
  }
  return api;
}

const ok = (r: unknown) => r === true || r === "true";

function api(): Scorm12API | null {
  const s = state();
  if (!s.searched) {
    s.api = findAPI();
    s.searched = true;
  }
  return s.api;
}

function sessionTime(ms: number): string {
  const t = Math.max(0, Math.round(ms / 10)) / 100;
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(hh, 4)}:${p(mm)}:${ss.toFixed(2).padStart(5, "0")}`;
}

export const scorm = {
  findAPI,
  /** True when an LMS API is reachable. */
  available(): boolean {
    return !!api();
  },
  /** LMSInitialize once per window. Marks a not-attempted lesson as incomplete. */
  init(): boolean {
    const s = state();
    const a = api();
    if (!a || s.finished) return false;
    if (!s.initialized) {
      s.initialized = ok(a.LMSInitialize(""));
      if (!s.initialized) return false;
      s.startedAt = Date.now();
      const status = a.LMSGetValue("cmi.core.lesson_status");
      if (!status || status === "not attempted") a.LMSSetValue("cmi.core.lesson_status", "incomplete");
    }
    return true;
  },
  get(key: string): string {
    return this.init() ? (api()!.LMSGetValue(key) ?? "") : "";
  },
  set(key: string, value: string): boolean {
    return this.init() ? ok(api()!.LMSSetValue(key, value)) : false;
  },
  commit(): boolean {
    return this.init() ? ok(api()!.LMSCommit("")) : false;
  },
  finish(): boolean {
    const s = state();
    const a = api();
    if (!a || !s.initialized || s.finished) return false;
    a.LMSSetValue("cmi.core.session_time", sessionTime(Date.now() - s.startedAt));
    a.LMSCommit("");
    s.finished = ok(a.LMSFinish(""));
    return s.finished;
  },
  /** Try Me finished: "completed" unless an assessment result is already recorded. */
  reportCompleted(): boolean {
    if (!this.init()) return false;
    const st = this.get("cmi.core.lesson_status");
    if (st !== "passed" && st !== "failed") this.set("cmi.core.lesson_status", "completed");
    return this.commit();
  },
  /** Test Me finished: score + passed/failed, then commit and finish the session. */
  reportScore(score: number, passed: boolean): boolean {
    if (!this.init()) return false;
    this.set("cmi.core.score.min", "0");
    this.set("cmi.core.score.max", "100");
    this.set("cmi.core.score.raw", String(Math.round(score)));
    this.set("cmi.core.lesson_status", passed ? "passed" : "failed");
    this.commit();
    return this.finish();
  },
};
