// Zips the built extension (dist/extension, from scripts/build-lib.mjs) for upload to the Chrome Web
// Store: dist/steplight-extension-<version>.zip, with manifest.json at the root of the zip.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ext = path.join(root, "dist", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
for (const f of ["background.js", "content.js", "popup.js", "sidepanel.js", "assist.js"]) {
  if (!fs.existsSync(path.join(ext, f))) throw new Error(`dist/extension/${f} is missing; run npm run build:lib first`);
}

const zip = new JSZip();
const add = (dir, rel = "") => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) add(path.join(dir, e.name), name);
    else zip.file(name, fs.readFileSync(path.join(dir, e.name)), { date: new Date("2026-01-01T00:00:00Z") });
  }
};
add(ext);
const file = path.join(root, "dist", `steplight-extension-${manifest.version}.zip`);
fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`packed ${path.relative(root, file)} (${manifest.name} ${manifest.version})`);
