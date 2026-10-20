// Steps where the learner picks their own value or record (Step.learnerChooses): which steps can be
// marked, and which ones look like the learner's choice so the Studio can suggest marking them.
// Pure functions, browser-safe.
import type { Step } from "./model.js";

/** Type (not sensitive), select and check steps, and clicks on a table/grid row or a calendar day. */
export function canLearnerChoose(s: Pick<Step, "action" | "sensitive" | "target">): boolean {
  if (s.action === "type") return !s.sensitive;
  if (s.action === "select" || s.action === "check") return true;
  return s.action === "click" && !!s.target?.row;
}

const DATE_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);
const DATE_WORDS = /\b(date|dates|from|to|period|start|end|due|as of|as at|until|since)\b/i;
const SEARCH_WORDS = /\b(search|filter|find|quick filter|look ?up)\b/i;
const PARAM_CONTEXT = /\b(parameters?|criteria|report|records to include|range|options|filter)\b/i;

/**
 * Why a step that is not marked yet looks like the learner's choice (shown as a suggestion in the
 * Studio), or undefined. Never applied automatically: the author confirms.
 */
export function choiceSuggestion(s: Step): string | undefined {
  if (s.learnerChooses || !canLearnerChoose(s)) return undefined;
  const t = s.target;
  const name = `${t?.label ?? ""} ${t?.name ?? ""}`;
  const inParams = PARAM_CONTEXT.test(t?.context ?? "");
  if (s.action === "click") return t?.row?.calendar ? "A date picked in a calendar" : "A record picked from a list";
  if (s.action === "type") {
    if (DATE_TYPES.has(t?.inputType ?? "") || DATE_WORDS.test(name)) return "A date or period";
    if (t?.inputType === "search" || t?.role === "searchbox" || SEARCH_WORDS.test(name)) return "A search or filter value";
    if (inParams) return "A report or filter parameter";
    return undefined;
  }
  if (inParams) return "A report or filter parameter";
  if (s.action === "select" && DATE_WORDS.test(name)) return "A date or period";
  return undefined;
}
