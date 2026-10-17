// Builds the static learning portal for a project:
//   index.html                  shell (branding, language list, config)
//   data/<lang>.json            all resolved processes for that language (relative media URLs)
//   media/*.png                 screenshots used by any language
//   lib/{portal,player,assist}.js
//   downloads/<process>-<lang>.{docx,pdf,pptx,html} and -scorm.zip
// The result is fully static (host anywhere, or zip it); when apiBase is set, the portal also
// sends analytics, uses server-side AI answers and offers "Guide me in the app".
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../core/ids.js";
import { SUPPORTED_LANGS, uiStrings } from "../core/instructions.js";
import type { OutputFormat, Process, Project, ResolvedProcess } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import { generate } from "../generators/index.js";

export interface PortalBuildOptions {
  project: Project;
  processes: Process[];
  /** Absolute path of the project's media folder. */
  mediaDir: string;
  /** Absolute path of dist/lib. */
  libDir: string;
  /** Output directory (wiped and rebuilt). */
  outDir: string;
  /** Server origin for live features (analytics, AI ask, Guide me). Empty = fully static. */
  apiBase?: string;
  /** Formats pre-generated for download. Default: docx, pdf, pptx, html, scorm. */
  downloads?: OutputFormat[];
  /** Called with progress messages. */
  onProgress?: (msg: string) => void;
}

export interface PortalProcessEntry extends ResolvedProcess {
  downloads: { format: OutputFormat; file: string; size: number }[];
  updatedAt: string;
  localized: boolean;
}

export interface PortalData {
  lang: string;
  ui: Record<string, string>;
  processes: PortalProcessEntry[];
}

const DOWNLOAD_EXT: Record<OutputFormat, string> = { docx: "docx", pdf: "pdf", pptx: "pptx", html: "html", scorm: "zip", video: "webm" };

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function buildPortal(opts: PortalBuildOptions): Promise<{ files: number; downloads: number; languages: string[] }> {
  const { project, processes, outDir } = opts;
  const formats = opts.downloads ?? (["docx", "pdf", "pptx", "html", "scorm"] as OutputFormat[]);
  const log = opts.onProgress ?? (() => undefined);
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const d of ["data", "media", "lib", "downloads"]) fs.mkdirSync(path.join(outDir, d), { recursive: true });

  // libs
  for (const f of ["portal.js", "player.js", "assist.js", "player.css"]) {
    const src = path.join(opts.libDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, "lib", f));
  }

  const usedMedia = new Set<string>();
  let downloadCount = 0;
  const languages = project.languages.length ? project.languages : ["en"];

  for (const lang of languages) {
    const entries: PortalProcessEntry[] = [];
    for (const proc of processes) {
      if (!proc.steps.length) continue;
      const resolved = resolveProcess(proc, lang, {
        media: (f) => {
          usedMedia.add(f);
          return `media/${f}`;
        },
      });
      const downloads: PortalProcessEntry["downloads"] = [];
      const base = `${slugify(resolved.title)}-${proc.id.slice(-6)}-${lang}`;
      for (const format of formats) {
        try {
          log(`generating ${format} for "${resolved.title}" (${lang})`);
          const abs = resolveProcess(proc, lang, { media: (f) => path.join(opts.mediaDir, path.basename(f)) });
          const file = await generate(format, { project, process: abs, libDir: opts.libDir });
          const name = format === "scorm" ? `${base}-scorm.zip` : `${base}.${DOWNLOAD_EXT[format]}`;
          fs.writeFileSync(path.join(outDir, "downloads", name), file.buffer);
          downloads.push({ format, file: `downloads/${name}`, size: file.buffer.length });
          downloadCount++;
        } catch (err) {
          log(`skipped ${format} for "${resolved.title}" (${lang}): ${(err as Error).message}`);
        }
      }
      entries.push({ ...resolved, downloads, updatedAt: proc.updatedAt, localized: lang === proc.lang || !!proc.localizations[lang] });
    }
    const data: PortalData = { lang, ui: uiStrings(lang), processes: entries };
    fs.writeFileSync(path.join(outDir, "data", `${lang}.json`), JSON.stringify(data));
  }

  for (const f of usedMedia) {
    const src = path.join(opts.mediaDir, path.basename(f));
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, "media", path.basename(f)));
  }

  const config = {
    projectId: project.id,
    name: project.name,
    description: project.description ?? "",
    branding: project.branding,
    languages: languages.map((code) => ({ code, native: SUPPORTED_LANGS.find((l) => l.code === code)?.native ?? code })),
    defaultLang: languages[0],
    apiBase: opts.apiBase ?? "",
    publishedAt: new Date().toISOString(),
  };
  const b = project.branding;
  const html = `<!doctype html>
<html lang="${esc(languages[0])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.name)} · Learning portal</title>
<meta name="description" content="${esc(project.description || `${project.name} training and process documentation`)}">
<style>:root{--sl-primary:${esc(b.primaryColor || "#2f6fed")};--sl-accent:${esc(b.accentColor || "#14b8a6")}}html,body{margin:0;background:#f6f7fb}</style>
</head>
<body>
<div id="portal" aria-live="polite"><noscript>This learning portal needs JavaScript.</noscript></div>
<script>window.STEPLIGHT_PORTAL = ${JSON.stringify(config).replace(/</g, "\\u003c")};</script>
<script src="lib/player.js"></script>
<script src="lib/portal.js"></script>
<script>SteplightPortal.start(document.getElementById("portal"), window.STEPLIGHT_PORTAL);</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  let files = 0;
  const count = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? count(path.join(d, e.name)) : files++;
  };
  count(outDir);
  return { files, downloads: downloadCount, languages };
}
