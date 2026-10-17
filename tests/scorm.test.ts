// SCORM 1.2 package: structure of the zip/manifest, and a run of index.html inside a mock LMS
// frame (window.API in the parent) checking the LMS calls made on Test Me completion.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import JSZip from "jszip";
import { chromium, type Browser, type Frame } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveProcess } from "../src/core/resolve.js";
import type { Process, Project } from "../src/core/model.js";
import { generateScorm } from "../src/generators/scorm.js";
import type { GeneratorContext } from "../src/generators/index.js";

const ROOT = path.resolve(__dirname, "..");
const FX = path.join(ROOT, "tests/fixtures/out");
const hasFixture = fs.existsSync(path.join(FX, "process.json"));

let browser: Browser;
let ctx: GeneratorContext;
let zip: JSZip;
let filename = "";
let mime = "";
const pkgDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-scorm-"));

describe.skipIf(!hasFixture)("generateScorm", () => {
  beforeAll(async () => {
    const libDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-lib-"));
    await build({ entryPoints: [path.join(ROOT, "src/players/browser.ts")], outfile: path.join(libDir, "player.js"), bundle: true, format: "iife", globalName: "SteplightPlayer", platform: "browser", target: ["chrome110"], loader: { ".css": "text" }, logLevel: "error" });
    const raw = JSON.parse(fs.readFileSync(path.join(FX, "process.json"), "utf8")) as Process;
    const project = JSON.parse(fs.readFileSync(path.join(FX, "project.json"), "utf8")) as Project;
    ctx = { project, process: resolveProcess(raw, "en", { media: (f) => path.join(FX, "media", f) }), libDir };
    const out = await generateScorm(ctx);
    filename = out.filename;
    mime = out.mime;
    zip = await JSZip.loadAsync(out.buffer);
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const dest = path.join(pkgDir, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await file.async("nodebuffer"));
    }
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("names the file <slug>-scorm.zip with mime application/zip", () => {
    expect(filename).toBe("create-a-new-customer-scorm.zip");
    expect(mime).toBe("application/zip");
  });

  it("contains the SCO, the player, the wrapper and every screenshot", () => {
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    const shots = ctx.process.steps.map((s) => `media/step${s.index}.png`);
    expect(names).toEqual(["imsmanifest.xml", "index.html", "player.js", "scorm-wrapper.js", ...shots].sort());
    for (const s of ctx.process.steps) {
      expect(fs.readFileSync(path.join(pkgDir, `media/step${s.index}.png`)).equals(fs.readFileSync(s.screenshot!))).toBe(true);
    }
  });

  it("has a well-formed SCORM 1.2 manifest listing all files", async () => {
    const xml = await zip.file("imsmanifest.xml")!.async("string");
    const page = await browser.newPage();
    const info = await page.evaluate((src) => {
      const doc = new DOMParser().parseFromString(src, "application/xml");
      if (doc.querySelector("parsererror")) return { error: doc.querySelector("parsererror")!.textContent };
      const ADL = "http://www.adlnet.org/xsd/adlcp_rootv1p2";
      const m = doc.documentElement;
      const res = doc.getElementsByTagName("resource")[0];
      const org = doc.getElementsByTagName("organizations")[0];
      const item = doc.getElementsByTagName("item")[0];
      return {
        root: m.localName,
        ns: m.namespaceURI,
        schema: doc.getElementsByTagName("schema")[0]?.textContent,
        version: doc.getElementsByTagName("schemaversion")[0]?.textContent,
        schemaLocation: m.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "schemaLocation"),
        defaultOrg: org.getAttribute("default"),
        orgId: doc.getElementsByTagName("organization")[0].getAttribute("identifier"),
        itemRef: item.getAttribute("identifierref"),
        itemTitle: item.getElementsByTagName("title")[0]?.textContent,
        mastery: item.getElementsByTagNameNS(ADL, "masteryscore")[0]?.textContent,
        resId: res.getAttribute("identifier"),
        resType: res.getAttribute("type"),
        scormType: res.getAttributeNS(ADL, "scormtype"),
        href: res.getAttribute("href"),
        files: Array.from(res.getElementsByTagName("file")).map((f) => f.getAttribute("href")),
        identifier: m.getAttribute("identifier"),
      };
    }, xml);
    await page.close();
    expect(info).toMatchObject({
      root: "manifest",
      ns: "http://www.imsproject.org/xsd/imscp_rootv1p1p2",
      schema: "ADL SCORM",
      version: "1.2",
      defaultOrg: "ORG-1",
      orgId: "ORG-1",
      itemRef: "RES-1",
      itemTitle: ctx.process.title,
      mastery: String(ctx.process.passMark),
      resId: "RES-1",
      resType: "webcontent",
      scormType: "sco",
      href: "index.html",
    });
    expect(info.schemaLocation).toContain("adlcp_rootv1p2.xsd");
    expect(info.schemaLocation).toContain("imscp_rootv1p1p2.xsd");
    expect(info.identifier).toMatch(/^[A-Za-z_][\w.-]*$/); // xs:ID
    const all = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect([...(info.files as string[])].sort()).toEqual(all.sort());
  });

  it("runs in an LMS frame: Try Me reports completed, Test Me reports score, status, commit and finish", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const lms = `<!doctype html><html><body style="margin:0"><script>
      window.__calls=[];var store={"cmi.core.lesson_status":"not attempted"};
      window.API={LMSInitialize:function(){__calls.push(["LMSInitialize"]);return "true"},
        LMSFinish:function(){__calls.push(["LMSFinish"]);return "true"},
        LMSGetValue:function(k){__calls.push(["LMSGetValue",k]);return store[k]||""},
        LMSSetValue:function(k,v){store[k]=v;__calls.push(["LMSSetValue",k,v]);return "true"},
        LMSCommit:function(){__calls.push(["LMSCommit"]);return "true"},
        LMSGetLastError:function(){return "0"},LMSGetErrorString:function(){return ""},LMSGetDiagnostic:function(){return ""}};
    </script><iframe id="sco" src="/pkg/index.html" style="width:1260px;height:980px;border:0"></iframe></body></html>`;
    await page.route("http://lms.test/**", (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/") return route.fulfill({ body: lms, contentType: "text/html" });
      const rel = decodeURIComponent(u.pathname.replace(/^\/pkg\//, ""));
      const file = path.join(pkgDir, rel);
      if (!file.startsWith(pkgDir) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      const type = rel.endsWith(".html") ? "text/html" : rel.endsWith(".js") ? "text/javascript" : "image/png";
      return route.fulfill({ path: file, contentType: type });
    });
    await page.goto("http://lms.test/");
    const frame = (await (await page.waitForSelector("#sco")).contentFrame()) as Frame;
    await frame.waitForSelector(".sl-player");
    const calls = () => page.evaluate(() => (window as any).__calls as string[][]);
    await expect.poll(async () => (await calls()).some((c) => c[0] === "LMSInitialize")).toBe(true);
    expect(await calls()).toContainEqual(["LMSSetValue", "cmi.core.lesson_status", "incomplete"]);

    const steps = ctx.process.steps;
    const center = async (i: number) => {
      const r = (await frame.locator(".sl-shot").boundingBox())!;
      const b = steps[i].bbox!;
      const vp = steps[i].viewport!;
      return { x: r.x + ((b.x + b.width / 2) / vp.width) * r.width, y: r.y + ((b.y + b.height / 2) / vp.height) * r.height };
    };
    const run = async (wrongAt: number) => {
      for (let i = 0; i < steps.length; i++) {
        await frame.waitForFunction((n) => document.querySelector(".sl-task-meta")?.textContent?.startsWith(`Step ${n} `), i + 1);
        await frame.waitForTimeout(120);
        if (i === wrongAt) {
          const r = (await frame.locator(".sl-view").boundingBox())!;
          await page.mouse.click(r.x + r.width * 0.93, r.y + r.height * 0.9);
          continue;
        }
        const st = steps[i];
        const c = await center(i);
        await page.mouse.click(c.x, c.y);
        if (st.action === "type") {
          await page.keyboard.type(st.value!);
          await page.keyboard.press("Enter");
        } else if (st.action === "select") await frame.click(`.sl-opt[data-value="${st.value}"]`);
      }
    };

    // Try Me (default tab)
    await frame.click(".sl-card .sl-btn-primary");
    await run(-1);
    await frame.waitForSelector(".sl-result-try");
    await expect.poll(async () => (await calls()).some((c) => c[1] === "cmi.core.lesson_status" && c[2] === "completed")).toBe(true);
    // Test Me via the "next" banner
    await frame.click("#go-test");
    await frame.click(".sl-card .sl-btn-primary");
    await run(2);
    await frame.waitForSelector(".sl-result-test");
    const expected = Math.round(((steps.length - 1) / steps.length) * 100);
    await expect.poll(async () => (await calls()).some((c) => c[0] === "LMSFinish")).toBe(true);
    const all = await calls();
    const sets = all.filter((c) => c[0] === "LMSSetValue");
    const last = (k: string) => sets.filter((c) => c[1] === k).pop()?.[2];
    expect(all.filter((c) => c[0] === "LMSInitialize")).toHaveLength(1);
    expect(last("cmi.core.score.raw")).toBe(String(expected));
    expect(last("cmi.core.score.min")).toBe("0");
    expect(last("cmi.core.score.max")).toBe("100");
    expect(last("cmi.core.lesson_status")).toBe(expected >= ctx.process.passMark ? "passed" : "failed");
    expect(last("cmi.core.session_time")).toMatch(/^\d{4}:\d{2}:\d{2}\.\d{2}$/);
    const iCommit = all.findIndex((c) => c[0] === "LMSCommit" && all.indexOf(c) > all.findIndex((x) => x[1] === "cmi.core.score.raw"));
    expect(iCommit).toBeGreaterThan(0);
    expect(all.filter((c) => c[0] === "LMSFinish")).toHaveLength(1);
    expect(all[all.length - 1][0]).toBe("LMSFinish");
    // screenshots load from the package
    expect(await frame.evaluate(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, 90_000);
});
