// A written guide → a step plan: the action of each step, the element it works on, the value, the
// screenshot that shows it, and what the author should check. Claude reads the guide (text and
// screenshots) when it is configured; otherwise rules read the common phrasings of software guides
// ("Click **New**.", "In the **Pool ID** field, enter **WHOLESALE**.", "Go to A > B > C.").
import type Anthropic from "@anthropic-ai/sdk";
import { ELEMENT_KINDS, type ElementKind } from "../core/draft.js";
import { claude, MODEL } from "./ai.js";
import type { DocBlock, WordDocument } from "./docx.js";

export type PlanAction = "click" | "type" | "select" | "check" | "press" | "note";

export interface PlanStep {
  action: PlanAction;
  element: { kind: ElementKind | "none"; name: string };
  /** Text to type, option to select, "true"/"false" for check, key for press; "" otherwise. */
  value: string;
  learnerChooses: boolean;
  choiceHint: string;
  /** Extra explanation for the step; for a note, the note's text. */
  description: string;
  /** The guide's own words for the step. */
  source: string;
  /** Index into WordDocument.images of the screenshot that shows the step, or null. */
  image: number | null;
  /** What the author should check, or "". */
  flag: string;
  added: boolean;
}

export interface GuidePlan {
  title: string;
  description: string;
  chapter: string;
  appName: string;
  steps: PlanStep[];
}

const ACTIONS: PlanAction[] = ["click", "type", "select", "check", "press", "note"];
const KINDS = [...ELEMENT_KINDS.map((k) => k.kind), "none"] as const;

// ------------------------------------------------------------------ Claude

/** A screenshot of the guide sent to Claude: index into WordDocument.images and the (downscaled) image. */
export interface VisionImage {
  image: number;
  mediaType: "image/png" | "image/jpeg";
  data: string; // base64
}

const SYSTEM = `You turn a written software guide (a Word document) into a step plan for Steplight, which records business processes in web applications and publishes them as interactive guides. An author reviews your plan in Steplight Studio and then records it in the application, so say what is unclear instead of guessing.

How to write the plan:
- One step per user action, in order: click, type (fill a text field), select (choose an option in a drop-down list), check (tick or clear a check box or a Yes/No toggle; value "true" or "false"), press (a keyboard key; value is the key, e.g. "Enter"). Split a guide line that holds several actions into several steps.
- A menu path such as "Accounts receivable > Setup > Customer pools" becomes one click step per entry, kind "link".
- element.kind is one of button, link, tab, menuitem, field (text field), dropdown, checkbox, text (any other clickable text), or "none" for notes and key presses. element.name is the element's visible name or the field's label as the application shows it, without the guide's quotes or punctuation.
- value: the text to type, the option to select, "true"/"false" for check, the key for press; "" otherwise. When the value depends on the user (a name, a date, "your company") or is only an example, set learnerChooses and say what to enter in choiceHint (e.g. "a name for the pool"); value is then the guide's example, or "".
- description: a short explanation from the guide that belongs to the step (a business rule, what happens next), or "". A warning, tip or explanation that should stand on its own becomes a "note" step whose text is in description.
- source: the guide's own words for the step, copied exactly (the same line for every step split from it).
- image: the number of the screenshot that shows the screen where the step happens (one image can serve several steps), or null. Never a logo, an icon or another picture that isn't a screen of the application.
- flag: when you can't tell which element or value the guide means, or the guide is vague ("fill in the details as required"), tell the author in one short sentence what to check; "" otherwise.
- added: true only for a step the guide leaves out but the process clearly needs (for example saving the record); also flag it. Add nothing else.
- Leave out the table of contents, revision history, sign-off tables and anything that isn't part of the process. Use the guide's introduction for the process description.
- title: the process title, starting with a verb ("Create a customer pool"). chapter: the module or area the process belongs to ("Accounts receivable"), or "". appName: the application, if the guide names it, or "".
Write in the guide's language.`;

