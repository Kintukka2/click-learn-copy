// URL helpers that respect a base path (Steplight can be served under e.g. https://example.com/steplight).

/** Normalize a base path: "" for root, otherwise "/segment[/segment]" without a trailing slash. */
export function normalizeBasePath(p: string | undefined): string {
  const s = (p ?? "").trim().replace(/\/+$/, "");
  if (!s || s === "/") return "";
  return s.startsWith("/") ? s : `/${s}`;
}

/**
 * Resolve `u` against `base`, keeping the base's path prefix for root-relative URLs:
 *   joinUrl("https://x.app/steplight", "/demo-erp/#/c") → "https://x.app/steplight/demo-erp/#/c"
 *   joinUrl("https://x.app/steplight", "https://other/") → "https://other/"
 */
export function joinUrl(base: string, u: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  const b = base.replace(/\/+$/, "");
  if (u.startsWith("/")) return b + u;
  return new URL(u, `${b}/`).toString();
}

/** Replace a URL prefix (e.g. public origin → internal origin); returns the URL unchanged if it doesn't match. */
export function swapPrefix(u: string, from: string, to: string): string {
  const f = from.replace(/\/+$/, "");
  if (!f || f === to.replace(/\/+$/, "")) return u;
  if (u === f || u.startsWith(`${f}/`) || u.startsWith(`${f}#`) || u.startsWith(`${f}?`)) return to.replace(/\/+$/, "") + u.slice(f.length);
  return u;
}
