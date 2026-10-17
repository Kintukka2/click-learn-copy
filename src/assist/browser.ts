// esbuild entry for dist/lib/assist.js → window.SteplightAssist (see docs/ARCHITECTURE.md).
//   SteplightAssist.start(process, { ui?, startAt?, onEvent?, primaryColor? })
//   SteplightAssist.stop()
// Auto-start: resumes a session saved in sessionStorage, or loads the process from a
// `sl_assist=<url-encoded resolved-process URL>` parameter (query or hash) or from the
// script tag's `data-process-url` attribute.
import { resolveTarget as captureResolve } from "../capture/resolve.js";
import type { ResolvedProcess, Target } from "../core/model.js";
import { AssistSession, loadActive, type AssistOptions } from "./assist.js";
import type { Resolved } from "./fallback-resolve.js";

export { resolveTarget } from "./fallback-resolve.js";
export const version = "1.0.0";

let current: AssistSession | null = null;
const script = typeof document !== "undefined" ? (document.currentScript as HTMLScriptElement | null) : null;

/**
 * Element resolution uses the capture module's resolver (the same logic as recording and Replay);
 * AssistSession falls back to Assist's own resolver (fallback-resolve.ts) when it finds nothing.
 */
function externalResolver(): (t: Target, root?: Document) => Resolved | null {
  return (t, root) => captureResolve(t, root ?? document) as Resolved | null;
}

export function start(process: ResolvedProcess, opts: AssistOptions = {}): void {
  if (!process || !Array.isArray(process.steps)) throw new Error("SteplightAssist.start: invalid process");
  stop();
  const run = () => {
    current = new AssistSession(process, opts, externalResolver());
    current.start(opts.startAt ?? 0);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

export function stop(): void {
  current?.stop("silent");
  current = null;
  try {
    sessionStorage.removeItem("steplight.assist.active");
  } catch {
    /* ignore */
  }
}

/** Current step index (0-based) or -1 when not running. */
export function currentStep(): number {
  return current ? current.index : -1;
}

function readParam(): string | null {
  const q = new URLSearchParams(location.search).get("sl_assist");
  if (q) return q;
  const h = location.hash;
  const qi = h.indexOf("?");
  if (qi >= 0) {
    const v = new URLSearchParams(h.slice(qi + 1)).get("sl_assist");
    if (v) return v;
  }
  const m = /[#&?]sl_assist=([^&]+)/.exec(h);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Remove sl_assist from the address bar so a reload resumes instead of restarting. */
function stripParam() {
  try {
    const u = new URL(location.href);
    u.searchParams.delete("sl_assist");
    let hash = u.hash;
    if (hash.includes("sl_assist=")) {
      const qi = hash.indexOf("?");
      if (qi >= 0) {
        const p = new URLSearchParams(hash.slice(qi + 1));
        p.delete("sl_assist");
        const rest = p.toString();
        hash = hash.slice(0, qi) + (rest ? `?${rest}` : "");
      } else hash = hash.replace(/[#&]?sl_assist=[^&]*/, "");
    }
    u.hash = hash;
    history.replaceState(history.state, "", u.toString());
  } catch {
    /* ignore */
  }
}

async function autoStart() {
  const param = readParam();
  const dataUrl = script?.getAttribute("data-process-url");
  const saved = loadActive();
  const url = param || (!saved ? dataUrl : null);
  if (url) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const proc = (await res.json()) as ResolvedProcess;
      if (param) stripParam();
      const startAt = saved && saved.pid === proc.id ? saved.i : 0;
      start(proc, { startAt, ui: saved?.pid === proc.id ? saved.ui : undefined });
    } catch (e) {
      console.warn("[Steplight Assist] could not load process", e);
    }
    return;
  }
  if (saved?.proc) start(saved.proc, { startAt: saved.i, ui: saved.ui });
}

if (typeof window !== "undefined" && !(window as unknown as { __steplightAssistLoaded?: boolean }).__steplightAssistLoaded) {
  (window as unknown as { __steplightAssistLoaded?: boolean }).__steplightAssistLoaded = true;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void autoStart(), { once: true });
  else void autoStart();
}