const str = (description: string) => ({ type: "string", description });

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "chapter", "appName", "steps"],
  properties: {
    title: str("Process title, starting with a verb"),
    description: str("What the process achieves, from the guide's introduction"),
    chapter: str("Module or area, or empty"),
    appName: str("Application name, or empty"),
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "element", "value", "learnerChooses", "choiceHint", "description", "source", "image", "flag", "added"],
        properties: {
          action: { type: "string", enum: ACTIONS },
          element: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "name"],
            properties: { kind: { type: "string", enum: KINDS }, name: str("Visible name or field label") },
          },
          value: str("Text to type, option to select, true/false for check, key for press, or empty"),
          learnerChooses: { type: "boolean" },
          choiceHint: str("What the user enters or picks, when learnerChooses"),
          description: str("Explanation for the step; the text of a note"),
          source: str("The guide's words for this step, verbatim"),
          image: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Number of the screenshot that shows this step" },
          flag: str("What the author should check, or empty"),
          added: { type: "boolean" },
        },
      },
    },
  },
};

/** The guide as numbered lines for Claude: headings, text, list items, table cells and images in order. */
export function renderGuide(doc: WordDocument, fileName: string, attached: Set<number>, decorative: Set<number> = new Set()): string {
  const line = (b: DocBlock, i: number) => {
    const where = b.cell ? `table row ${b.cell.row}, cell ${b.cell.col}: ` : "";
    let what: string;
    if (b.kind === "image") what = `Image ${b.image! + 1}${decorative.has(b.image!) ? " (a logo or icon, not a screenshot)" : attached.has(b.image!) ? "" : " (not attached)"}`;
    else if (b.kind === "heading") what = `${b.level ? `Heading ${b.level}` : "Title"}: ${b.text}`;
    else if (b.kind === "item") what = `${b.numbered ? "Numbered" : "Bulleted"} item${b.level ? `, level ${b.level + 1}` : ""}: ${b.text}`;
    else what = `Text: ${b.text}`;
    return `[${i + 1}] ${where}${what}`;
  };
  const head = [`Guide file: ${fileName}`, doc.title ? `Document title: ${doc.title}` : "", attached.size ? "The screenshots above are labelled with their image numbers." : ""];
  return [...head.filter(Boolean), "", ...doc.blocks.map(line)].join("\n");
}

