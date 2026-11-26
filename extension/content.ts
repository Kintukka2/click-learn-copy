// Steplight Recorder: content script. Bundles the capture library (src/capture) and, while the
// background says this tab is being recorded, streams CaptureEvents to it. Shows a small
// "Recording" indicator in the page (marked data-steplight-ignore so it is never recorded).
// Recording from a guide, it also shows the guide's draft steps one by one with Assist: each action
// is sent with the step shown, and the server makes it that step or an extra step before it. The
// pill pauses the recording: nothing is recorded while the author goes somewhere.
/// <reference path="./lib/chrome.d.ts" />
import { AssistSession } from "../src/assist/assist.js";
import type { Resolved } from "../src/assist/fallback-resolve.js";
import { start, stop, isRecording } from "../src/capture/capture.js";
import { resolveByName, resolveTarget } from "../src/capture/resolve.js";
import { uiStrings } from "../src/core/instructions.js";
import type { ResolvedProcess, ResolvedStep } from "../src/core/model.js";
import type { BuildLast, BuildPlan } from "./lib/shared.js";

declare global {
  interface Window {
    __steplightContent?: boolean;
  }
}

const PILL_ID = "steplight-recording-indicator";

/** Recording is paused: no action is recorded until the author resumes. */
let paused = false;

const PILL_BUTTON = "all:unset;cursor:pointer;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.14);font-weight:600";

function pillHtml(count: number, fromGuide: boolean) {
  const steps = count === 1 ? "1 step" : `${count} steps`;
  const dot = paused ? "background:#98a2b3" : "background:#f04438;box-shadow:0 0 0 3px rgba(240,68,56,.25);animation:slpulse 1.4s infinite";
  const label = paused
    ? '<span style="font-weight:600">Paused</span><span style="opacity:.75">nothing is recorded</span>'
    : fromGuide
      ? '<span style="font-weight:600">Recording from the guide</span>'
      : `<span style="font-weight:600">Recording</span><span style="opacity:.75" data-count>${steps}</span>`;
  return (
    `<span style="width:9px;height:9px;border-radius:50%;${dot}"></span>` +
    label +
    // a note step: the page as it is now, with no action (not while paused: nothing is recorded)
    (paused ? "" : `<button type="button" data-note title="Add a note step with a screenshot of this page" style="${PILL_BUTTON};margin-left:6px">Note</button>`) +
    `<button type="button" data-pause style="${PILL_BUTTON}${paused ? ";margin-left:6px" : ""}">${paused ? "Resume" : "Pause"}</button>` +
    `<button type="button" data-stop style="${PILL_BUTTON}">Stop</button>`
  );
}

let pillCount = 0;
let pillGuide = false;

