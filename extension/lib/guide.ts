// "Guide me": loads the Assist library (served by the Steplight server at /lib/assist.js) into a tab
// and starts a process there. Shared by the side panel and the popup.
/// <reference path="./chrome.d.ts" />
import { uiStrings } from "../../src/core/instructions.js";
import type { ResolvedProcess } from "../../src/core/model.js";
import { api } from "./shared.js";

export interface LookupRow { id: string; projectId: string; projectName: string; title: string; chapter?: string; steps: number; relevance: number }

/** Lookup relevance of a guide recorded on this very page (see pageMatch in src/core/url.ts). */
export const SAME_PAGE = 3;

/** Starts Assist for a process in the tab; resolves to an error message, or "" on success. */
export async function startGuide(server: string, tabId: number, processId: string, lang: string): Promise<string> {
  const proc = await api<ResolvedProcess>(server, `/processes/${processId}/resolved?lang=${encodeURIComponent(lang)}`);
  const res = await fetch(`${server}/lib/assist.js`);
  if (!res.ok || !/javascript/.test(res.headers.get("content-type") ?? "")) throw new Error("The Assist library is not available on the server (run npm run build:lib).");
  const code = await res.text();
  const [out] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [code, proc, uiStrings(lang), `${server}/api/events`],
    func: (src: string, p: unknown, ui: Record<string, string>, eventsUrl: string) => {
      const w = window as unknown as { SteplightAssist?: { start(p: unknown, o?: unknown): void; stop?(): void }; __steplightAssistSrc?: string };
      // (Re)load when the server has a different version than the one already in this tab.
      if (!w.SteplightAssist || w.__steplightAssistSrc !== src) {
        try {
          w.SteplightAssist?.stop?.();
        } catch {
          /* not running */
        }
        const s = document.createElement("script");
        s.textContent = src;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        w.__steplightAssistSrc = src;
      }
      if (!w.SteplightAssist) return "Assist could not be loaded into this page (blocked by its Content Security Policy?).";
      try {
        w.SteplightAssist.stop?.();
      } catch {
        /* not running */
      }
      w.SteplightAssist.start(p, { ui, eventsUrl });
      return "";
    },
  });
  return String(out?.result ?? "");
}
