// Resolve a Process into a ResolvedProcess for one language: localized texts, localized
// screenshots/bboxes when a localized replay exists, masked sensitive values.
import { instructionFor } from "./instructions.js";
import type { Lang, Process, ResolvedProcess, ResolvedStep } from "./model.js";

export interface ResolveOptions {
  /** Map a screenshot file name to a URL or path. Default: identity. */
  media?: (file: string) => string;
}

export function resolveProcess(proc: Process, lang: Lang = proc.lang, opts: ResolveOptions = {}): ResolvedProcess {
  const media = opts.media ?? ((f: string) => f);
  const isSource = lang === proc.lang;
  const loc = isSource ? undefined : proc.localizations[lang];
  const steps: ResolvedStep[] = proc.steps.map((s, i) => {
    const l = loc?.steps[s.id];
    let title = s.title;
    if (!isSource) {
      if (l?.title) title = l.title;
      else
        title = instructionFor(
          { action: s.action, target: s.target, value: l?.value ?? s.value, sensitive: s.sensitive, name: l?.label ?? l?.name },
          lang,
        );
    }
    const shot = (l?.screenshot ?? s.screenshot) || undefined;
    const bbox = l?.screenshot && l.bbox ? l.bbox : s.target?.bbox;
    return {
      id: s.id,
      index: i + 1,
      action: s.action,
      title,
      description: isSource ? s.description : (l?.description ?? s.description),
      value: s.sensitive ? undefined : (l?.value ?? s.value),
      sensitive: s.sensitive,
      screenshot: shot ? media(shot) : undefined,
      bbox,
      viewport: s.viewport,
      target: s.target,
      url: s.url,
    };
  });
  return {
    id: proc.id,
    projectId: proc.projectId,
    title: (!isSource && loc?.title) || proc.title,
    description: (!isSource && loc?.description) || proc.description,
    chapter: proc.chapter,
    appName: proc.appName,
    startUrl: proc.startUrl,
    lang,
    passMark: proc.passMark ?? 80,
    steps,
  };
}
