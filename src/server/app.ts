import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { now } from "../core/ids.js";
import { instructionFor, SUPPORTED_LANGS } from "../core/instructions.js";
import type { AnalyticsEvent, CapturePayload, OutputFormat, Process, Step } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import { joinUrl, normalizeBasePath, pageKey, pageMatch, swapPrefix } from "../core/url.js";
import { accessKeyMiddleware } from "./auth.js";
import { applyBuildCapture, applyCapture, activeSessions, assignLastAction, buildPlan, draftsLeft, getSession, recordNote, startSession, stopSession } from "./recording.js";
import { Store } from "./store.js";
import { importRoutes } from "./guide-import.js";
import { pipelineRoutes } from "./pipeline.js";
import { privacyPage } from "./privacy.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The size of a PNG image, from its header; undefined for anything else. */
function pngSize(buf: unknown): { width: number; height: number } | undefined {
  if (!Buffer.isBuffer(buf) || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return undefined;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width && height ? { width, height } : undefined;
}
export const LIB_DIR = path.join(ROOT, "dist", "lib");

export interface AppConfig {
  dataDir: string;
  /**
   * Public URL of this server, including a path prefix when it is served under one,
   * e.g. http://localhost:4100 or https://examplewebsite.app/steplight.
   */
  baseUrl: string;
  /** Path prefix to mount under (default: the path of baseUrl), e.g. "/steplight". */
  basePath?: string;
  /** URL the server's own headless browser uses to reach it (default: baseUrl), e.g. http://127.0.0.1:4100/steplight. */
  internalUrl?: string;
  /** When set, the Studio and authoring API require this key (see auth.ts). */
  accessKey?: string;
  /** Publisher name and contact address shown in the extension's privacy policy (<base>/privacy). */
  publisher?: string;
  contactEmail?: string;
}

export interface AppContext {
  store: Store;
  config: AppConfig;
  basePath: string;
  /** Public URL → URL the headless browser should open. */
  toInternal: (url: string) => string;
  /** Internal URL captured by the headless browser → public URL stored in processes. */
  toPublic: (url: string) => string;
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;
export const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function createApp(config: AppConfig) {
  const store = new Store(config.dataDir);
  config.baseUrl = config.baseUrl.replace(/\/+$/, "");
  const basePath = normalizeBasePath(config.basePath ?? new URL(config.baseUrl).pathname);
  const internalUrl = (config.internalUrl ?? config.baseUrl).replace(/\/+$/, "");
  const ctx: AppContext = {
    store,
    config,
    basePath,
    toInternal: (u) => swapPrefix(u, config.baseUrl, internalUrl),
    toPublic: (u) => swapPrefix(u, internalUrl, config.baseUrl),
  };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  // CORS for the browser extension and embedded Assist script
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Steplight-Key");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(accessKeyMiddleware(config.accessKey, basePath));

  const api = express.Router();

  api.get("/health", (_req, res) => res.json({ ok: true, name: "steplight", time: now() }));
  api.get("/languages", (_req, res) => res.json(SUPPORTED_LANGS));

  // -------------------------------------------------------------- projects
  api.get("/projects", (_req, res) => {
    res.json(
      store.listProjects().map((p) => ({ ...p, processCount: p.processIds.length })),
    );
  });
  api.post("/projects", (req, res) => {
    if (!req.body?.name) return res.status(400).json({ error: "name is required" });
    res.status(201).json(store.createProject(req.body));
  });
  api.get("/projects/:pid", (req, res) => {
    const p = store.getProject(req.params.pid);
    if (!p) return res.status(404).json({ error: "project not found" });
    res.json(p);
  });
  api.patch("/projects/:pid", (req, res) => {
    const p = store.updateProject(req.params.pid, req.body ?? {});
    if (!p) return res.status(404).json({ error: "project not found" });
    res.json(p);
  });
  api.delete("/projects/:pid", (req, res) => {
    if (!store.deleteProject(req.params.pid)) return res.status(404).json({ error: "project not found" });
    res.sendStatus(204);
  });

  // -------------------------------------------------------------- processes
  api.get("/projects/:pid/processes", (req, res) => {
    if (!store.getProject(req.params.pid)) return res.status(404).json({ error: "project not found" });
    res.json(store.listProcesses(req.params.pid));
  });
  api.post("/projects/:pid/processes", (req, res) => {
    if (!req.body?.title) return res.status(400).json({ error: "title is required" });
    const proc = store.createProcess(req.params.pid, req.body);
    if (!proc) return res.status(404).json({ error: "project not found" });
    res.status(201).json(proc);
  });
  api.get("/processes/:id", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    res.json(proc);
  });
  /** Resolved (localized, ready-to-render) process — used by players, Assist and the extension. */
  api.get("/processes/:id/resolved", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const lang = String(req.query.lang ?? proc.lang);
    res.json(resolveProcess(proc, lang, { media: (f) => `${config.baseUrl}/media/${proc.projectId}/${f}` }));
  });
  api.patch("/processes/:id", (req, res) => {
    const proc = store.updateProcess(req.params.id, req.body ?? {});
    if (!proc) return res.status(404).json({ error: "process not found" });
    res.json(proc);
  });
  api.delete("/processes/:id", (req, res) => {
    if (!store.deleteProcess(req.params.id)) return res.status(404).json({ error: "process not found" });
    res.sendStatus(204);
  });
  /** Reorder project processes: body { processIds: string[] } */
  api.put("/projects/:pid/order", (req, res) => {
    const p = store.getProject(req.params.pid);
    if (!p) return res.status(404).json({ error: "project not found" });
    const ids: string[] = Array.isArray(req.body?.processIds) ? req.body.processIds : [];
    const known = new Set(p.processIds);
    p.processIds = [...ids.filter((x) => known.has(x)), ...p.processIds.filter((x) => !ids.includes(x))];
    res.json(store.saveProject(p));
  });

  // -------------------------------------------------------------- steps
  /** Replace all steps (used for reorder / bulk edit). */
  api.put("/processes/:id/steps", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    if (!Array.isArray(req.body?.steps)) return res.status(400).json({ error: "steps[] required" });
    proc.steps = req.body.steps as Step[];
    res.json(store.saveProcess(proc));
  });
  api.patch("/processes/:id/steps/:stepId", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const step = proc.steps.find((s) => s.id === req.params.stepId);
    if (!step) return res.status(404).json({ error: "step not found" });
    const patch = req.body ?? {};
    if (typeof patch.title === "string" && patch.title !== step.title) patch.titleEdited = true;
    Object.assign(step, patch, { id: step.id });
    if (patch.draft === null) delete step.draft; // "Keep the current recording" of a step to record again
    // keep auto titles in sync with value / target edits
    if (!step.titleEdited && (patch.value !== undefined || patch.target || patch.action || patch.sensitive !== undefined || patch.learnerChooses !== undefined || patch.choiceHint !== undefined)) {
      step.title = instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive, learnerChooses: step.learnerChooses, hint: step.choiceHint }, proc.lang);
    }
    store.saveProcess(proc);
    res.json(step);
  });
  /**
   * Replace a step's screenshot with an image (a PNG body), e.g. one the author took. The highlight
   * is scaled with it when the image has the same shape; otherwise the author places it again.
   */
  api.put("/processes/:id/steps/:stepId/screenshot", express.raw({ type: "image/png", limit: "20mb" }), (req, res) => {
    const proc = store.getProcess(req.params.id);
    const step = proc?.steps.find((s) => s.id === req.params.stepId);
    if (!proc || !step) return res.status(404).json({ error: "not found" });
    const size = pngSize(req.body);
    if (!size) return res.status(400).json({ error: "Send the screenshot as a PNG image." });
    const before = step.viewport;
    const box = step.target?.bbox;
    if (step.target && box) {
      const k = before?.width ? size.width / before.width : 0;
      if (before?.height && k && Math.abs(size.height / (before.height * k) - 1) < 0.03) {
        step.target.bbox = { x: Math.round(box.x * k), y: Math.round(box.y * k), width: Math.round(box.width * k), height: Math.round(box.height * k) };
      } else delete step.target.bbox;
    }
    step.screenshot = store.saveMedia(proc.projectId, req.body as Buffer);
    step.viewport = size;
    store.saveProcess(proc);
    res.json(step);
  });
  /** Regenerate an auto title (clears titleEdited). */
  api.post("/processes/:id/steps/:stepId/reset-title", (req, res) => {
    const proc = store.getProcess(req.params.id);
    const step = proc?.steps.find((s) => s.id === req.params.stepId);
    if (!proc || !step) return res.status(404).json({ error: "not found" });
    step.titleEdited = false;
    step.title = instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive, learnerChooses: step.learnerChooses, hint: step.choiceHint }, proc.lang);
    store.saveProcess(proc);
    res.json(step);
  });
  /** Insert a note step: body { afterStepId?, title, description? } */
  api.post("/processes/:id/steps", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const { afterStepId, title, description, screenshot } = req.body ?? {};
    const idx = afterStepId ? proc.steps.findIndex((s) => s.id === afterStepId) + 1 : proc.steps.length;
    const prev = proc.steps[Math.max(0, idx - 1)];
    const step: Step = {
      id: `stp_${Math.random().toString(36).slice(2, 12)}`,
      action: "note",
      title: title || "Note",
      titleEdited: true,
      description,
      url: prev?.url ?? proc.startUrl,
      screenshot: screenshot ?? prev?.screenshot,
      viewport: prev?.viewport,
      capturedAt: now(),
    };
    proc.steps.splice(idx, 0, step);
    store.saveProcess(proc);
    res.status(201).json(step);
  });
  api.delete("/processes/:id/steps/:stepId", (req, res) => {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const before = proc.steps.length;
    proc.steps = proc.steps.filter((s) => s.id !== req.params.stepId);
    if (proc.steps.length === before) return res.status(404).json({ error: "step not found" });
    for (const l of Object.values(proc.localizations)) delete l.steps[req.params.stepId];
    res.json(store.saveProcess(proc));
  });

  // -------------------------------------------------------------- recording (extension / recorder)
  /** body { processId, replace?, build? }; build: record a process drafted from a guide → session + plan (its draft steps). */
  api.post("/recordings", (req, res) => {
    const { processId, replace, build } = req.body ?? {};
    const proc = store.getProcess(processId);
    if (!proc) return res.status(404).json({ error: "process not found" });
    if (build && !draftsLeft(proc)) return res.status(400).json({ error: "This process has no steps from a guide left to record." });
    const s = startSession(store, processId, !!replace, !!build)!;
    res.status(201).json(build ? { ...s, plan: buildPlan(proc) } : s);
  });
  api.get("/recordings/active", (_req, res) => res.json(activeSessions()));
  api.post("/recordings/:token/events", (req, res) => {
    const s = getSession(req.params.token);
    if (!s || !s.active) return res.status(410).json({ error: "recording session is not active" });
    const proc = store.getProcess(s.processId);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const payload = req.body as CapturePayload;
    if (!payload?.event?.action) return res.status(400).json({ error: "event required" });
    if (s.build && payload.build) {
      const r = applyBuildCapture(store, proc, payload, s.token);
      s.count = proc.steps.length;
      return res.json({ ...r, stepCount: proc.steps.length });
    }
    const step = applyCapture(store, proc, payload);
    s.count = proc.steps.length;
    res.json({ step, stepCount: proc.steps.length });
  });
  /** Recording from a guide: the extra step recorded just before draft `stepId` is that step. body { stepId } */
  api.post("/recordings/:token/assign", (req, res) => {
    const s = getSession(req.params.token);
    if (!s || !s.active || !s.build) return res.status(410).json({ error: "recording session is not active" });
    const proc = store.getProcess(s.processId);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const step = assignLastAction(store, proc, String(req.body?.stepId ?? ""), s.token);
    if (!step) return res.status(409).json({ error: "Do the step in the application first: Steplight then records it as this step." });
    res.json({ step, draftsLeft: draftsLeft(proc), stepCount: proc.steps.length });
  });
  /** Recording from a guide: a draft note shown in the application. body { stepId, screenshotDataUrl?, url?, pageTitle?, viewport? } */
  api.post("/recordings/:token/note", (req, res) => {
    const s = getSession(req.params.token);
    if (!s || !s.active || !s.build) return res.status(410).json({ error: "recording session is not active" });
    const proc = store.getProcess(s.processId);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const step = recordNote(store, proc, String(req.body?.stepId ?? ""), req.body ?? {}, s.token);
    if (!step) return res.status(404).json({ error: "no draft note with that id" });
    res.json({ step, draftsLeft: draftsLeft(proc), stepCount: proc.steps.length });
  });
  api.post("/recordings/:token/stop", (req, res) => {
    const s = stopSession(req.params.token);
    if (!s) return res.status(404).json({ error: "session not found" });
    res.json(store.getProcess(s.processId));
  });

  // -------------------------------------------------------------- in-app lookup (extension side panel, Assist)
  api.get("/lookup", (req, res) => {
    const here = pageKey(String(req.query.url ?? ""));
    const results: { process: Process; projectName: string; score: number }[] = [];
    if (here) {
      for (const p of store.listProjects()) {
        for (const proc of store.listProcesses(p.id)) {
          let score = 0;
          for (const u of [proc.startUrl, ...proc.steps.map((s) => s.url)]) {
            const rec = u ? pageKey(joinUrl(config.baseUrl, u)) : null;
            if (rec) score = Math.max(score, pageMatch(here, rec));
          }
          if (score) results.push({ process: proc, projectName: p.name, score });
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    res.json(
      results.map((r) => ({ id: r.process.id, projectId: r.process.projectId, projectName: r.projectName, title: r.process.title, chapter: r.process.chapter, steps: r.process.steps.length, relevance: r.score })),
    );
  });

  // Hosts that have guides, so the extension only looks up pages of those applications.
  api.get("/lookup/hosts", (_req, res) => {
    const hosts = new Set<string>();
    for (const p of store.listProjects()) {
      for (const proc of store.listProcesses(p.id)) {
        for (const u of [proc.startUrl, ...proc.steps.map((s) => s.url)]) {
          const k = u ? pageKey(joinUrl(config.baseUrl, u)) : null;
          if (k) hosts.add(k.host);
        }
      }
    }
    res.json([...hosts]);
  });

  // -------------------------------------------------------------- analytics
  api.post("/events", (req, res) => {
    const ev = req.body as AnalyticsEvent;
    if (!ev?.projectId || !ev?.type) return res.status(400).json({ error: "projectId and type required" });
    store.addEvent({ ...ev, at: now() });
    res.sendStatus(204);
  });
  api.get("/projects/:pid/analytics", (req, res) => {
    const evs = store.events(req.params.pid);
    const byProcess: Record<string, Record<string, number>> = {};
    const scores: Record<string, number[]> = {};
    const totals: Record<string, number> = {};
    const searches: Record<string, number> = {};
    const daily: Record<string, number> = {};
    for (const e of evs) {
      totals[e.type] = (totals[e.type] ?? 0) + 1;
      const day = e.at.slice(0, 10);
      daily[day] = (daily[day] ?? 0) + 1;
      if (e.processId) {
        byProcess[e.processId] ??= {};
        byProcess[e.processId][e.type] = (byProcess[e.processId][e.type] ?? 0) + 1;
        if (e.type === "test_complete" && typeof e.score === "number") (scores[e.processId] ??= []).push(e.score);
      }
      if ((e.type === "search" || e.type === "ask") && e.query) searches[e.query.toLowerCase()] = (searches[e.query.toLowerCase()] ?? 0) + 1;
    }
    const avgScore = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
    res.json({ totals, byProcess, avgScore, topQueries: Object.entries(searches).sort((a, b) => b[1] - a[1]).slice(0, 10), daily, eventCount: evs.length });
  });

  // pipeline: replay, demo recordings, exports, translate, publish, ask
  pipelineRoutes(api, ctx);
  // import a written guide (Word) as a draft process
  importRoutes(api, ctx);

  app.use("/api", api);

  // -------------------------------------------------------------- static
  app.get("/media/:pid/:file", (req, res) => {
    const file = store.mediaPath(req.params.pid, req.params.file);
    if (!fs.existsSync(file)) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(file);
  });
  app.use("/lib", express.static(LIB_DIR, { fallthrough: true }));
  app.use("/demo-erp", express.static(path.join(ROOT, "demo-erp")));
  app.use("/portal/:pid", (req, res, next) => {
    const dir = store.publishedDir(req.params.pid);
    express.static(dir)(req, res, next);
  });
  const studioDir = path.join(ROOT, "dist", "studio");
  app.use("/studio", express.static(studioDir, { index: false }));
  let studioHtml: { mtime: number; html: string } | undefined;
  app.get(["/studio", "/studio/*"], (_req, res) => {
    const index = path.join(studioDir, "index.html");
    if (!fs.existsSync(index)) return res.status(503).send("Studio is not built yet. Run: npm run build");
    const mtime = fs.statSync(index).mtimeMs;
    if (studioHtml?.mtime !== mtime) {
      // the build references /studio/…; serve it under the base path and tell the app where it lives
      const html = fs
        .readFileSync(index, "utf8")
        .replace(/(["'(])\/studio\//g, `$1${basePath}/studio/`)
        .replace("</head>", `<script>window.STEPLIGHT_BASE=${JSON.stringify(basePath)}</script></head>`);
      studioHtml = { mtime, html };
    }
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(studioHtml.html);
  });
  app.get("/privacy", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(privacyPage(config));
  });
  app.get("/", (_req, res) => res.redirect(`${basePath}/studio/`));

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    // body parsers set a status, e.g. 413 for a file over the size limit
    const status = typeof err.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("[steplight]", err);
    res.status(status).json({ error: err.message || "internal error" });
  });

  if (!basePath) return { app, ctx };
  // serve everything under the prefix, e.g. https://examplewebsite.app/steplight/…
  const outer = express();
  outer.disable("x-powered-by");
  outer.set("trust proxy", true);
  outer.use(basePath, app);
  outer.get("/", (_req, res) => res.redirect(`${basePath}/studio/`));
  return { app: outer, ctx };
}
