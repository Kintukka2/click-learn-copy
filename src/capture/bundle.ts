// Node-side helper (recorder / replay / tests): the source of dist/lib/capture.js.
// Uses the built bundle when it is up to date, otherwise bundles src/capture/browser.ts in memory
// with esbuild, so recording and replay work even before `npm run build:lib`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const DIST = path.join(ROOT, "dist", "lib", "capture.js");

let cached: { text: string; mtime: number } | null = null;

function newestSourceMtime(): number {
  let max = 0;
  for (const f of fs.readdirSync(here)) if (f.endsWith(".ts")) max = Math.max(max, fs.statSync(path.join(here, f)).mtimeMs);
  return max;
}

export async function captureScript(): Promise<string> {
  const srcTime = newestSourceMtime();
  if (cached && cached.mtime >= srcTime) return cached.text;
  if (fs.existsSync(DIST) && fs.statSync(DIST).mtimeMs >= srcTime) {
    cached = { text: fs.readFileSync(DIST, "utf8"), mtime: srcTime };
    return cached.text;
  }
  const { build } = await import("esbuild");
  const res = await build({
    entryPoints: [path.join(here, "browser.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "SteplightCapture",
    platform: "browser",
    target: ["chrome110"],
    loader: { ".css": "text" },
    logLevel: "warning",
  });
  cached = { text: res.outputFiles[0].text, mtime: srcTime };
  return cached.text;
}
