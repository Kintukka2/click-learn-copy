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

// ---------------------------------------------------------------- page matching (in-app lookup)

/** Query parameters that don't identify a page: tracking, Steplight's own, D365's company (cmp). */
const NOISE_PARAM = /^(utm_.*|sl_assist|lang|cmp|_.*)$/i;

export interface PageKey {
  host: string;
  /** Hash route when the app uses one (#/customers), else the path. Lower-case. */
  path: string;
  /** Identifying query parameters (search and hash query), lower-case keys and values. */
  params: Map<string, string>;
}

export function pageKey(url: string): PageKey | null {
  try {
    const u = new URL(url);
    const [hashPath, hashQuery = ""] = u.hash.replace(/^#/, "").split("?");
    const params = new Map<string, string>();
    for (const sp of [u.searchParams, new URLSearchParams(hashQuery)]) {
      sp.forEach((v, k) => {
        if (!NOISE_PARAM.test(k)) params.set(k.toLowerCase(), v.toLowerCase());
      });
    }
    return { host: u.host, path: (hashPath || u.pathname).toLowerCase(), params };
  } catch {
    return null;
  }
}

/**
 * How closely the page being viewed matches a recorded page:
 *   3 = the same page (same path, and the recorded page's identifying parameters, e.g. D365's
 *       ?mi=PurchReqTableListPage, all present with the same values), 2 = related (same path with
 *       other parameters, or one path under the other), 1 = same application, 0 = another site.
 */
export function pageMatch(here: PageKey, recorded: PageKey): number {
  if (here.host !== recorded.host) return 0;
  if (here.path === recorded.path) {
    const subset = [...recorded.params].every(([k, v]) => here.params.get(k) === v);
    return subset && (recorded.params.size > 0 || here.params.size === 0) ? 3 : 2;
  }
  return here.path.startsWith(recorded.path) || recorded.path.startsWith(here.path) ? 2 : 1;
}