function showPill(count: number, fromGuide: boolean) {
  pillCount = count;
  pillGuide = fromGuide;
  const mount = () => {
    let el = document.getElementById(PILL_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = PILL_ID;
      el.setAttribute("data-steplight-ignore", "");
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;" +
        "padding:7px 8px 7px 14px;border-radius:999px;background:#101828;color:#fff;font:13px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
      const style = document.createElement("style");
      style.textContent = "@keyframes slpulse{0%,100%{opacity:1}50%{opacity:.35}}";
      el.appendChild(style);
      const inner = document.createElement("span");
      inner.style.cssText = "display:flex;align-items:center;gap:8px";
      el.appendChild(inner);
      el.addEventListener("click", (e) => {
        if ((e.target as Element).closest("[data-stop]")) void chrome.runtime.sendMessage({ type: "steplight:stop" });
        else if ((e.target as Element).closest("[data-pause]")) void chrome.runtime.sendMessage({ type: "steplight:pause", paused: !paused });
        else if ((e.target as Element).closest("[data-note]")) addNote();
      });
      document.documentElement.appendChild(el);
    }
    (el.lastElementChild as HTMLElement).innerHTML = pillHtml(count, fromGuide);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

function updatePill(count: number) {
  pillCount = count;
  const c = document.querySelector(`#${PILL_ID} [data-count]`);
  if (c) c.textContent = count === 1 ? "1 step" : `${count} steps`;
}

function hidePill() {
  document.getElementById(PILL_ID)?.remove();
}

// ---------------------------------------------------------------- recording from a guide

interface Build {
  session: AssistSession;
  plan: ResolvedProcess;
  index: number;
  /** What the card says about the latest action recorded (kept by the background across page loads). */
  last: BuildLast | null;
  completed: boolean;
}

let build: Build | null = null;

const BUILD_UI = {
  finding: "Looking for it on the page…",
  notFound: "Can’t find it on this page. Do the step yourself, then press “That was it”. Going somewhere first? Pause the recording.",
  done: "All the guide’s steps are recorded.",
  skip: "Skip",
};

const PAUSED_NOTE = "**Paused**: nothing is recorded. Go to where this step is done, then press **Resume** below.";

/** The line under the step: paused, or the extra step just recorded for it. */
function cardNote(b: Build, st: ResolvedStep): string | null {
  if (paused) return PAUSED_NOTE;
  return b.last?.stepId === st.id ? `Recorded an extra step: ${b.last.title}` : null;
}

function buildButtons(st: ResolvedStep) {
  return !paused && build?.last?.stepId === st.id ? [{ label: "That was it", primary: true, onClick: () => void assign(st.id) }] : [];
}

/** Show the current step's note (after the card re-renders for a new step, hence the microtask). */
function refreshNote() {
  queueMicrotask(() => {
    const st = build?.session.current;
    if (build && st) build.session.setNote(cardNote(build, st));
  });
}

// Screenshots show the application only: the pill and the guide card are hidden while one is taken.
let hiding = 0;
/** Resolves once the page has been drawn without the overlay (captureVisibleTab takes the last frame drawn). */
let drawn: Promise<void> = Promise.resolve();
/** Messages are sent in the order of the actions, also while one waits for that frame. */
let outbox: Promise<void> = Promise.resolve();

function setOverlayHidden(hidden: boolean) {
  const pill = document.getElementById(PILL_ID);
  if (pill) pill.style.visibility = hidden ? "hidden" : "";
  build?.session.setHidden(hidden);
}

/** Ends the wait for the frame now: the page is being left (a link opened another page). */
let flushFrames: (() => void) | null = null;

const twoFrames = () =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      flushFrames = null;
      resolve();
    };
    flushFrames = done;
    const timer = setTimeout(done, 120); // a tab that draws no frames (in the background)
    requestAnimationFrame(() => requestAnimationFrame(done));
  });

// an action that leaves the page is sent before the page goes, without waiting for a frame
for (const type of ["beforeunload", "pagehide"]) addEventListener(type, () => flushFrames?.());

/** Send a message the background answers once it has taken a screenshot, with the overlay hidden until then. */
function sendForScreenshot(msg: Record<string, unknown>): Promise<unknown> {
  if (hiding++ === 0) {
    setOverlayHidden(true);
    drawn = twoFrames();
  }
  const ready = drawn;
  const turn = outbox.then(() => ready);
  outbox = turn;
  return turn
    .then(() => chrome.runtime.sendMessage(msg))
    .catch(() => undefined)
    .finally(() => {
      if (--hiding === 0) setOverlayHidden(false);
    });
}

async function assign(stepId: string) {
  const r = (await chrome.runtime.sendMessage({ type: "steplight:assign", stepId }).catch((e: Error) => ({ error: e.message }))) as { error?: string } | undefined;
  if (!build) return;
  if (r?.error) return build.session.setNote(r.error);
  build.last = null;
  build.session.completeStep(stepId);
}


function setPaused(p: boolean) {
  paused = p;
  if (document.getElementById(PILL_ID)) showPill(pillCount, pillGuide);
  build?.session.setPaused(p);
  refreshNote();
}

/** A note is done when the author moves on from it: it gets a screenshot of the page. */
function recordNote(st: ResolvedStep): Promise<unknown> {
  return sendForScreenshot({ type: "steplight:note", stepId: st.id, viewport: { width: innerWidth, height: innerHeight }, url: location.href, pageTitle: document.title });
}

function startBuild(b: BuildPlan) {
  build?.session.stop("silent");
  const lang = b.plan.lang;
  let session: AssistSession;
  const onEvent = (type: string, data?: unknown) => {
    const cur = build;
    if (!cur || cur.session !== session) return;
    if (type === "step") {
      const index = (data as { index: number }).index;
      const prev = cur.plan.steps[cur.index];
      // a note is recorded when the author moves on from it (not while paused: it stays to record)
      if (prev?.action === "note" && index === cur.index + 1 && !paused) void recordNote(prev);
      cur.index = index;
      refreshNote();
      void chrome.runtime.sendMessage({ type: "steplight:build-step", index }).catch(() => undefined);
    } else if (type === "complete") {
      cur.completed = true;
      const last = cur.plan.steps[cur.index];
      void (async () => {
        if (last?.action === "note" && !paused) await recordNote(last);
        await chrome.runtime.sendMessage({ type: "steplight:stop" }).catch(() => undefined);
      })();
    } else if (type === "exit") {
      void chrome.runtime.sendMessage({ type: "steplight:stop" }).catch(() => undefined);
    }
  };
  session = new AssistSession(
    b.plan,
    {
      ui: { ...uiStrings(lang), ...BUILD_UI },
      persist: false,
      back: false,
      buttons: buildButtons,
      onEvent,
    },
    // a guide names elements loosely ("New" for "+ New"): after the exact search, a search by name
    (t, root) => (resolveTarget(t, root ?? document) ?? resolveByName(t, root ?? document)) as Resolved | null,
  );
  build = { session, plan: b.plan, index: b.index, last: b.last ?? null, completed: false };
  session.setPaused(paused);
  session.start(b.index);
  refreshNote();
}

