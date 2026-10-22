// AI features: grounded "ask a question" help and translation.
// Uses Claude when credentials are configured; otherwise falls back to a fully offline mode
// (retrieval + extractive answers, template-generated instructions) so nothing breaks.
import Anthropic from "@anthropic-ai/sdk";
import { instructionFor, plainText, SUPPORTED_LANGS } from "../core/instructions.js";
import type { Lang, Process, ProcessLocalization, Project } from "../core/model.js";
import { resolveProcess } from "../core/resolve.js";
import { SearchIndex, type SearchDoc } from "../core/search.js";
import type { AppContext } from "./app.js";

export const MODEL = process.env.STEPLIGHT_MODEL || "claude-opus-5-5";

export function claudeEnabled(): boolean {
  if (process.env.STEPLIGHT_AI === "off") return false;
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.STEPLIGHT_AI === "on");
}

let client: Anthropic | undefined;
export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function aiStatus() {
  return claudeEnabled() ? { provider: "claude", model: MODEL } : { provider: "offline", model: null };
}

async function complete(system: string, user: string, maxTokens = 4000): Promise<string> {
  const response = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();
}

// ------------------------------------------------------------------ ask

export interface AskAnswer {
  answer: string; // markdown-lite (**bold**, numbered lines)
  provider: "claude" | "offline";
  sources: { processId: string; title: string; stepIds: string[]; score: number }[];
}

function buildIndex(processes: Process[], lang: Lang) {
  const docs: SearchDoc[] = [];
  const resolved = processes.map((p) => resolveProcess(p, p.localizations[lang] || lang === p.lang ? lang : p.lang));
  for (const r of resolved) {
    docs.push({ id: r.id, processId: r.id, title: r.title, text: `${r.chapter ?? ""} ${r.description ?? ""} ${r.steps.map((s) => plainText(s.title)).join(" ")}` });
    for (const s of r.steps) docs.push({ id: `${r.id}#${s.id}`, processId: r.id, stepId: s.id, title: r.title, text: `${plainText(s.title)} ${s.description ?? ""}` });
  }
  return { index: new SearchIndex(docs), resolved };
}

export async function ask(processes: Process[], question: string, lang: Lang, project: Project): Promise<AskAnswer> {
  const { index, resolved } = buildIndex(processes, lang);
  const hits = index.search(question, 12);
  // aggregate by process
  const agg = new Map<string, { score: number; stepIds: string[] }>();
  for (const h of hits) {
    const a = agg.get(h.doc.processId) ?? { score: 0, stepIds: [] };
    a.score += h.score * (h.doc.stepId ? 0.6 : 1);
    if (h.doc.stepId) a.stepIds.push(h.doc.stepId);
    agg.set(h.doc.processId, a);
  }
  const ranked = [...agg.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3);
  const sources = ranked.map(([pid, a]) => ({ processId: pid, title: resolved.find((r) => r.id === pid)?.title ?? pid, stepIds: a.stepIds, score: Math.round(a.score * 100) / 100 }));

  if (!ranked.length) {
    return { answer: noAnswer(lang), provider: claudeEnabled() ? "claude" : "offline", sources: [] };
  }

  if (claudeEnabled()) {
    try {
      const context = ranked
        .map(([pid]) => {
          const r = resolved.find((x) => x.id === pid)!;
          return `<process id="${r.id}" title="${r.title}">\n${r.description ?? ""}\n${r.steps.map((s) => `${s.index}. ${plainText(s.title)}${s.description ? ` — ${s.description}` : ""}`).join("\n")}\n</process>`;
        })
        .join("\n\n");
      const langName = SUPPORTED_LANGS.find((l) => l.code === lang)?.name ?? "English";
      const answer = await complete(
        `You are the in-app help assistant for ${project.name}. Answer only from the documented processes provided by the user message. ` +
          `If they don't cover the question, say so briefly and suggest the closest process. Answer in ${langName}. ` +
          `Be concise: one short sentence, then numbered steps if relevant. Use **bold** for UI element names. Do not invent UI elements.`,
        `Documented processes:\n\n${context}\n\nQuestion: ${question}`,
        2000,
      );
      return { answer, provider: "claude", sources };
    } catch (err) {
      console.warn("[steplight] Claude ask failed, using offline answer:", (err as Error).message);
    }
  }

  // offline extractive answer: best process, its steps
  const best = resolved.find((r) => r.id === ranked[0][0])!;
  const lines = best.steps.filter((s) => s.action !== "note").map((s) => `${s.index}. ${s.title}`);
  const intro: Record<string, string> = { en: `Here is how to **${best.title}**:`, da: `Sådan gør du – **${best.title}**:`, de: `So geht es – **${best.title}**:` };
  return { answer: `${intro[lang] ?? intro.en}\n${lines.join("\n")}`, provider: "offline", sources };
}

