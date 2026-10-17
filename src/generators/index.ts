// Output generator dispatcher. Each format lives in its own module.
import type { OutputFormat, Project, ResolvedProcess } from "../core/model.js";

export interface GeneratorContext {
  project: Project;
  /** Resolved for the requested language; step.screenshot is an ABSOLUTE file path to a PNG. */
  process: ResolvedProcess;
  /** Absolute path of dist/lib (player.js, player.css, assist.js) for formats that embed players. */
  libDir: string;
}

export interface GeneratedFile {
  buffer: Buffer;
  filename: string;
  mime: string;
}

export async function generate(format: OutputFormat, ctx: GeneratorContext): Promise<GeneratedFile> {
  switch (format) {
    case "docx":
      return (await import("./docx.js")).generateDocx(ctx);
    case "pdf":
      return (await import("./pdf.js")).generatePdf(ctx);
    case "pptx":
      return (await import("./pptx.js")).generatePptx(ctx);
    case "html":
      return (await import("./html.js")).generateHtml(ctx);
    case "scorm":
      return (await import("./scorm.js")).generateScorm(ctx);
    case "video":
      return (await import("./video.js")).generateVideo(ctx);
    default:
      throw new Error(`unsupported format ${format satisfies never}`);
  }
}
