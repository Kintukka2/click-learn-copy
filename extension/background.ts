// Steplight extension: MV3 service worker.
// Owns the recording session (persisted in chrome.storage.session so it survives worker restarts),
// takes the viewport screenshot the moment a capture event arrives (clicks fire on pointerdown, so
// the page has not reacted yet), and posts CapturePayloads to /api/recordings/:token/events in order.
// Also badges the toolbar icon with the number of guides recorded on the page in each tab.
// Recording from a guide (build), it keeps the draft steps and the one shown, tells the page where
// the server put each action, and records notes and "That was it" for the page.
/// <reference path="./lib/chrome.d.ts" />
import type { CaptureEvent, CapturePayload, ResolvedProcess, Target } from "../src/core/model.js";
import { SAME_PAGE, type LookupRow } from "./lib/guide.js";
import { api, authHeaders, getServerUrl, type RecState } from "./lib/shared.js";

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
  if (state) await showBadge(state.tabId);
}

function broadcast() {
  const msg = { type: "steplight:count", stepCount: state?.stepCount ?? 0, recording: !!state, error: lastError };
  chrome.runtime.sendMessage(msg).catch(() => undefined); // popup / side panel, if open
  if (state) chrome.tabs.sendMessage(state.tabId, msg).catch(() => undefined);
}

/** Start times of the latest screenshots, including ones booked for later. */
let shotSlots: number[] = [];

/**
 * captureVisibleTab allows two calls a second, and a refused call counts too: book the next free
 * slot rather than retry into the limit (quick actions, e.g. Next on a note and then a click).
 */
function bookShot(): number {
  const now = Date.now();
  shotSlots = shotSlots.filter((t) => t > now - 1100);
  const at = shotSlots.length >= 2 ? Math.max(now, shotSlots[shotSlots.length - 2] + 1050) : now;
  shotSlots.push(at);
  return at - now;
}

async function screenshot(windowId: number): Promise<string | undefined> {
  for (let i = 0; i < 3; i++) {
    const wait = bookShot();
    if (wait > 0) await sleep(wait);
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch {
      /* try again in the next free slot */
    }
  }
  return undefined;
}

