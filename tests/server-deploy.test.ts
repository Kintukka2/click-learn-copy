// Base-path mounting and the optional access key (public deployments, e.g. https://example.app/steplight).
import fs from "node:fs";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joinUrl, normalizeBasePath, pageKey, pageMatch, swapPrefix } from "../src/core/url.js";
import { isPublicRequest } from "../src/server/auth.js";
import { createApp } from "../src/server/app.js";

describe("url helpers", () => {
  it("normalizes base paths", () => {
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
    expect(normalizeBasePath("steplight/")).toBe("/steplight");
    expect(normalizeBasePath("/a/b/")).toBe("/a/b");
  });

  it("keeps the base path for root-relative URLs", () => {
    expect(joinUrl("https://x.app/steplight", "/demo-erp/#/c")).toBe("https://x.app/steplight/demo-erp/#/c");
    expect(joinUrl("https://x.app/steplight/", "demo-erp/")).toBe("https://x.app/steplight/demo-erp/");
    expect(joinUrl("https://x.app/steplight", "https://other.example/p")).toBe("https://other.example/p");
  });

  it("swaps public and internal prefixes only on a boundary", () => {
    const pub = "https://x.app/steplight";
    const int = "http://127.0.0.1:4100/steplight";
    expect(swapPrefix(`${pub}/demo-erp/#/c`, pub, int)).toBe(`${int}/demo-erp/#/c`);
    expect(swapPrefix(`${int}/demo-erp/`, int, pub)).toBe(`${pub}/demo-erp/`);
    expect(swapPrefix("https://x.app/steplightish/", pub, int)).toBe("https://x.app/steplightish/");
    expect(swapPrefix("https://elsewhere/", pub, int)).toBe("https://elsewhere/");
  });

  it("matches pages by path and identifying query parameters", () => {
    const m = (here: string, rec: string) => pageMatch(pageKey(here)!, pageKey(rec)!);
    const d365 = "https://erp.example.com/?cmp=101a&mi=DefaultDashboard";
    // D365 keeps the path at "/" and names the page in ?mi=; the company (cmp) does not matter
    expect(m(d365, d365)).toBe(3);
    expect(m("https://erp.example.com/?cmp=202b&mi=DefaultDashboard&utm_source=mail", d365)).toBe(3);
    expect(m("https://erp.example.com/?cmp=101a&mi=PurchReqTableListPage", d365)).toBe(2);
    expect(m("https://erp.example.com/", d365)).toBe(2);
    expect(m("https://other.example.com/?mi=DefaultDashboard", d365)).toBe(0);
    // hash routes, with a query in the hash
    expect(m("http://app.test/demo-erp/#/customers/new", "http://app.test/demo-erp/#/customers/new?x=1")).toBe(2);
    expect(m("http://app.test/demo-erp/#/customers/new?sl_assist=abc", "http://app.test/demo-erp/#/customers/new")).toBe(3);
    expect(m("http://app.test/demo-erp/#/customers/new", "http://app.test/demo-erp/#/customers")).toBe(2);
    expect(m("http://app.test/demo-erp/#/orders", "http://app.test/demo-erp/#/customers")).toBe(1);
    // a page recorded without parameters only matches the same page without parameters
    expect(m("https://erp.example.com/?mi=X", "https://erp.example.com/")).toBe(2);
    expect(pageKey("not a url")).toBeNull();
  });

  it("classifies learner-facing requests as public", () => {
    expect(isPublicRequest("GET", "/portal/prj_1/")).toBe(true);
    expect(isPublicRequest("GET", "/lib/assist.js")).toBe(true);
    expect(isPublicRequest("GET", "/api/processes/prc_1/resolved")).toBe(true);
    expect(isPublicRequest("POST", "/api/ask")).toBe(true);
    expect(isPublicRequest("GET", "/api/lookup/hosts")).toBe(true);
    expect(isPublicRequest("GET", "/api/projects")).toBe(false);
    expect(isPublicRequest("POST", "/api/processes/prc_1/replay")).toBe(false);
    expect(isPublicRequest("GET", "/studio/")).toBe(false);
  });
});

describe("server under /steplight with an access key", () => {
  let server: Server;
  let origin = "";
  let dir = "";
  const KEY = "correct horse battery staple";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-deploy-"));
    // baseUrl only needs the right path here; requests go to the ephemeral port below
    const { app } = createApp({ dataDir: dir, baseUrl: "http://localhost/steplight", accessKey: KEY });
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("mounts the API and redirects the root under the prefix", async () => {
    expect((await fetch(`${origin}/steplight/api/health`)).status).toBe(200);
    const root = await fetch(`${origin}/`, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/steplight/studio/");
    expect((await fetch(`${origin}/api/health`)).status).toBe(404);
  });

  it("requires the key for authoring and accepts the header", async () => {
    expect((await fetch(`${origin}/steplight/api/projects`)).status).toBe(401);
    expect((await fetch(`${origin}/steplight/api/projects`, { headers: { "X-Steplight-Key": "nope" } })).status).toBe(401);
    expect((await fetch(`${origin}/steplight/api/projects`, { headers: { "X-Steplight-Key": KEY } })).status).toBe(200);
  });

  it("shows a sign-in page and signs in with a cookie", async () => {
    const page = await fetch(`${origin}/steplight/studio/`);
    expect(page.status).toBe(401);
    const html = await page.text();
    expect(html).toContain('action="/steplight/studio/login"');

    const bad = await fetch(`${origin}/steplight/studio/login`, { method: "POST", body: new URLSearchParams({ key: "wrong" }), redirect: "manual" });
    expect(bad.status).toBe(401);

    const ok = await fetch(`${origin}/steplight/studio/login`, { method: "POST", body: new URLSearchParams({ key: KEY }), redirect: "manual" });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/steplight/studio/");
    const cookie = (ok.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie).toMatch(/^steplight_key=[0-9a-f]{64}$/);
    expect(ok.headers.get("set-cookie")).toContain("Path=/steplight");
    expect((await fetch(`${origin}/steplight/api/projects`, { headers: { cookie } })).status).toBe(200);
  });

  it("keeps learner-facing endpoints public", async () => {
    const created = await fetch(`${origin}/steplight/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Steplight-Key": KEY },
      body: JSON.stringify({ name: "P" }),
    }).then((r) => r.json());
    const proc = await fetch(`${origin}/steplight/api/projects/${created.id}/processes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Steplight-Key": KEY },
      body: JSON.stringify({ title: "T", startUrl: "/demo-erp/#/customers" }),
    }).then((r) => r.json());
    const resolved = await fetch(`${origin}/steplight/api/processes/${proc.id}/resolved`);
    expect(resolved.status).toBe(200);
    expect((await fetch(`${origin}/steplight/api/lookup?url=${encodeURIComponent("http://localhost/steplight/demo-erp/#/customers")}`)).status).toBe(200);
    expect((await fetch(`${origin}/steplight/demo-erp/`)).status).toBe(200);
    const events = await fetch(`${origin}/steplight/api/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: created.id, type: "view" }) });
    expect(events.status).toBe(204);
  });
});
