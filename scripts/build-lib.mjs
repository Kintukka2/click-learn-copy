// Bundles the browser-side libraries into dist/lib and assembles the browser extension in dist/extension.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "lib");
fs.mkdirSync(out, { recursive: true });

// [entry, output file, global name]
const entries = [
  ["src/capture/browser.ts", "capture.js", "SteplightCapture"],
  ["src/assist/browser.ts", "assist.js", "SteplightAssist"],
  ["src/players/browser.ts", "player.js", "SteplightPlayer"],
  ["src/portal/client.ts", "portal.js", "SteplightPortal"],
];

for (const [entry, file, globalName] of entries) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) {
    console.log(`skip ${entry} (missing)`);
    continue;
  }
  await build({
    entryPoints: [abs],
    outfile: path.join(out, file),
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    target: ["chrome110", "firefox110", "safari16"],
    minify: process.env.NODE_ENV === "production",
    sourcemap: false,
    loader: { ".css": "text" },
    logLevel: "warning",
  });
  console.log(`built dist/lib/${file}`);
}

// copy plain CSS assets
for (const css of ["src/players/player.css", "src/assist/assist.css", "src/portal/portal.css"]) {
  const abs = path.join(root, css);
  if (fs.existsSync(abs)) fs.copyFileSync(abs, path.join(out, path.basename(css)));
}

// browser extension: copy static files + bundle its scripts
const extSrc = path.join(root, "extension");
const extOut = path.join(root, "dist", "extension");
if (fs.existsSync(path.join(extSrc, "manifest.json"))) {
  fs.rmSync(extOut, { recursive: true, force: true });
  fs.cpSync(extSrc, extOut, { recursive: true, filter: (p) => !p.endsWith(".ts") });
  const tsFiles = fs.readdirSync(extSrc).filter((f) => f.endsWith(".ts"));
  for (const f of tsFiles) {
    await build({
      entryPoints: [path.join(extSrc, f)],
      outfile: path.join(extOut, f.replace(/\.ts$/, ".js")),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: ["chrome110"],
      loader: { ".css": "text" },
      logLevel: "warning",
    });
  }
  // Guide me runs this copy of Assist: web stores do not allow extensions to load code from a server
  fs.copyFileSync(path.join(out, "assist.js"), path.join(extOut, "assist.js"));
  console.log(`built dist/extension (${tsFiles.length} scripts + assist.js)`);
}
