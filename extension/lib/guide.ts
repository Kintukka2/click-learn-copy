// "Guide me": loads the Assist library (bundled in the extension) into a tab and starts a process
// there. Shared by the side panel and the popup.
/// <reference path="./chrome.d.ts" />
import { uiStrings } from "../../src/core/instructions.js";
import type { ResolvedProcess } from "../../src/core/model.js";
import { api } from "./shared.js";

export interface LookupRow { id: string; projectId: string; projectName: string; title: string; chapter?: string; steps: number; relevance: number }

/** Lookup relevance of a guide recorded on this very page (see pageMatch in src/core/url.ts). */
export const SAME_PAGE = 3;

/** Starts Assist for a process in the tab; resolves to an error message, or "" on success. The Assist
 * library ships inside the extension (assist.js, copied there by scripts/build-lib.mjs): web stores do
 * not allow extensions to run code fetched from a server, so only the process itself comes from it. */
export async function startGuide(server: string, tabId: number, processId: string, lang: string): Promise<string> {
  const proc = await api<ResolvedProcess>(server, `/processes/${processId}/resolved?lang=${encodeURIComponent(lang)}`);
  const version = chrome.runtime.getManifest().version;
  const target = { tabId };
  // Stop a running guide; tell whether this extension version of Assist is already in the tab.
  const [loaded] = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [version],
    func: (v: string) => {
      const w = window as unknown as { SteplightAssist?: { stop?(): void }; __steplightAssistExt?: string };
      try {
        w.SteplightAssist?.stop?.();
      } catch {
        /* not running */
      }
      return !!w.SteplightAssist && w.__steplightAssistExt === v;
    },
  });
  if (!loaded?.result) await chrome.scripting.executeScript({ target, world: "MAIN", files: ["assist.js"] });
  const [out] = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [proc, uiStrings(lang), `${server}/api/events`, version],
    func: (p: unknown, ui: Record<string, string>, eventsUrl: string, v: string) => {
      const w = window as unknown as { SteplightAssist?: { start(p: unknown, o?: unknown): void }; __steplightAssistExt?: string };
      if (!w.SteplightAssist) return "Assist could not be loaded into this page.";
      w.__steplightAssistExt = v;
      w.SteplightAssist.start(p, { ui, eventsUrl });
      return "";
    },
  });
  return String(out?.result ?? "");
}
