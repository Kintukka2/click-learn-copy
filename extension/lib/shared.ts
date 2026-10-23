// Shared helpers for the Steplight Recorder extension (popup, side panel, background).
/// <reference path="./chrome.d.ts" />

import type { ResolvedProcess } from "../../src/core/model.js";

export const DEFAULT_SERVER = "http://localhost:4100";

/** Recording from a guide: its draft steps and the one shown (kept across page loads). */
export interface BuildPlan {
  plan: ResolvedProcess;
  index: number;
}

export interface RecState {
  token: string;
  processId: string;
  processTitle: string;
  projectId: string;
  tabId: number;
  windowId: number;
  serverUrl: string;
  stepCount: number;
  startedAt: number;
  build?: BuildPlan;
}

export async function getServerUrl(): Promise<string> {
  const r = await chrome.storage.local.get("serverUrl");
  return String(r.serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
}

export async function setServerUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) await chrome.storage.local.set({ serverUrl: clean });
  else await chrome.storage.local.remove("serverUrl");
}

/** False until the user has entered a server address (a fresh install shows the setup screen). */
export async function isConfigured(): Promise<boolean> {
  return !!(await chrome.storage.local.get("serverUrl")).serverUrl;
}

/** Optional access key for servers started with STEPLIGHT_ACCESS_KEY (sent as X-Steplight-Key). */
export async function getAccessKey(): Promise<string> {
  const r = await chrome.storage.local.get("accessKey");
  return String(r.accessKey || "");
}

export async function setAccessKey(key: string): Promise<void> {
  await chrome.storage.local.set({ accessKey: key.trim() });
}

export async function authHeaders(): Promise<Record<string, string>> {
  const key = await getAccessKey();
  return key ? { "X-Steplight-Key": key } : {};
}

/** A failed server call; status is the HTTP status (401: an access key is needed or wrong). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T = unknown>(server: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(server + "/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Resolves once the tab has loaded the page it is navigating to (at the latest after 30 s). */
export function tabLoaded(tabId: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(on);
      clearTimeout(timer);
      resolve();
    };
    const on = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") done();
    };
    const timer = setTimeout(done, 30_000);
    chrome.tabs.onUpdated.addListener(on);
  });
}

export function send<T = unknown>(msg: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c as "&"]);
}

export function $(sel: string): HTMLElement {
  return document.querySelector(sel) as HTMLElement;
}
