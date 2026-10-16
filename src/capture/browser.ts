// esbuild entry for dist/lib/capture.js → window.SteplightCapture (see ARCHITECTURE "capture.js").
import type { Selector, Target } from "../core/model.js";
import { isRecording, start as startCapture, stop as stopCapture, type CaptureOptions, type Emit } from "./capture.js";
import { accessibleName, getRole, isVisible, labelOf } from "./dom.js";
import { resolveTarget } from "./resolve.js";
import { describeElement } from "./selectors.js";

export function start(emit: Emit, opts?: CaptureOptions): void {
  startCapture(emit, opts);
}

export function stop(): void {
  stopCapture();
}

export function describe(el: Element): Target {
  return describeElement(el);
}

export function resolve(target: Target): { element: Element; index: number; selector: Selector } | null {
  return resolveTarget(target, document);
}

export const version = "1.0.0";
export { isRecording, accessibleName, getRole, isVisible, labelOf };

const api = { start, stop, describe, resolve, version, isRecording, accessibleName, getRole, isVisible, labelOf };
(globalThis as unknown as { SteplightCapture: typeof api }).SteplightCapture = api;
