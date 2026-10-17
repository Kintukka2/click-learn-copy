import type { PlayerMode, ResolvedProcess } from "../core/model.js";
import type { Stage } from "./stage.js";

export interface PlayerEvent {
  type: "complete";
  mode: string;
  score?: number;
  passed?: boolean;
}

export interface PlayerConfig {
  process: ResolvedProcess;
  mode: PlayerMode;
  ui?: Record<string, string>;
  autoplay?: boolean;
  voice?: boolean;
  video?: boolean;
  scorm?: boolean;
  onEvent?: (e: PlayerEvent) => void;
  /** Brand colour (hex), applied as --sl-primary. */
  primaryColor?: string;
  /** Initial Show Me speed multiplier (default 1). */
  speed?: number;
}

export interface Ctx {
  root: HTMLElement;
  body: HTMLElement;
  cfg: PlayerConfig;
  s: Record<string, string>;
  proc: ResolvedProcess;
  stage: Stage;
  announce(msg: string): void;
  emit(e: PlayerEvent): void;
  compact(): boolean;
  setCounter(i: number): void;
}

export interface Controller {
  start(): void;
  destroy(): void;
  relayout(): void;
}
