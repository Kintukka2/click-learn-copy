// "Show Me" rendered to a WebM video: the Show Me player runs in chrome-less video mode in headless
// Chromium while Playwright records the page.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { slugify } from "../core/ids.js";
import { uiStrings } from "../core/instructions.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

const SIZE = { width: 1280, height: 720 };

export async function generateVideo(ctx: GeneratorContext): Promise<GeneratedFile> {
  const playerJs = path.join(ctx.libDir, "player.js");
  if (!fs.existsSync(playerJs)) throw new Error("dist/lib/player.js is missing — run npm run build:lib");

  // embed screenshots as data URIs so the page is self-contained
  const proc = structuredClone(ctx.process);
  for (const s of proc.steps) {
    if (s.screenshot && fs.existsSync(s.screenshot)) s.screenshot = `data:image/png;base64,${fs.readFileSync(s.screenshot).toString("base64")}`;
    else s.screenshot = undefined;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "steplight-video-"));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cfg = { process: proc, mode: "show", ui: uiStrings(proc.lang), autoplay: true, video: true, voice: false, primaryColor: ctx.project.branding.primaryColor };
    await page.setContent(
      `<!doctype html><html lang="${proc.lang}"><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#0b1020;overflow:hidden}#p{position:fixed;inset:0}</style></head>
       <body><div id="p"></div><script>${fs.readFileSync(playerJs, "utf8").replace(/<\/script/gi, "<\\/script")}</script>
       <script>window.__cfg=${JSON.stringify(cfg).replace(/</g, "\\u003c")};SteplightPlayer.mount(document.getElementById("p"), window.__cfg);</script></body></html>`,
      { waitUntil: "load" },
    );
    // generous timeout: ~6s per step plus intro/outro
    const timeout = 20_000 + proc.steps.length * 9_000;
    await page.waitForFunction(() => (window as unknown as { __steplightVideoDone?: boolean }).__steplightVideoDone === true, undefined, { timeout, polling: 250 });
    await page.waitForTimeout(1200); // hold the final frame
    const video = page.video();
    await context.close(); // finalizes the file
    const file = await video!.path();
    const buffer = fs.readFileSync(file);
    return { buffer, filename: `${slugify(ctx.process.title)}-${ctx.process.lang}.webm`, mime: "video/webm" };
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
