// Shared helpers for the Steplight Recorder extension (popup, side panel, background).
/// <reference path="./chrome.d.ts" />

export const DEFAULT_SERVER = "http://localhost:4100";

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
}

export async function getServerUrl(): Promise<string> {
  const r = await chrome.storage.local.get("serverUrl");
  return String(r.serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
}

export async function setServerUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ serverUrl: url.trim().replace(/\/+$/, "") || DEFAULT_SERVER });
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

export function send<T = unknown>(msg: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c as "&"]);
}

export function $(sel: string): HTMLElement {
  return document.querySelector(sel) as HTMLElement;
}
