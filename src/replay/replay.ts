// CONTRACT (implemented by the capture/replay workstream).
import type { Lang, Process, ReplayReport } from "../core/model.js";

export interface ReplayOptions {
  /** "update" re-captures screenshots + bboxes and writes them into the process; "test" only verifies. */
  mode: "update" | "test";
  /** Replay with the application UI in this language (localized screenshots). Default: process.lang. */
  lang?: Lang;
  /** Absolute path of the project's media folder (new screenshots are written here in update mode). */
  mediaDir: string;
  /** Called to persist a new PNG; returns the file name stored. */
  saveMedia: (png: Buffer) => string;
  viewport?: { width: number; height: number };
  /** Base URL used to resolve relative startUrls (e.g. "http://localhost:4100"). */
  baseUrl?: string;
  headless?: boolean;
}

export interface ReplayResult {
  report: ReplayReport;
  /** The process with refreshed screenshots/bboxes/replayStatus (update mode) or unchanged (test mode). */
  process: Process;
}

export async function replayProcess(_proc: Process, _opts: ReplayOptions): Promise<ReplayResult> {
  throw new Error("replayProcess not implemented yet");
}