async function startRecording(opts: { serverUrl: string; processId: string; processTitle?: string; projectId?: string; tabId: number; replace?: boolean; build?: boolean }): Promise<RecState> {
  await ready;
  if (state) await stopRecording();
  const session = await api<{ token: string; plan?: ResolvedProcess }>(opts.serverUrl, "/recordings", { method: "POST", body: JSON.stringify({ processId: opts.processId, replace: !!opts.replace && !opts.build, build: !!opts.build }) });
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
  if (session.plan) {
    state.build = { plan: session.plan, index: 0 };
    // a running Guide me would show its own card on top: stop it
    await chrome.scripting
      .executeScript({ target: { tabId: opts.tabId }, world: "MAIN", func: () => (window as unknown as { SteplightAssist?: { stop?(): void } }).SteplightAssist?.stop?.() })
      .catch(() => undefined);
  }
  lastError = "";
  focusShot = null;
  await persist();
  try {
    await chrome.tabs.sendMessage(opts.tabId, { type: "steplight:start", stepCount: state.stepCount, build: state.build });
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
  await showBadge(s.tabId);
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

/** Sends the event to the server in order; resolves once its screenshot is taken (the page then shows its overlay again). */
function onCaptureEvent(ev: CaptureEvent, tab: { id: number; windowId: number }, build?: CapturePayload["build"]): Promise<unknown> {
  const s = state;
  if (!s || tab.id !== s.tabId) return Promise.resolve();
  let shot: Promise<string | undefined>;
  if (ev.action === "type" && focusShot && focusShot.key === targetKey(ev.target) && Date.now() - focusShot.at < 300_000) {
    shot = Promise.resolve(focusShot.dataUrl);
    focusShot = null;
  } else {
    shot = screenshot(tab.windowId); // starts immediately — before the page reacts to the click
  }
  chain = chain.then(async () => {
    const payload: CapturePayload = { event: ev, screenshotDataUrl: await normalizeShot(await shot, ev) };
    if (build && s.build) payload.build = build;
    try {
      const res = await fetch(`${s.serverUrl}/api/recordings/${s.token}/events`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(payload) });
      if (res.status === 410) {
        lastError = "The recording session ended on the server.";
        await stopRecording();
        return;
      }
      const j = (await res.json()) as { stepCount?: number; error?: string; placed?: string; draftId?: string; step?: { title?: string } };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      if (state && state.token === s.token) {
        state.stepCount = j.stepCount ?? state.stepCount;
        lastError = "";
        await persist();
      }
      if (j.placed) chrome.tabs.sendMessage(s.tabId, { type: "steplight:placed", placed: j.placed, draftId: j.draftId, title: j.step?.title }).catch(() => undefined);
    } catch (err) {
      lastError = `Could not send the step: ${(err as Error).message}`;
    }
    broadcast();
  });
  return shot;
}

/** A build request made after the actions before it reached the server (it refers to what they recorded). */
async function buildCall(path: string, body: Record<string, unknown>): Promise<{ error?: string; stepCount?: number }> {
  const s = state;
  if (!s?.build) return { error: "Not recording from a guide." };
  await chain.catch(() => undefined);
  try {
    const r = await api<{ stepCount?: number }>(s.serverUrl, `/recordings/${s.token}/${path}`, { method: "POST", body: JSON.stringify(body) });
    if (state?.token === s.token) {
      state.stepCount = r.stepCount ?? state.stepCount;
      await persist();
    }
    broadcast();
    return r;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

chrome.runtime.onMessage.addListener((msg: { type: string; [k: string]: unknown }, sender: { tab?: { id: number; windowId: number } }, sendResponse: (r: unknown) => void) => {
  (async () => {
    await ready;
    switch (msg.type) {
      case "steplight:hello": {
        const here = !!state && sender.tab?.id === state.tabId;
        return { recording: here, stepCount: state?.stepCount ?? 0, title: state?.processTitle, build: here ? state?.build : undefined };
      }
      case "steplight:event":
        if (sender.tab) await onCaptureEvent(msg.event as CaptureEvent, sender.tab, msg.build as CapturePayload["build"]);
        return { ok: true };
      case "steplight:build-step":
        if (state?.build && sender.tab?.id === state.tabId) {
          state.build.index = Number(msg.index) || 0;
          await persist();
        }
        return { ok: true };
      case "steplight:assign":
        return buildCall("assign", { stepId: msg.stepId });
      case "steplight:note": {
        if (!state?.build || !sender.tab || sender.tab.id !== state.tabId) return { error: "Not recording from a guide." };
        const shot = { viewport: msg.viewport as { width: number; height: number } } as CaptureEvent;
        const dataUrl = await normalizeShot(await screenshot(sender.tab.windowId), shot);
        return buildCall("note", { stepId: msg.stepId, screenshotDataUrl: dataUrl, viewport: shot.viewport, url: msg.url, pageTitle: msg.pageTitle });
      }
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

// ---------------------------------------------------------------- guides for the page (badge)

const guideCount = new Map<number, number>();
const lookups = new Map<string, { n: number; at: number }>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let hosts: { server: string; list: string[]; at: number } | null = null;

/** Hosts that have guides: other sites' URLs are never sent to the Steplight server. */
async function guideHosts(server: string): Promise<string[]> {
  if (hosts?.server === server && Date.now() - hosts.at < 5 * 60_000) return hosts.list;
  const list = await api<string[]>(server, "/lookup/hosts").catch(() => [] as string[]);
  hosts = { server, list, at: Date.now() };
  return list;
}

async function countGuides(url: string): Promise<number> {
  let host = "";
  try {
    if (/^https?:/.test(url)) host = new URL(url).host;
  } catch {
    /* not a URL */
  }
  if (!host) return 0;
  const server = await getServerUrl();
  if (!(await guideHosts(server)).includes(host)) return 0;
  const hit = lookups.get(url);
  if (hit && Date.now() - hit.at < 60_000) return hit.n;
  const rows = await api<LookupRow[]>(server, `/lookup?url=${encodeURIComponent(url)}`).catch(() => [] as LookupRow[]);
  const n = rows.filter((r) => r.relevance >= SAME_PAGE).length;
  lookups.set(url, { n, at: Date.now() });
  return n;
}

/** Recording step count (red) in the recorded tab, otherwise the number of guides (blue). */
async function showBadge(tabId: number) {
  const recording = !!state && state.tabId === tabId;
  const n = guideCount.get(tabId) ?? 0;
  const text = recording ? String(state!.stepCount) : n ? String(n) : "";
  const title = recording ? "Steplight: recording" : n ? `Steplight: ${n} guide${n === 1 ? "" : "s"} for this page` : "Steplight";
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: recording ? "#d92d20" : "#2f6fed" });
    await chrome.action.setTitle({ tabId, title });
  } catch {
    /* the tab is gone */
  }
}

function refreshGuides(tabId: number, url = "") {
  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      void countGuides(url).then(async (n) => {
        guideCount.set(tabId, n);
        await ready;
        await showBadge(tabId);
      });
    }, 300),
  );
}

// tabs.onUpdated also reports in-page navigations (pushState), e.g. between D365 pages
chrome.tabs.onUpdated.addListener((tabId: number, info: { url?: string; status?: string }, tab: { url?: string }) => {
  if (info.url || info.status === "complete") refreshGuides(tabId, tab.url ?? info.url);
});
chrome.tabs.onActivated.addListener(({ tabId }: { tabId: number }) => {
  void chrome.tabs.get(tabId).then((t: { url?: string }) => refreshGuides(tabId, t.url)).catch(() => undefined);
});
chrome.storage.onChanged.addListener((changes: Record<string, unknown>) => {
  if (!changes.serverUrl && !changes.accessKey) return;
  hosts = null;
  lookups.clear();
  refreshAll();
});

// tabs that were already open when the browser or the extension started
const refreshAll = () => void chrome.tabs.query({}).then((tabs: { id: number; url?: string }[]) => tabs.forEach((t) => refreshGuides(t.id, t.url)));
chrome.runtime.onStartup.addListener(refreshAll);
chrome.runtime.onInstalled.addListener(refreshAll);

// a recorded tab that is closed ends the recording
chrome.tabs.onRemoved.addListener((tabId: number) => {
  guideCount.delete(tabId);
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  void ready.then(() => {
    if (state && state.tabId === tabId) void stopRecording();
  });
});

// exposed for automation / debugging from the service-worker console
(self as unknown as { steplight: unknown }).steplight = { startRecording, stopRecording, getState: () => state, countGuides };
