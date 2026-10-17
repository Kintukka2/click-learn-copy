// SCORM 1.2 package: one SCO (index.html) that embeds the process and runs Try Me and Test Me
// with dist/lib/player.js. Test Me reports score and passed/failed to the LMS; Try Me reports
// "completed". Screenshots are copied into media/.
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { slugify } from "../core/ids.js";
import { uiStrings } from "../core/instructions.js";
import type { ResolvedProcess } from "../core/model.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

const xml = (s: string | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const html = (s: string | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (s: string | undefined) => (s ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
/** JSON that is safe inside a <script> element. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const isHex = (c: string | undefined) => !!c && /^#[0-9a-f]{3,8}$/i.test(c);

export function manifestXml(opts: { identifier: string; title: string; orgTitle: string; masteryScore: number; files: string[] }): string {
  const files = opts.files.map((f) => `      <file href="${xml(f)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${xml(opts.identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${xml(opts.orgTitle)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${xml(opts.title)}</title>
        <adlcp:masteryscore>${Math.round(opts.masteryScore)}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files}
    </resource>
  </resources>
</manifest>
`;
}

/** Minimal SCORM run-time wrapper: opens the LMS session on load and closes it on unload. */
export const SCORM_WRAPPER_JS = `/* Steplight SCORM 1.2 wrapper. The player (SteplightPlayer.scorm) finds window.API in the
   parent/opener frames, reports the Try Me completion and the Test Me score; this file only opens
   the session on launch and finishes it when the learner leaves. */
(function () {
  var S = window.SteplightPlayer && window.SteplightPlayer.scorm;
  if (!S) return;
  S.init();
  var done = false;
  function finish() { if (done) return; done = true; try { S.finish(); } catch (e) {} }
  window.addEventListener("pagehide", finish);
  window.addEventListener("beforeunload", finish);
  window.SteplightSCORM = S;
})();
`;

export function indexHtml(opts: {
  proc: ResolvedProcess;
  companyName?: string;
  logoDataUrl?: string;
  primaryColor: string;
}): string {
  const { proc } = opts;
  const ui = uiStrings(proc.lang);
  const p = opts.primaryColor;
  const logo = opts.logoDataUrl && /^data:image\//.test(opts.logoDataUrl) ? `<img class="logo" src="${html(opts.logoDataUrl)}" alt="">` : `<span class="mark" aria-hidden="true"></span>`;
  return `<!doctype html>
<html lang="${html(proc.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(plain(proc.title))}</title>
<style>
  :root { --sl-primary: ${p}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { background: #eef2f7; color: #0f172a; font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: #fff; border-bottom: 1px solid #e3e8ef; }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .logo { height: 28px; width: auto; }
  .mark { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, ${p}, color-mix(in srgb, ${p} 55%, #14b8a6)); flex: none; }
  .titles { min-width: 0; }
  .company { font-size: 12px; color: #64748b; font-weight: 600; }
  .ptitle { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tabs { display: flex; gap: 4px; margin-left: auto; padding: 4px; border-radius: 12px; background: #f1f4f8; flex: none; }
  .tab { height: 34px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: #475569; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .tab[aria-selected="true"] { background: #fff; color: ${p}; box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 2px 8px -2px rgba(15,23,42,.12); }
  .tab:focus-visible { outline: 3px solid color-mix(in srgb, ${p} 35%, transparent); outline-offset: 1px; }
  main { max-width: 1240px; margin: 0 auto; padding: 20px; }
  .next { display: none; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; padding: 12px 16px; border-radius: 12px; background: #fff; border: 1px solid #e3e8ef; font-size: 14px; }
  .next.on { display: flex; }
  .next button { height: 36px; padding: 0 16px; border: 0; border-radius: 9px; background: ${p}; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  @media (max-width: 640px) { .bar { flex-wrap: wrap; padding: 10px 12px; } .tabs { margin-left: 0; width: 100%; } .tab { flex: 1; } main { padding: 10px; } }
</style>
</head>
<body>
<header class="bar">
  <div class="brand">${logo}<div class="titles">${opts.companyName ? `<div class="company">${html(opts.companyName)}</div>` : ""}<div class="ptitle">${html(plain(proc.title))}</div></div></div>
  <div class="tabs" role="tablist" aria-label="${html(plain(proc.title))}">
    <button class="tab" role="tab" id="tab-try" aria-controls="player" aria-selected="true" data-mode="try">${html(ui.tryMe)}</button>
    <button class="tab" role="tab" id="tab-test" aria-controls="player" aria-selected="false" tabindex="-1" data-mode="test">${html(ui.testMe)}</button>
  </div>
</header>
<main>
  <div class="next" id="next" role="status"><span>${html(ui.done)}</span><button type="button" id="go-test">${html(ui.testMe)} →</button></div>
  <div id="player" role="tabpanel" aria-labelledby="tab-try"></div>
</main>
<script type="application/json" id="sl-process">${scriptJson(proc)}</script>
<script src="player.js"></script>
<script src="scorm-wrapper.js"></script>
<script>
(function () {
  var proc = JSON.parse(document.getElementById("sl-process").textContent);
  var host = document.getElementById("player");
  var next = document.getElementById("next");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var current = null;
  function mount(mode) {
    if (current) current.destroy();
    next.classList.remove("on");
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-mode") === mode;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) host.setAttribute("aria-labelledby", t.id);
    });
    current = SteplightPlayer.mount(host, {
      process: proc, mode: mode, scorm: true, primaryColor: ${JSON.stringify(p)},
      onEvent: function (e) {
        if (e.type === "complete" && e.mode === "try") next.classList.add("on");
        window.__steplightEvents = (window.__steplightEvents || []).concat([e]);
      }
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { mount(t.getAttribute("data-mode")); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); n.click();
    });
  });
  document.getElementById("go-test").addEventListener("click", function () { mount("test"); });
  mount("try");
})();
</script>
</body>
</html>
`;
}

export async function generateScorm(ctx: GeneratorContext): Promise<GeneratedFile> {
  const { project, process: proc, libDir } = ctx;
  const playerPath = path.join(libDir, "player.js");
  if (!fs.existsSync(playerPath)) throw new Error(`SCORM export needs ${playerPath}; run "npm run build:lib" first`);
  const zip = new JSZip();
  const files: string[] = [];
  const add = (name: string, data: string | Buffer) => {
    zip.file(name, data);
    files.push(name);
  };

  const steps = proc.steps.map((st) => {
    const src = st.screenshot;
    if (src && fs.existsSync(src)) {
      const ext = (path.extname(src) || ".png").toLowerCase();
      const name = `media/step${st.index}${ext}`;
      add(name, fs.readFileSync(src));
      return { ...st, screenshot: name };
    }
    return { ...st, screenshot: undefined };
  });
  const pkgProc: ResolvedProcess = { ...proc, steps };
  const primaryColor = isHex(project.branding?.primaryColor) ? project.branding.primaryColor : "#2f6fed";

  add("index.html", indexHtml({ proc: pkgProc, companyName: project.branding?.companyName || project.name, logoDataUrl: project.branding?.logoDataUrl, primaryColor }));
  add("player.js", fs.readFileSync(playerPath));
  add("scorm-wrapper.js", SCORM_WRAPPER_JS);
  const slug = slugify(plain(proc.title));
  const manifest = manifestXml({
    identifier: `SL-${slug}-${slugify(proc.id)}`,
    title: plain(proc.title),
    orgTitle: project.name || plain(proc.title),
    masteryScore: proc.passMark,
    files: ["imsmanifest.xml", ...files],
  });
  zip.file("imsmanifest.xml", manifest);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, filename: `${slug}-scorm.zip`, mime: "application/zip" };
}
