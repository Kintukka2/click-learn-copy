// Minimal history router mounted under /studio/.
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

export const BASE = "/studio";
const listeners = new Set<() => void>();

export function currentLocation() {
  let p = window.location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  if (!p) p = "/";
  return { path: p.replace(/\/+$/, "") || "/", search: window.location.search };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = BASE + (to.startsWith("/") ? to : `/${to}`);
  if (url === window.location.pathname + window.location.search) return;
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  listeners.forEach((l) => l());
}

window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function useLocation() {
  const [loc, setLoc] = useState(currentLocation);
  useEffect(() => {
    const l = () => setLoc(currentLocation());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return loc;
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      {...rest}
      href={BASE + to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
