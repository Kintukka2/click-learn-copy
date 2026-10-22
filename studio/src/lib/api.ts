// Thin typed client for the Steplight REST API (see docs/ARCHITECTURE.md, "Server API").
import type { OutputFormat, Process, Project, ReplayReport, ResolvedProcess, Step } from "../../../src/core/model";
import { ROOT } from "./base";

export type ProjectSummary = Project & { processCount: number };

export interface DemoScenarioInfo {
  id: string;
  title: string;
  chapter: string;
  description: string;
  startPath: string;
  actionCount: number;
}

export interface RecordingSession {
  token: string;
  processId: string;
  startedAt: string;
  count: number;
  active: boolean;
}

export interface Analytics {
  totals: Record<string, number>;
  byProcess: Record<string, Record<string, number>>;
  avgScore: Record<string, number>;
  topQueries: [string, number][];
  daily: Record<string, number>;
  eventCount: number;
}

export interface AiStatus {
  provider: "claude" | "offline" | string;
  model: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j?.error) msg = String(j.error);
    } catch {
      if (text && text.length < 300 && !text.trim().startsWith("<")) msg = text.trim();
    }
  } catch {
    /* ignore */
  }
  if (res.status === 404 && msg.startsWith("404")) msg = "Not found (endpoint not available yet?)";
  return new ApiError(msg, res.status);
}

export async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ROOT}/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Cannot reach the Steplight server. Is it running?", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("Content-Type") ?? "";
  if (!ct.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(p: string, signal?: AbortSignal) => request<T>("GET", p, undefined, signal);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>("PATCH", p, b);
const put = <T>(p: string, b: unknown) => request<T>("PUT", p, b);
const del = <T>(p: string) => request<T>("DELETE", p);

/** Fetch a file and hand it to the browser as a download. */
export async function download(url: string, fallbackName: string): Promise<{ name: string; size: number }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError("Cannot reach the Steplight server. Is it running?", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
  return { name, size: blob.size };
}

export interface ImportResult {
  process: Process;
  provider: "claude" | "offline";
  warning?: string;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Upload a Word guide (sent as the request body); the server drafts a process from it. */
async function importGuide(pid: string, file: File, opts: { startUrl?: string; chapter?: string; appName?: string }): Promise<ImportResult> {
  const q = new URLSearchParams({ fileName: file.name });
  for (const [k, v] of Object.entries(opts)) if (v?.trim()) q.set(k, v.trim());
  let res: Response;
  try {
    res = await fetch(`${ROOT}/api/projects/${pid}/import-guide?${q}`, { method: "POST", headers: { "Content-Type": file.type || DOCX }, body: file });
  } catch {
    throw new ApiError("Cannot reach the Steplight server. Is it running?", 0);
  }
  if (res.status === 413) throw new ApiError("The document is too large to import (60 MB at most).", 413);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as ImportResult;
}

export const api = {
  health: () => get<{ ok: boolean }>("/health"),
  aiStatus: () => get<AiStatus>("/ai/status"),
  demoScenarios: () => get<DemoScenarioInfo[]>("/demo-scenarios"),

  projects: () => get<ProjectSummary[]>("/projects"),
  project: (pid: string) => get<Project>(`/projects/${pid}`),
  createProject: (b: Partial<Project> & { name: string }) => post<Project>("/projects", b),
  updateProject: (pid: string, b: Partial<Project>) => patch<Project>(`/projects/${pid}`, b),
  deleteProject: (pid: string) => del<void>(`/projects/${pid}`),
  reorder: (pid: string, processIds: string[]) => put<Project>(`/projects/${pid}/order`, { processIds }),
  demoProject: (b: { name?: string; languages?: string[] } = {}) => post<Project>("/demo-project", b),
  importGuide,
  publish: (pid: string) => post<{ url: string }>(`/projects/${pid}/publish`),
  analytics: (pid: string) => get<Analytics>(`/projects/${pid}/analytics`),

  processes: (pid: string) => get<Process[]>(`/projects/${pid}/processes`),
  process: (id: string) => get<Process>(`/processes/${id}`),
  resolved: (id: string, lang: string, signal?: AbortSignal) => get<ResolvedProcess>(`/processes/${id}/resolved?lang=${encodeURIComponent(lang)}`, signal),
  createProcess: (pid: string, b: { title: string; chapter?: string; description?: string; appName?: string; startUrl?: string }) =>
    post<Process>(`/projects/${pid}/processes`, b),
  updateProcess: (id: string, b: Partial<Process>) => patch<Process>(`/processes/${id}`, b),
  deleteProcess: (id: string) => del<void>(`/processes/${id}`),

  putSteps: (id: string, steps: Step[]) => put<Process>(`/processes/${id}/steps`, { steps }),
  insertNote: (id: string, b: { afterStepId?: string; title: string; description?: string }) => post<Step>(`/processes/${id}/steps`, b),
  updateStep: (id: string, stepId: string, b: Partial<Step>) => patch<Step>(`/processes/${id}/steps/${stepId}`, b),
  deleteStep: (id: string, stepId: string) => del<Process>(`/processes/${id}/steps/${stepId}`),
  resetTitle: (id: string, stepId: string) => post<Step>(`/processes/${id}/steps/${stepId}/reset-title`),

  startRecording: (processId: string, replace: boolean) => post<RecordingSession>("/recordings", { processId, replace }),
  stopRecording: (token: string) => post<Process>(`/recordings/${token}/stop`),
  activeRecordings: () => get<RecordingSession[]>("/recordings/active"),
  demoRecord: (id: string, scenarioId: string) => post<Process>(`/processes/${id}/demo-record`, { scenarioId }),

  replay: (id: string, mode: "update" | "test", lang?: string) => post<{ report: ReplayReport; process: Process }>(`/processes/${id}/replay`, { mode, lang }),
  translate: (id: string, lang: string, replayUi: boolean) => post<Process>(`/processes/${id}/translate`, { lang, replayUi }),
  exportUrl: (id: string, format: OutputFormat, lang: string) => `${ROOT}/api/processes/${id}/export/${format}?lang=${encodeURIComponent(lang)}`,
};

export const mediaUrl = (pid: string, file?: string) => (file ? `${ROOT}/media/${pid}/${encodeURIComponent(file)}` : undefined);
