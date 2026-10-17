// Steplight Recorder: MV3 service worker.
// Owns the recording session (persisted in chrome.storage.session so it survives worker restarts),
// takes the viewport screenshot the moment a capture event arrives (clicks fire on pointerdown, so
// the page has not reacted yet), and posts CapturePayloads to /api/recordings/:token/events in order.
/// <reference path="./lib/chrome.d.ts" />
import type { CaptureEvent, CapturePayload, Target } from "../src/core/model.js";
import { api, authHeaders, type RecState } from "./lib/shared.js";

let state: RecState | null = null;
const ready: Promise<void> = chrome.storage.session
  .get("rec")
  .then((r: { rec?: RecState }) => {
    state = r.rec ?? null;
  })
  .catch(() => undefined);

let chain: Promise<void> = Promise.resolve();
/** Screenshot taken when a text field got focus: used for its "type" step (shows the field before typing). */
let focusShot: { key: string; dataUrl: string; at: number } | null = null;
let lastError = "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function targetKey(t?: Target): string {
  const s = t?.selectors?.[0];
  return s ? `${s.kind}:${s.value}` : (t?.name ?? "");
}

async function persist() {
  await chrome.storage.session.set({ rec: state });
  await chrome.action.setBadgeText({ text: state ? String(state.stepCount) : "" });
  if (state) await chrome.action.setBadgeBackgroundColor({ color: "#d92d20" });
}

function broadcast() {
  const msg = { type: "steplight:count", stepCount: state?.stepCount ?? 0, recording: !!state, error: lastError };
  chrome.runtime.sendMessage(msg).catch(() => undefined); // popup / side panel, if open
  if (state) chrome.tabs.sendMessage(state.tabId, msg).catch(() => undefined);
}

/** captureVisibleTab is rate-limited (~2/s), so retry once after a short pause. */
async function screenshot(windowId: number): Promise<string | undefined> {
  for (let i = 0; i < 3; i++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch {
      await sleep(400);
    }
  }
  return undefined;
}

async function startRecording(opts: { serverUrl: string; processId: string; processTitle?: string; projectId?: string; tabId: number; replace?: boolean }): Promise<RecState> {
  await ready;
  if (state) await stopRecording();
  const session = await api<{ token: string }>(opts.serverUrl, "/recordings", { method: "POST", body: JSON.stringify({ processId: opts.processId, replace: !!opts.replace }) });
  const proc = await api<{ steps: unknown[]; title: string; projectId: string }>(opts.serverUrl, `/processes/${opts.processId}`);
  const tab = await chrome.tabs.get(opts.tabId);
  state = {
    token: session.token,
    processId: opts.processId,
    processTitle: opts.processTitle ?? proc.title,
    projectId: opts.projectId ?? proc.projectId,
    tabId: opts.tabId,
    windowId: tab.windowId,
    serverUrl: opts.serverUrl,
    stepCount: proc.steps.length,
    startedAt: Date.now(),
  };
  lastError = "";
  focusShot = null;
  await persist();
  try {
    await chrome.tabs.sendMessage(opts.tabId, { type: "steplight:start", stepCount: state.stepCount });
  } catch {
    // the tab was open before the extension was installed: inject the content script now (it starts itself)
    await chrome.scripting.executeScript({ target: { tabId: opts.tabId }, files: ["content.js"] });
  }
  broadcast();
  return state;
}

async function stopRecording(): Promise<unknown> {
  await ready;
  const s = state;
  if (!s) return null;
  await chain.catch(() => undefined); // flush pending posts
  state = null;
  await persist();
  chrome.tabs.sendMessage(s.tabId, { type: "steplight:stop" }).catch(() => undefined);
  broadcast();
  try {
    return await api(s.serverUrl, `/recordings/${s.token}/stop`, { method: "POST" });
  } catch {
    return null;
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * captureVisibleTab returns device pixels (2× on HiDPI screens). Steps store viewport-sized PNGs in
 * CSS pixels so bboxes line up, so scale the image down by the device pixel ratio.
 */
async function normalizeShot(dataUrl: string | undefined, ev: CaptureEvent): Promise<string | undefined> {
  if (!dataUrl || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return dataUrl;
  try {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = bmp.width / Math.max(1, ev.viewport.width);
    if (Math.abs(scale - 1) < 0.01) {
      ev.viewport = { width: bmp.width, height: bmp.height };
      return dataUrl;
    }
    const w = Math.round(bmp.width / scale);
    const h = Math.round(bmp.height / scale);
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    ev.viewport = { width: w, height: h };
    return "data:image/png;base64," + toBase64(await blob.arrayBuffer());
  } catch {
    return dataUrl;
  }
}

function onCaptureEvent(ev: CaptureEvent, tab: { id: number; windowId: number }) {
  const s = state;
  if (!s || tab.id !== s.tabId) return;
  let shot: Promise<string | undefined>;
  if (ev.action === "type" && focusShot && focusShot.key === targetKey(ev.target) && Date.now() - focusShot.at < 300_000) {
    shot = Promise.resolve(focusShot.dataUrl);
    focusShot = null;
  } else {
    shot = screenshot(tab.windowId); // starts immediately — before the page reacts to the click
  }
  chain = chain.then(async () => {
    const payload: CapturePayload = { event: ev, screenshotDataUrl: await normalizeShot(await shot, ev) };
    try {
      const res = await fetch(`${s.serverUrl}/api/recordings/${s.token}/events`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(payload) });
      if (res.status === 410) {
        lastError = "The recording session ended on the server.";
        await stopRecording();
        return;
      }
      const j = (await res.json()) as { stepCount?: number; error?: string };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      if (state && state.token === s.token) {
        state.stepCount = j.stepCount ?? state.stepCount;
        lastError = "";
        await persist();
      }
    } catch (err) {
      lastError = `Could not send the step: ${(err as Error).message}`;
    }
    broadcast();
  });
}

chrome.runtime.onMessage.addListener((msg: { type: string; [k: string]: unknown }, sender: { tab?: { id: number; windowId: number } }, sendResponse: (r: unknown) => void) => {
  (async () => {
    await ready;
    switch (msg.type) {
      case "steplight:hello":
        return { recording: !!state && sender.tab?.id === state.tabId, stepCount: state?.stepCount ?? 0, title: state?.processTitle };
      case "steplight:event":
        if (sender.tab) onCaptureEvent(msg.event as CaptureEvent, sender.tab);
        return { ok: true };
      case "steplight:focus":
        if (state && sender.tab && sender.tab.id === state.tabId) {
          const key = targetKey(msg.target as Target);
          const dataUrl = await screenshot(sender.tab.windowId);
          if (dataUrl) focusShot = { key, dataUrl, at: Date.now() };
        }
        return { ok: true };
      case "steplight:start":
        return { state: await startRecording(msg as never) };
      case "steplight:stop":
        return { process: await stopRecording() };
      case "steplight:state":
        return { state, error: lastError };
    }
    return undefined;
  })()
    .then(sendResponse)
    .catch((err: Error) => sendResponse({ error: err.message }));
  return true; // async response
});

// a recorded tab that is closed ends the recording
chrome.tabs.onRemoved.addListener((tabId: number) => {
  void ready.then(() => {
    if (state && state.tabId === tabId) void stopRecording();
  });
});

// exposed for automation / debugging from the service-worker console
(self as unknown as { steplight: unknown }).steplight = { startRecording, stopRecording, getState: () => state };
