import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { now } from "../core/ids.js";
import { instructionFor, SUPPORTED_LANGS } from "../core/instructions.js";
import type { AnalyticsEvent, CapturePayload, OutputFormat, Process, Step } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import { applyCapture, activeSessions, getSession, startSession, stopSession } from "./recording.js";
import { Store } from "./store.js";
import { pipelineRoutes } from "./pipeline.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const LIB_DIR = path.join(ROOT, "dist", "lib");

export interface AppConfig {
  dataDir: string;
  /** Public origin of this server, e.g. http://localhost:4100 (used for replay/recorder base URLs). */
  baseUrl: string;
}

export interface AppContext {
  store: Store;
  config: AppConfig;
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;
export const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function createApp(config: AppConfig) {
  const store = new Store(config.dataDir);
  const ctx: AppContext = { store, config };
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "50mb" }));

  // CORS for the browser extension and embedded Assist script
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

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
    // keep auto titles in sync with value / target edits
    if (!step.titleEdited && (patch.value !== undefined || patch.target || patch.action || patch.sensitive !== undefined)) {
      step.title = instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive }, proc.lang);
    }
    store.saveProcess(proc);
    res.json(step);
  });
  /** Regenerate an auto title (clears titleEdited). */
  api.post("/processes/:id/steps/:stepId/reset-title", (req, res) => {
    const proc = store.getProcess(req.params.id);
    const step = proc?.steps.find((s) => s.id === req.params.stepId);
    if (!proc || !step) return res.status(404).json({ error: "not found" });
    step.titleEdited = false;
    step.title = instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive }, proc.lang);
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
  api.post("/recordings", (req, res) => {
    const { processId, replace } = req.body ?? {};
    const s = startSession(store, processId, !!replace);
    if (!s) return res.status(404).json({ error: "process not found" });
    res.status(201).json(s);
  });
  api.get("/recordings/active", (_req, res) => res.json(activeSessions()));
  api.post("/recordings/:token/events", (req, res) => {
    const s = getSession(req.params.token);
    if (!s || !s.active) return res.status(410).json({ error: "recording session is not active" });
    const proc = store.getProcess(s.processId);
    if (!proc) return res.status(404).json({ error: "process not found" });
    const payload = req.body as CapturePayload;
    if (!payload?.event?.action) return res.status(400).json({ error: "event required" });
    const step = applyCapture(store, proc, payload);
    s.count = proc.steps.length;
    res.json({ step, stepCount: proc.steps.length });
  });
  api.post("/recordings/:token/stop", (req, res) => {
    const s = stopSession(req.params.token);
    if (!s) return res.status(404).json({ error: "session not found" });
    res.json(store.getProcess(s.processId));
  });

  // -------------------------------------------------------------- in-app lookup (extension side panel, Assist)
  api.get("/lookup", (req, res) => {
    const url = String(req.query.url ?? "");
    let host = "";
    let hashPath = "";
    try {
      const u = new URL(url);
      host = u.host;
      hashPath = (u.hash.replace(/^#/, "").split("?")[0] || u.pathname).toLowerCase();
    } catch {
      /* ignore */
    }
    const results: { process: Process; projectName: string; score: number }[] = [];
    for (const p of store.listProjects()) {
      for (const proc of store.listProcesses(p.id)) {
        let score = 0;
        const urls = [proc.startUrl, ...proc.steps.map((s) => s.url)];
        for (const u of urls) {
          try {
            const pu = new URL(u, config.baseUrl);
            if (pu.host !== host) continue;
            score = Math.max(score, 1);
            const ph = (pu.hash.replace(/^#/, "").split("?")[0] || pu.pathname).toLowerCase();
            if (hashPath && ph && (ph === hashPath)) score = Math.max(score, 3);
            else if (hashPath && ph && (hashPath.startsWith(ph) || ph.startsWith(hashPath))) score = Math.max(score, 2);
          } catch {
            /* ignore */
          }
        }
        if (score) results.push({ process: proc, projectName: p.name, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    res.json(
      results.map((r) => ({ id: r.process.id, projectId: r.process.projectId, projectName: r.projectName, title: r.process.title, chapter: r.process.chapter, steps: r.process.steps.length, relevance: r.score })),
    );
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
  app.use("/studio", express.static(studioDir));
  app.get(["/studio", "/studio/*"], (_req, res) => {
    const index = path.join(studioDir, "index.html");
    if (fs.existsSync(index)) return res.sendFile(index);
    res.status(503).send("Studio is not built yet. Run: npm run build");
  });
  app.get("/", (_req, res) => res.redirect("/studio/"));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[steplight]", err);
    res.status(500).json({ error: err.message || "internal error" });
  });

  return { app, ctx };
}
