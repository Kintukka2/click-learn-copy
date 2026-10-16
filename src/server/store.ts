// File-based store: every project is a folder of JSON + PNG files, easy to inspect, diff and back up.
//   data/projects/<projectId>/project.json
//   data/projects/<projectId>/processes/<processId>.json
//   data/projects/<projectId>/media/<file>.png
//   data/events.jsonl                     analytics
//   data/published/<projectId>/...        static learning portal
import fs from "node:fs";
import path from "node:path";
import { newId, now } from "../core/ids.js";
import type { AnalyticsEvent, Process, Project } from "../core/model.js";

export class Store {
  readonly root: string;
  private procIndex = new Map<string, string>(); // processId -> projectId

  constructor(root: string) {
    this.root = path.resolve(root);
    fs.mkdirSync(path.join(this.root, "projects"), { recursive: true });
    fs.mkdirSync(path.join(this.root, "published"), { recursive: true });
    this.reindex();
  }

  private reindex() {
    this.procIndex.clear();
    for (const pid of this.listDirs(path.join(this.root, "projects"))) {
      const dir = path.join(this.root, "projects", pid, "processes");
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) this.procIndex.set(f.slice(0, -5), pid);
    }
  }

  private listDirs(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  }

  private readJson<T>(file: string): T | undefined {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  private writeJson(file: string, data: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  projectDir(pid: string) {
    return path.join(this.root, "projects", pid);
  }
  mediaDir(pid: string) {
    return path.join(this.projectDir(pid), "media");
  }
  publishedDir(pid: string) {
    return path.join(this.root, "published", pid);
  }

  // ------------------------------------------------------------ projects
  listProjects(): Project[] {
    return this.listDirs(path.join(this.root, "projects"))
      .map((pid) => this.getProject(pid))
      .filter((p): p is Project => !!p)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(pid: string): Project | undefined {
    return this.readJson<Project>(path.join(this.projectDir(pid), "project.json"));
  }

  createProject(input: Partial<Project> & { name: string }): Project {
    const t = now();
    const p: Project = {
      id: newId("prj"),
      name: input.name,
      description: input.description ?? "",
      languages: input.languages?.length ? input.languages : ["en"],
      branding: { companyName: input.name, primaryColor: "#2f6fed", accentColor: "#14b8a6", ...(input.branding ?? {}) },
      processIds: [],
      createdAt: t,
      updatedAt: t,
    };
    this.saveProject(p);
    fs.mkdirSync(this.mediaDir(p.id), { recursive: true });
    return p;
  }

  saveProject(p: Project): Project {
    p.updatedAt = now();
    this.writeJson(path.join(this.projectDir(p.id), "project.json"), p);
    return p;
  }

  updateProject(pid: string, patch: Partial<Project>): Project | undefined {
    const p = this.getProject(pid);
    if (!p) return undefined;
    const { id: _id, createdAt: _c, ...rest } = patch;
    const next: Project = { ...p, ...rest, branding: { ...p.branding, ...(patch.branding ?? {}) } };
    return this.saveProject(next);
  }

  deleteProject(pid: string): boolean {
    const dir = this.projectDir(pid);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(this.publishedDir(pid), { recursive: true, force: true });
    this.reindex();
    return true;
  }

  // ------------------------------------------------------------ processes
  listProcesses(pid: string): Process[] {
    const p = this.getProject(pid);
    if (!p) return [];
    const all = p.processIds.map((id) => this.getProcess(id)).filter((x): x is Process => !!x);
    return all;
  }

  getProcess(id: string): Process | undefined {
    const pid = this.procIndex.get(id);
    if (!pid) return undefined;
    return this.readJson<Process>(path.join(this.projectDir(pid), "processes", `${id}.json`));
  }

  createProcess(pid: string, input: Partial<Process> & { title: string }): Process | undefined {
    const project = this.getProject(pid);
    if (!project) return undefined;
    const t = now();
    const proc: Process = {
      id: newId("prc"),
      projectId: pid,
      title: input.title,
      description: input.description ?? "",
      chapter: input.chapter ?? "",
      appName: input.appName ?? "",
      startUrl: input.startUrl ?? "",
      lang: input.lang ?? project.languages[0] ?? "en",
      steps: input.steps ?? [],
      localizations: input.localizations ?? {},
      passMark: input.passMark ?? 80,
      tags: input.tags ?? [],
      createdAt: t,
      updatedAt: t,
    };
    this.procIndex.set(proc.id, pid);
    this.saveProcess(proc);
    project.processIds.push(proc.id);
    this.saveProject(project);
    return proc;
  }

  saveProcess(proc: Process): Process {
    proc.updatedAt = now();
    this.procIndex.set(proc.id, proc.projectId);
    this.writeJson(path.join(this.projectDir(proc.projectId), "processes", `${proc.id}.json`), proc);
    return proc;
  }

  updateProcess(id: string, patch: Partial<Process>): Process | undefined {
    const proc = this.getProcess(id);
    if (!proc) return undefined;
    const { id: _id, projectId: _p, createdAt: _c, ...rest } = patch;
    return this.saveProcess({ ...proc, ...rest });
  }

  deleteProcess(id: string): boolean {
    const proc = this.getProcess(id);
    if (!proc) return false;
    fs.rmSync(path.join(this.projectDir(proc.projectId), "processes", `${id}.json`), { force: true });
    this.procIndex.delete(id);
    const project = this.getProject(proc.projectId);
    if (project) {
      project.processIds = project.processIds.filter((x) => x !== id);
      this.saveProject(project);
    }
    return true;
  }

  // ------------------------------------------------------------ media
  /** Save a PNG (data URL or buffer) into the project's media folder; returns the file name. */
  saveMedia(pid: string, data: string | Buffer, prefix = "shot"): string {
    const buf = typeof data === "string" ? Buffer.from(data.replace(/^data:image\/\w+;base64,/, ""), "base64") : data;
    const name = `${newId(prefix)}.png`;
    fs.mkdirSync(this.mediaDir(pid), { recursive: true });
    fs.writeFileSync(path.join(this.mediaDir(pid), name), buf);
    return name;
  }

  mediaPath(pid: string, file: string): string {
    const safe = path.basename(file);
    return path.join(this.mediaDir(pid), safe);
  }

  // ------------------------------------------------------------ analytics
  addEvent(ev: AnalyticsEvent) {
    fs.appendFileSync(path.join(this.root, "events.jsonl"), JSON.stringify(ev) + "\n");
  }

  events(pid?: string): AnalyticsEvent[] {
    const file = path.join(this.root, "events.jsonl");
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as AnalyticsEvent;
        } catch {
          return undefined;
        }
      })
      .filter((e): e is AnalyticsEvent => !!e && (!pid || e.projectId === pid));
  }
}