function noAnswer(lang: Lang) {
  const m: Record<string, string> = {
    en: "I couldn't find a documented process for that. Try different words, or ask your trainer to record it.",
    da: "Jeg kunne ikke finde en dokumenteret proces for det. Prøv andre ord.",
    de: "Dazu habe ich keinen dokumentierten Prozess gefunden. Versuchen Sie andere Begriffe.",
  };
  return m[lang] ?? m.en;
}

// ------------------------------------------------------------------ translate

/** Translate a batch of strings, preserving **bold** markers. Returns the same number of strings. */
export async function translateTexts(texts: string[], from: Lang, to: Lang): Promise<string[] | undefined> {
  if (!texts.length) return [];
  if (!claudeEnabled()) return undefined;
  const fromName = SUPPORTED_LANGS.find((l) => l.code === from)?.name ?? from;
  const toName = SUPPORTED_LANGS.find((l) => l.code === to)?.name ?? to;
  const out = await complete(
    `You translate software training content from ${fromName} to ${toName}. Keep **bold** markers around the same words. ` +
      `Keep product names, numbers and values typed by the user unchanged. Reply with only a JSON array of strings, same length and order as the input.`,
    JSON.stringify(texts),
    8000,
  );
  try {
    const arr = JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (Array.isArray(arr) && arr.length === texts.length) return arr.map(String);
  } catch {
    /* fall through */
  }
  console.warn("[steplight] translation response was not a JSON array of the right length");
  return undefined;
}

/**
 * Localize a process into `lang`:
 *  1. (optional) Replay the process with the application UI in `lang`, capturing localized screenshots
 *     and the element names as the localized UI shows them — instructions are then regenerated
 *     from templates with real localized UI names (no machine translation needed for them).
 *  2. Translate author-written text (edited titles, descriptions, process title) with Claude if available.
 */
export async function translateProcess(proc: Process, lang: Lang, opts: { replayUi: boolean; ctx: AppContext }): Promise<Process> {
  let next: Process = structuredClone(proc);
  next.localizations[lang] ??= { steps: {} };

  if (opts.replayUi && proc.steps.some((s) => s.target)) {
    try {
      const { replayProcess } = await import("../replay/replay.js");
      const result = await replayProcess(next, {
        mode: "update",
        lang,
        mediaDir: opts.ctx.store.mediaDir(proc.projectId),
        saveMedia: (png) => opts.ctx.store.saveMedia(proc.projectId, png),
        baseUrl: opts.ctx.config.baseUrl,
        rewriteUrl: opts.ctx.toInternal,
      });
      next = result.process;
      next.localizations[lang] ??= { steps: {} };
    } catch (err) {
      console.warn("[steplight] localized replay failed; continuing with text-only translation:", (err as Error).message);
    }
  }

  const loc: ProcessLocalization = next.localizations[lang];
  for (const s of next.steps) loc.steps[s.id] ??= {};

  // free text to translate
  const jobs: { set: (v: string) => void; text: string }[] = [];
  if (next.title) jobs.push({ text: next.title, set: (v) => (loc.title = v) });
  if (next.description) jobs.push({ text: next.description, set: (v) => (loc.description = v) });
  for (const s of next.steps) {
    const ls = loc.steps[s.id]!;
    if (s.titleEdited && !ls.titleEdited) jobs.push({ text: s.title, set: (v) => (ls.title = v) });
    if (s.description) jobs.push({ text: s.description, set: (v) => (ls.description = v) });
    if (s.learnerChooses && s.choiceHint) jobs.push({ text: s.choiceHint, set: (v) => (ls.choiceHint = v) });
  }
  const translated = await translateTexts(
    jobs.map((j) => j.text),
    proc.lang,
    lang,
  ).catch((err) => {
    console.warn("[steplight] translation failed:", (err as Error).message);
    return undefined;
  });
  if (translated) translated.forEach((t, i) => jobs[i].set(t));
  // regenerate auto titles from localized UI names (and translated choice hints)
  for (const s of next.steps) {
    const ls = loc.steps[s.id]!;
    if (!s.titleEdited && !ls.titleEdited) {
      ls.title = instructionFor({ action: s.action, target: s.target, value: ls.value ?? s.value, sensitive: s.sensitive, learnerChooses: s.learnerChooses, hint: ls.choiceHint ?? s.choiceHint, name: ls.label ?? ls.name }, lang);
    }
  }
  loc.status = "auto";
  loc.updatedAt = new Date().toISOString();
  return next;
}
