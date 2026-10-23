// Steplight Recorder: content script. Bundles the capture library (src/capture) and, while the
// background says this tab is being recorded, streams CaptureEvents to it. Shows a small
// "Recording" indicator in the page (marked data-steplight-ignore so it is never recorded).
// Recording from a guide, it also shows the guide's draft steps one by one with Assist: each action
// is sent with the step shown, and the server makes it that step or an extra step before it.
/// <reference path="./lib/chrome.d.ts" />
import { AssistSession } from "../src/assist/assist.js";
import type { Resolved } from "../src/assist/fallback-resolve.js";
import { start, stop, isRecording } from "../src/capture/capture.js";
import { resolveByName, resolveTarget } from "../src/capture/resolve.js";
import { uiStrings } from "../src/core/instructions.js";
import type { ResolvedProcess, ResolvedStep } from "../src/core/model.js";
import type { BuildPlan } from "./lib/shared.js";

declare global {
  interface Window {
    __steplightContent?: boolean;
  }
}

const PILL_ID = "steplight-recording-indicator";

function pillHtml(count: number, fromGuide: boolean) {
  const steps = count === 1 ? "1 step" : `${count} steps`;
  return (
    '<span style="width:9px;height:9px;border-radius:50%;background:#f04438;box-shadow:0 0 0 3px rgba(240,68,56,.25);animation:slpulse 1.4s infinite"></span>' +
    (fromGuide ? '<span style="font-weight:600">Recording from the guide</span>' : `<span style="font-weight:600">Recording</span><span style="opacity:.75" data-count>${steps}</span>`) +
    '<button type="button" data-stop style="all:unset;cursor:pointer;margin-left:6px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.14);font-weight:600">Stop</button>'
  );
}

function showPill(count: number, fromGuide: boolean) {
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
      });
      document.documentElement.appendChild(el);
    }
    (el.lastElementChild as HTMLElement).innerHTML = pillHtml(count, fromGuide);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

function updatePill(count: number) {
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
  /** The draft step an extra step was recorded for (offers "That was it"). */
  extraFor: string | null;
  completed: boolean;
}

let build: Build | null = null;

const BUILD_UI = {
  finding: "Looking for it on the page…",
  notFound: "Can’t find it on this page. Do the step yourself: Steplight records it as an extra step. If that was this step, press “That was it”.",
  done: "All the guide’s steps are recorded.",
  skip: "Skip",
};

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

const twoFrames = () =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 120); // a tab that draws no frames (in the background)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });

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
  build.extraFor = null;
  build.session.completeStep(stepId);
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
      if (prev?.action === "note" && index === cur.index + 1) void recordNote(prev);
      cur.index = index;
      cur.extraFor = null;
      void chrome.runtime.sendMessage({ type: "steplight:build-step", index }).catch(() => undefined);
    } else if (type === "complete") {
      cur.completed = true;
      const last = cur.plan.steps[cur.index];
      void (async () => {
        if (last?.action === "note") await recordNote(last);
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
      buttons: (st) => (build?.extraFor === st.id ? [{ label: "That was it", primary: true, onClick: () => void assign(st.id) }] : []),
      onEvent,
    },
    // a guide names elements loosely ("New" for "+ New"): after the exact search, a search by name
    (t, root) => (resolveTarget(t, root ?? document) ?? resolveByName(t, root ?? document)) as Resolved | null,
  );
  build = { session, plan: b.plan, index: b.index, extraFor: null, completed: false };
  session.start(b.index);
}

/** Where the server put an action recorded from the guide. */
function onPlaced(msg: { placed: string; draftId?: string; title?: string }) {
  const cur = build?.session.current;
  if (!build || !cur || msg.draftId !== cur.id) return;
  if (msg.placed === "replaced") {
    build.extraFor = null;
    build.session.completeStep(cur.id);
  } else if (msg.placed === "inserted") {
    build.extraFor = cur.id;
    build.session.setNote(`Recorded an extra step: ${msg.title ?? ""}`);
  }
}

// ---------------------------------------------------------------- recording

function begin(count: number, plan?: BuildPlan) {
  if (!isRecording()) {
    start(
      (ev, el) => {
        const st = build?.session.current;
        const info = st ? { stepId: st.id, onTarget: build!.session.owns(el ?? null) } : undefined;
        void sendForScreenshot({ type: "steplight:event", event: ev, build: info });
      },
      {
        onFieldFocus: (target) => {
          void sendForScreenshot({ type: "steplight:focus", target });
        },
      },
    );
  }
  showPill(count, !!plan);
  if (plan && !build) startBuild(plan);
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
  chrome.runtime.onMessage.addListener((msg: { type: string; stepCount?: number; recording?: boolean; build?: BuildPlan; placed?: string; draftId?: string; title?: string }) => {
    if (msg.type === "steplight:start") begin(msg.stepCount ?? 0, msg.build);
    else if (msg.type === "steplight:stop") end();
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
    .then((r: { recording?: boolean; stepCount?: number; build?: BuildPlan } | undefined) => {
      if (r?.recording) begin(r.stepCount ?? 0, r.build);
    })
    .catch(() => undefined);
}

export {};
