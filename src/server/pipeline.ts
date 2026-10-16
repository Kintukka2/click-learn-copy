import fs from "node:fs";
import path from "node:path";
import type { Router } from "express";
import JSZip from "jszip";
import type { CapturePayload, OutputFormat, Process } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import { generate } from "../generators/index.js";
import { buildPortal } from "../portal/build.js";
import { recordScripted } from "../recorder/playwright-recorder.js";
import { DEMO_SCENARIOS } from "../recorder/scenarios.js";
import { replayProcess } from "../replay/replay.js";
import { ask, translateProcess, aiStatus } from "./ai.js";
import { LIB_DIR, wrap, type AppContext } from "./app.js";
import { applyCapture } from "./recording.js";

const FORMATS: OutputFormat[] = ["docx", "pdf", "pptx", "html", "scorm", "video"];

// One heavy browser job at a time keeps memory predictable.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export function pipelineRoutes(api: Router, ctx: AppContext) {
  const { store, config } = ctx;

  api.get("/ai/status", (_req, res) => res.json(aiStatus()));

  // ------------------------------------------------------------ demo recordings (headless)
  api.get("/demo-scenarios", (_req, res) => res.json(DEMO_SCENARIOS.map(({ actions, ...s }) => ({ ...s, actionCount: actions.length }))));

  async function recordInto(proc: Process, scenarioId: string) {
    const sc = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (!sc) throw new Error(`unknown scenario ${scenarioId}`);
    let current = store.getProcess(proc.id)!;
    current.steps = [];
    current.localizations = {};
    current.startUrl = config.baseUrl + sc.startPath;
    store.saveProcess(current);
    await recordScripted({
      startUrl: config.baseUrl + sc.startPath,
      actions: sc.actions,
      onCapture: async (payload: CapturePayload) => {
        current = store.getProcess(proc.id)!;
        applyCapture(store, current, payload);
      },
    });
    return store.getProcess(proc.id)!;
  }

  api.post(
    "/processes/:id/demo-record",
    wrap(async (req, res) => {
      const proc = store.getProcess(req.params.id);
      if (!proc) return res.status(404).json({ error: "process not found" });
      res.json(await serial(() => recordInto(proc, String(req.body?.scenarioId))));
    }),
  );

  /** Create (or fill) a project with every demo scenario recorded — one-click sample content. */
  api.post(
    "/demo-project",
    wrap(async (req, res) => {
      const languages: string[] = req.body?.languages ?? ["en", "da", "de"];
      const project = store.createProject({
        name: req.body?.name ?? "Northwind ERP Training",
        description: "Sample project recorded automatically against the bundled Northwind ERP demo application.",
        languages,
        branding: { companyName: "Northwind Traders", primaryColor: "#2f6fed", accentColor: "#14b8a6" },
      });
      for (const sc of DEMO_SCENARIOS) {
        const proc = store.createProcess(project.id, { title: sc.title, chapter: sc.chapter, description: sc.description, appName: "Northwind ERP", startUrl: config.baseUrl + sc.startPath })!;
        await serial(() => recordInto(proc, sc.id));
      }
      res.status(201).json(store.getProject(project.id));
    }),
  );

  // ------------------------------------------------------------ replay / automated testing
  api.post(
    "/processes/:id/replay",
    wrap(async (req, res) => {
      const proc = store.getProcess(req.params.id);
      if (!proc) return res.status(404).json({ error: "process not found" });
      const mode = req.body?.mode === "test" ? "test" : "update";
      const lang = String(req.body?.lang ?? proc.lang);
      const result = await serial(() =>
        replayProcess(proc, {
          mode,
          lang,
          mediaDir: store.mediaDir(proc.projectId),
          saveMedia: (png) => store.saveMedia(proc.projectId, png),
          baseUrl: config.baseUrl,
        }),
      );
      const next = { ...result.process, lastReplay: result.report };
      store.saveProcess(next);
      res.json({ report: result.report, process: next });
    }),
  );

  // ------------------------------------------------------------ translation
  api.post(
    "/processes/:id/translate",
    wrap(async (req, res) => {
      const proc = store.getProcess(req.params.id);
      if (!proc) return res.status(404).json({ error: "process not found" });
      const lang = String(req.body?.lang ?? "");
      if (!lang || lang === proc.lang) return res.status(400).json({ error: "target lang required (different from source)" });
      const next = await translateProcess(proc, lang, { replayUi: req.body?.replayUi !== false, ctx });
      res.json(store.saveProcess(next));
    }),
  );

  // ------------------------------------------------------------ exports
  api.get(
    "/processes/:id/export/:format",
    wrap(async (req, res) => {
      const proc = store.getProcess(req.params.id);
      if (!proc) return res.status(404).json({ error: "process not found" });
      const format = req.params.format as OutputFormat;
      if (!FORMATS.includes(format)) return res.status(400).json({ error: `format must be one of ${FORMATS.join(", ")}` });
      const project = store.getProject(proc.projectId)!;
      const lang = String(req.query.lang ?? proc.lang);
      const resolved = resolveProcess(proc, lang, { media: (f) => store.mediaPath(proc.projectId, f) });
      const file = await serial(() => generate(format, { project, process: resolved, libDir: LIB_DIR }));
      store.addEvent({ projectId: proc.projectId, processId: proc.id, type: "download", format, lang, at: new Date().toISOString() });
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
      res.send(file.buffer);
    }),
  );

  // ------------------------------------------------------------ portal
  api.post(
    "/projects/:pid/publish",
    wrap(async (req, res) => {
      const project = store.getProject(req.params.pid);
      if (!project) return res.status(404).json({ error: "project not found" });
      const out = store.publishedDir(project.id);
      const result = await serial(() =>
        buildPortal({ project, processes: store.listProcesses(project.id), mediaDir: store.mediaDir(project.id), libDir: LIB_DIR, outDir: out, apiBase: config.baseUrl }),
      );
      project.publishedAt = new Date().toISOString();
      store.saveProject(project);
      res.json({ url: `${config.baseUrl}/portal/${project.id}/`, ...result });
    }),
  );

  api.get(
    "/projects/:pid/portal.zip",
    wrap(async (req, res) => {
      const dir = store.publishedDir(req.params.pid);
      if (!fs.existsSync(path.join(dir, "index.html"))) return res.status(404).json({ error: "publish the project first" });
      const zip = new JSZip();
      const walk = (d: string, rel = "") => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p, rel + e.name + "/");
          else zip.file(rel + e.name, fs.readFileSync(p));
        }
      };
      walk(dir);
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="portal-${req.params.pid}.zip"`);
      res.send(buf);
    }),
  );

  // ------------------------------------------------------------ AI help
  api.post(
    "/ask",
    wrap(async (req, res) => {
      const { projectId, question, lang } = req.body ?? {};
      if (!projectId || !question) return res.status(400).json({ error: "projectId and question required" });
      const project = store.getProject(projectId);
      if (!project) return res.status(404).json({ error: "project not found" });
      const answer = await ask(store.listProcesses(projectId), String(question), String(lang ?? project.languages[0]), project);
      store.addEvent({ projectId, type: "ask", query: String(question).slice(0, 200), lang, at: new Date().toISOString() });
      res.json(answer);
    }),
  );
}