/** Where the server put an action recorded from the guide. */
function onPlaced(msg: { placed: string; draftId?: string; title?: string }) {
  const cur = build?.session.current;
  if (!build || !cur || msg.draftId !== cur.id) return;
  if (msg.placed === "replaced") {
    build.last = null;
    build.session.completeStep(cur.id);
  } else if (msg.placed === "inserted") {
    build.last = { stepId: cur.id, title: msg.title ?? "" };
    refreshNote();
  }
}

// ---------------------------------------------------------------- recording

/** The pill's Note: a note step with a screenshot of the page as it is (the author writes the text in the Studio). */
function addNote() {
  if (paused || !isRecording()) return;
  const ev = { action: "note" as const, url: location.href, pageTitle: document.title, viewport: { width: innerWidth, height: innerHeight }, timestamp: Date.now() };
  // recording from a guide, it goes before the step shown
  const st = build?.session.current;
  void sendForScreenshot({ type: "steplight:event", event: ev, build: st ? { stepId: st.id, onTarget: false } : undefined });
}

function begin(count: number, plan?: BuildPlan, isPaused = false) {
  paused = isPaused;
  if (!isRecording()) {
    start(
      (ev, el) => {
        if (paused) return;
        const st = build?.session.current;
        const info = st ? { stepId: st.id, onTarget: build!.session.owns(el ?? null) } : undefined;
        void sendForScreenshot({ type: "steplight:event", event: ev, build: info });
      },
      {
        onFieldFocus: (target) => {
          if (!paused) void sendForScreenshot({ type: "steplight:focus", target });
        },
      },
    );
  }
  showPill(count, !!plan);
  if (plan && !build) startBuild(plan);
  else build?.session.setPaused(paused);
}

function end() {
  stop();
  hidePill();
  // a completed guide keeps its "all recorded" card until the author closes it
  if (build && !build.completed) build.session.stop("silent");
  build = null;
}

if (!window.__steplightContent && window.top === window) {
  window.__steplightContent = true;
  chrome.runtime.onMessage.addListener((msg: { type: string; stepCount?: number; recording?: boolean; build?: BuildPlan; paused?: boolean; placed?: string; draftId?: string; title?: string }) => {
    if (msg.type === "steplight:start") begin(msg.stepCount ?? 0, msg.build, !!msg.paused);
    else if (msg.type === "steplight:stop") end();
    else if (msg.type === "steplight:paused") setPaused(!!msg.paused);
    else if (msg.type === "steplight:placed") onPlaced(msg as { placed: string; draftId?: string; title?: string });
    else if (msg.type === "steplight:count") {
      if (msg.recording === false) end();
      else updatePill(msg.stepCount ?? 0);
    }
  });
  // the Studio asks for the extension and for "Finalise the guide" with window messages; the
  // background answers only Studio pages of the server it is connected to
  window.addEventListener("message", (e: MessageEvent) => {
    const m = e.data as { source?: string; id?: string; type?: string; processId?: string } | null;
    if (e.source !== window || m?.source !== "steplight-studio" || (m.type !== "ping" && m.type !== "finalise")) return;
    try {
      chrome.runtime
        .sendMessage({ type: m.type === "ping" ? "steplight:studio-ping" : "steplight:finalise", processId: m.processId })
        .then((r: Record<string, unknown> | undefined) => {
          if (r) window.postMessage({ ...r, source: "steplight-extension", id: m.id }, location.origin);
        })
        .catch(() => undefined);
    } catch {
      /* the extension was reloaded since this page was opened: the page has to be reloaded too */
    }
  });
  // after a navigation the new page asks whether this tab is still being recorded
  chrome.runtime
    .sendMessage({ type: "steplight:hello" })
    .then((r: { recording?: boolean; stepCount?: number; build?: BuildPlan; paused?: boolean } | undefined) => {
      if (r?.recording) begin(r.stepCount ?? 0, r.build, !!r.paused);
    })
    .catch(() => undefined);
}

export {};
