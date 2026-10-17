// The Cloudflare Worker that serves Steplight under examplewebsite.app/steplight (deploy/cloudflare-worker).
import fs from "node:fs";
import type { AddressInfo, Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import worker from "../deploy/cloudflare-worker/worker.js";
import { createApp } from "../src/server/app.js";

describe("Cloudflare Worker proxy", () => {
  let server: Server;
  let env: { STEPLIGHT_ORIGIN: string };
  let dir = "";

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-worker-"));
    const { app } = createApp({ dataDir: dir, baseUrl: "https://examplewebsite.app/steplight", accessKey: "k" });
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    env = { STEPLIGHT_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  });

  afterAll(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("forwards the path and query unchanged", async () => {
    const res: Response = await worker.fetch(new Request("https://examplewebsite.app/steplight/api/health?x=1"), env);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("forwards bodies and headers (authoring with the access key)", async () => {
    const res: Response = await worker.fetch(
      new Request("https://examplewebsite.app/steplight/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Steplight-Key": "k" },
        body: JSON.stringify({ name: "Via Worker" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("Via Worker");
  });

  it("passes redirects through without following them, so they stay on the public domain", async () => {
    const res: Response = await worker.fetch(new Request("https://examplewebsite.app/steplight/"), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/steplight/studio/");
  });
});
