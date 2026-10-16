// CONTRACT (integration workstream): build the static learning portal for a project.
import type { Process, Project } from "../core/model.js";

export interface PortalBuildOptions {
  project: Project;
  processes: Process[];
  /** Absolute path of the project's media folder. */
  mediaDir: string;
  /** Absolute path of dist/lib. */
  libDir: string;
  /** Output directory (wiped and rebuilt). */
  outDir: string;
  /** Server origin for live features (analytics, AI ask). Empty = fully static. */
  apiBase?: string;
}

export async function buildPortal(_opts: PortalBuildOptions): Promise<{ files: number }> {
  throw new Error("buildPortal not implemented yet");
}
