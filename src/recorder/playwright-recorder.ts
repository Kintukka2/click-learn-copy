// CONTRACT (implemented by the capture/replay workstream).
import type { CapturePayload } from "../core/model.js";
import type { ScriptedAction } from "./scenarios.js";

export interface RecordOptions {
  startUrl: string; // absolute
  actions: ScriptedAction[];
  viewport?: { width: number; height: number };
  /** Receives every captured event (with a pre-action screenshot data URL) in order. */
  onCapture: (payload: CapturePayload) => Promise<void>;
  headless?: boolean;
}

/** Drive a real browser through the scripted actions with the capture script injected. */
export async function recordScripted(_opts: RecordOptions): Promise<void> {
  throw new Error("recordScripted not implemented yet");
}