export async function planWithClaude(doc: WordDocument, fileName: string, vision: VisionImage[], decorative: Set<number> = new Set()): Promise<GuidePlan> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const v of vision) {
    content.push({ type: "text", text: `Image ${v.image + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: v.mediaType, data: v.data } });
  }
  content.push({ type: "text", text: renderGuide(doc, fileName, new Set(vision.map((v) => v.image)), decorative) });
  const message = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Claude declined to read this guide.");
  if (message.stop_reason === "max_tokens") throw new Error("The guide is too long to read in one go. Split it into one document per process.");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return normalizePlan(JSON.parse(text), doc);
}

/** Coerce a plan from Claude into valid values (unknown actions become notes, images in range, 0-based). */
export function normalizePlan(raw: unknown, doc: WordDocument): GuidePlan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((x): PlanStep => {
    const st = (x ?? {}) as Record<string, unknown>;
    const el = (st.element ?? {}) as Record<string, unknown>;
    const action = ACTIONS.includes(st.action as PlanAction) ? (st.action as PlanAction) : "note";
    const kind = (KINDS as readonly string[]).includes(el.kind as string) ? (el.kind as ElementKind | "none") : "none";
    const n = typeof st.image === "number" && Number.isInteger(st.image) ? st.image - 1 : -1;
    return {
      action,
      element: { kind, name: s(el.name) },
      value: s(st.value),
      learnerChooses: st.learnerChooses === true,
      choiceHint: s(st.choiceHint),
      description: s(st.description),
      source: s(st.source),
      image: n >= 0 && n < doc.images.length ? n : null,
      flag: s(st.flag),
      added: st.added === true,
    };
  });
  return { title: s(r.title), description: s(r.description), chapter: s(r.chapter), appName: s(r.appName), steps };
}

// ------------------------------------------------------------------ offline rules

const unquote = (s: string) =>
  s
    .replace(/\*\*/g, "")
    .replace(/^[\s"“”‘’'(]+|[\s"“”‘’')]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** The element in a phrase: its first bold part if it has one, else the phrase without quotes. */
const nameIn = (s: string) => unquote(/\*\*(.+?)\*\*/.exec(s)?.[1] ?? s);
const DESCRIBED = /^(a|an|the|your|any|some|appropriate|relevant|required|desired|correct|valid)\b/i;

function step(action: PlanAction, kind: ElementKind | "none", name: string, value = ""): PlanStep {
  return { action, element: { kind, name }, value, learnerChooses: false, choiceHint: "", description: "", source: "", image: null, flag: "", added: false };
}

/** A value from the guide: bold or quoted text is literal; "a name for the pool" is what the learner enters. */
function withValue(st: PlanStep, phrase: string): PlanStep {
  const lit = /\*\*(.+?)\*\*/.exec(phrase)?.[1] ?? /["“]([^"”]+)["”]/.exec(phrase)?.[1];
  const v = unquote(lit ?? phrase);
  if (lit || !DESCRIBED.test(v)) st.value = v;
  else {
    st.learnerChooses = true;
    st.choiceHint = v;
  }
  return st;
}

const KEY = (k: string) => (/^esc/i.test(k) ? "Escape" : /^f\d/i.test(k) ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1).toLowerCase());
const FIELD = "(?: field| box| text box| textbox)?";
const LIST = "(?: field| list| drop-?down(?: list)?| lookup| menu)?";

const RULES: [RegExp, (m: RegExpExecArray) => PlanStep[]][] = [
  [/^press (?:the )?\**(enter|tab|esc|escape|f\d{1,2})\**(?: key)?$/i, (m) => [step("press", "none", "", KEY(m[1]))]],
  [/^(?:go to|navigate to|browse to|open|click|select|choose)\s+(.+?(?:>|→|»).+)$/i, (m) => m[1].split(/\s*(?:>|→|»)\s*/).map((p) => step("click", "link", nameIn(p)))],
  [/^(?:select|tick|check|mark|enable)(?: the)? (.+?) (?:check ?box|option|toggle)$/i, (m) => [step("check", "checkbox", nameIn(m[1]), "true")]],
  [/^(?:clear|untick|uncheck|deselect|disable)(?: the)? (.+?)(?: check ?box| option| toggle)?$/i, (m) => [step("check", "checkbox", nameIn(m[1]), "false")]],
  [/^set (?:the )?(.+?)(?: option| toggle| field| check ?box)? to \**(yes|no|on|off)\**$/i, (m) => [step("check", "checkbox", nameIn(m[1]), String(/^(yes|on)$/i.test(m[2])))]],
  [new RegExp(`^in (?:the )?(.+?)${FIELD},? (?:enter|type|input|key in|fill in) (.+)$`, "i"), (m) => [withValue(step("type", "field", nameIn(m[1])), m[2])]],
  [new RegExp(`^(?:enter|type|input|key in|fill in) (.+?) (?:in|into) the (.+?)${FIELD}$`, "i"), (m) => [withValue(step("type", "field", nameIn(m[2])), m[1])]],
  [new RegExp(`^in (?:the )?(.+?)${LIST},? (?:select|choose|pick) (.+)$`, "i"), (m) => [withValue(step("select", "dropdown", nameIn(m[1])), m[2])]],
  [/^(?:select|choose|pick) (.+?) (?:in|from) the (.+?) (?:field|list|drop-?down(?: list)?|lookup)$/i, (m) => [withValue(step("select", "dropdown", nameIn(m[2])), m[1])]],
  [/^choose (.+?) from the menu$/i, (m) => [step("click", "menuitem", nameIn(m[1]))]],
  [/^(?:select|click|open|go to)(?: on)? the (.+?) tab$/i, (m) => [step("click", "tab", nameIn(m[1]))]],
  [/^click(?: on)? the (.+?) link$/i, (m) => [step("click", "link", nameIn(m[1]))]],
  [/^click(?: in)? the (.+?) field$/i, (m) => [step("click", "field", nameIn(m[1]))]],
  [/^(?:click|click on|tap|select|choose|press)(?: the)? (.+?)(?: button| icon)?$/i, (m) => [step("click", "button", nameIn(m[1]))]],
];

/** Read one instruction ("Click **New**") into steps, or undefined when no rule fits. */
export function parseInstruction(sentence: string): PlanStep[] | undefined {
  const s = sentence.replace(/^(?:step\s*)?\d{1,3}\s*[.):–-]\s+/i, "").replace(/^[•·▪◦‣-]\s+/, "").replace(/[\s.;:!]+$/, "").trim();
  for (const [re, make] of RULES) {
    const m = re.exec(s);
    if (!m) continue;
    const steps = make(m).filter((st) => st.action === "press" || st.element.name);
    if (!steps.length) return undefined;
    for (const st of steps) if (st.element.name.split(" ").length > 5) st.flag = `Check the element: Steplight read “${st.element.name}” from the guide.`;
    return steps;
  }
  return undefined;
}

/** Sentences and "…, then …" parts of a line, keeping **bold** names whole. */
function parts(text: string): string[] {
  const out: string[] = [];
  for (const p of text.replace(/\n+/g, " ").split(/(?<=[.!?;])\s+(?=[A-Z*"“(])|,\s+(?:and\s+)?then\s+|\s+and\s+then\s+/)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (prev.match(/\*\*/g)?.length ?? 0) % 2 === 1) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out.map((p) => p.trim()).filter(Boolean);
}

const UNCLEAR = "Steplight couldn't tell which action this is. Set the action and the element, or keep it as a note.";

/** Steps for one line of the guide: each instruction in it, with the rest as their description. */
function stepsForLine(text: string): PlanStep[] {
  const out: PlanStep[] = [];
  for (const p of parts(text)) {
    const made = parseInstruction(p);
    if (made) out.push(...made);
    else if (out.length) {
      const last = out[out.length - 1];
      last.description = [last.description, p].filter(Boolean).join(" ");
    }
  }
  if (!out.length) out.push({ ...step("note", "none", ""), description: text, flag: UNCLEAR });
  for (const st of out) st.source = text;
  return out;
}

const looksLikeStep = (text: string) => parts(text).some((p) => parseInstruction(p));

/** `skip`: pictures that are not screenshots (logos, icons), left out. */
export function planOffline(doc: WordDocument, fileName: string, skip: Set<number> = new Set()): GuidePlan {
  const hasItems = doc.blocks.some((b) => b.kind === "item");
  const steps: PlanStep[] = [];
  const sectionOf = new Map<PlanStep, number>();
  let section = 0;
  const intro: string[] = [];
  let title = doc.title ?? "";
  let pendingImage: number | null = null;
  let fromLast: PlanStep[] = []; // steps made from the previous line, which a following picture shows
  for (const b of doc.blocks) {
    if (b.kind === "heading") {
      if (!title && (b.level ?? 9) <= 1) title = b.text;
      fromLast = [];
      pendingImage = null;
      section++;
      continue;
    }
    if (b.kind === "image") {
      if (skip.has(b.image!)) continue;
      const open = fromLast.filter((st) => st.image === null);
      if (open.length) for (const st of open) st.image = b.image!;
      else pendingImage ??= b.image!;
      continue;
    }
    const text = b.text.replace(/^(?:step\s*)?\d{1,3}\s*[.):–-]?\s*$/i, "").trim();
    if (!text) continue;
    if (hasItems ? b.kind !== "item" : !looksLikeStep(text)) {
      // explanation: before the first step it describes the process, after it the step before (whose
      // screenshot can still follow)
      const last = steps[steps.length - 1];
      if (!last) intro.push(text);
      else last.description = [last.description, text].filter(Boolean).join("\n");
      continue;
    }
    const made = stepsForLine(text);
    if (pendingImage !== null) for (const st of made) st.image = pendingImage;
    pendingImage = null;
    steps.push(...made);
    for (const st of made) sectionOf.set(st, section);
    fromLast = made;
  }
  // a guide's screenshot usually serves the steps after it too, until the next one or the next heading
  let shown: number | null = null;
  let at = -1;
  for (const st of steps) {
    if (sectionOf.get(st) !== at) {
      at = sectionOf.get(st)!;
      shown = null;
    }
    if (st.image === null) st.image = shown;
    else shown = st.image;
  }
  // "Go to Accounts receivable > Setup > …": the first entry of a menu path is the module
  const path = steps.find((st) => st.action === "click" && st.element.kind === "link" && /\s(?:>|→|»)\s/.test(st.source));
  return {
    title: title || fileName.replace(/\.docx$/i, ""),
    // sentences, not cover-page labels ("**Training guide**")
    description: intro
      .filter((p) => /[.!?]$/.test(p) && !/^\*\*[^*]+\*\*$/.test(p))
      .slice(0, 2)
      .map((p) => p.replace(/\*\*/g, ""))
      .join("\n"),
    chapter: path?.element.name ?? "",
    appName: "",
    steps,
  };
}
