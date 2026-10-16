import { SUPPORTED_LANGS } from "../../../src/core/instructions";
import type { ActionType } from "../../../src/core/model";

export { SUPPORTED_LANGS };

export function langName(code: string): string {
  return SUPPORTED_LANGS.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

export function langNative(code: string): string {
  return SUPPORTED_LANGS.find((l) => l.code === code)?.native ?? code.toUpperCase();
}

export function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "S";
}

export const ACTION_LABEL: Record<ActionType, string> = {
  click: "Click",
  type: "Type",
  select: "Select",
  check: "Check",
  press: "Key press",
  navigate: "Navigate",
  note: "Note",
};

export const ACTION_ICON: Record<ActionType, string> = {
  click: "pointer",
  type: "text",
  select: "list",
  check: "checkSquare",
  press: "keyboard",
  navigate: "link",
  note: "note",
};

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function absoluteUrl(u: string): string {
  try {
    return new URL(u, window.location.origin).toString();
  } catch {
    return u;
  }
}

/** Append query params the way Replay/Assist expect: inside the hash query for hash routes, else in search. */
export function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url, window.location.origin);
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  if (u.hash && u.hash.length > 1) {
    const h = u.hash.slice(1);
    u.hash = h + (h.includes("?") ? "&" : "?") + qs;
  } else {
    u.search = u.search + (u.search ? "&" : "?") + qs;
  }
  return u.toString();
}
