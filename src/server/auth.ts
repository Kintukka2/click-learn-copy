// Optional access key for deployments reachable from the internet (STEPLIGHT_ACCESS_KEY).
// When set, the Studio and every API call that reads or changes authoring data require the key,
// while what learners use stays public: published portals, Assist, players, media and analytics.
// The key can be sent as the X-Steplight-Key header (browser extension, scripts) or entered once
// on the Studio sign-in page, which stores a hashed cookie scoped to the base path.
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE = "steplight_key";

/** API calls learners' browsers make without a key (portal, Assist, extension side panel). */
const PUBLIC_API: [string, RegExp][] = [
  ["GET", /^\/api\/health$/],
  ["GET", /^\/api\/languages$/],
  ["GET", /^\/api\/processes\/[^/]+\/resolved$/],
  ["GET", /^\/api\/lookup$/],
  ["GET", /^\/api\/lookup\/hosts$/],
  ["POST", /^\/api\/events$/],
  ["POST", /^\/api\/ask$/],
];

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function isPublicRequest(method: string, p: string): boolean {
  if (method === "OPTIONS") return true;
  if (!p.startsWith("/api/") && !p.startsWith("/studio")) return true; // "/" (redirect), lib, demo-erp, portal, media
  return PUBLIC_API.some(([m, re]) => (m === method || (m === "GET" && method === "HEAD")) && re.test(p));
}

export function accessKeyMiddleware(key: string | undefined, basePath: string) {
  const hashed = key ? sha(key) : "";
  return (req: Request, res: Response, next: NextFunction) => {
    if (!key) return next();
    const p = req.path;
    if (isPublicRequest(req.method, p)) return next();

    const header = req.get("x-steplight-key");
    const login = req.method === "POST" && p === "/studio/login";
    const form = login && typeof req.body?.key === "string" ? (req.body.key as string) : undefined;
    const query = typeof req.query.key === "string" ? req.query.key : form;
    const cookie = cookieValue(req, COOKIE);
    const ok = (header && same(sha(header), hashed)) || (query && same(sha(query), hashed)) || (cookie && same(cookie, hashed));
    if (ok) {
      if (query && (req.method === "GET" || login)) {
        // sign-in: remember the key in an HttpOnly cookie and drop it from the address bar
        const secure = req.secure || req.get("x-forwarded-proto") === "https";
        res.setHeader(
          "Set-Cookie",
          `${COOKIE}=${hashed}; Path=${basePath || "/"}; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? "; Secure" : ""}`,
        );
        if (login) return res.redirect(303, `${basePath}/studio/`);
        const u = new URL(req.originalUrl, "http://x");
        u.searchParams.delete("key");
        return res.redirect(u.pathname + u.search);
      }
      return next();
    }
    if (p.startsWith("/api/")) return res.status(401).json({ error: "This Steplight server needs an access key." });
    res.status(401).type("html").send(signInPage(basePath, !!query));
  };
}

function signInPage(basePath: string, wrong: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Steplight</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6fb;color:#111827}
form{box-sizing:border-box;width:min(380px,calc(100vw - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;box-shadow:0 20px 50px -24px rgba(16,24,40,.35)}
.mark{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#2f6fed,#14b8a6);margin-bottom:16px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:#6b7280;font-size:14px}
label{display:block;font-weight:600;font-size:13px;margin-bottom:6px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #d1d5db;border-radius:10px;font:inherit}
input:focus{outline:2px solid #2f6fed;outline-offset:1px;border-color:transparent}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:10px;background:#2f6fed;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:#b91c1c;font-size:13px;margin-top:10px}
@media (prefers-color-scheme:dark){body{background:#0b1020;color:#e5e7eb}form{background:#111827;border-color:#1f2937}input{background:#0b1020;border-color:#374151;color:inherit}p{color:#9ca3af}}
</style></head><body>
<form method="post" action="${basePath}/studio/login">
<div class="mark" aria-hidden="true"></div>
<h1>Steplight Studio</h1><p>Enter the access key for this server.</p>
<label for="key">Access key</label><input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Sign in</button>${wrong ? '<div class="err" role="alert">That key is not right.</div>' : ""}
</form></body></html>`;
}
