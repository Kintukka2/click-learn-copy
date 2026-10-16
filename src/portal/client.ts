// Learning portal client (bundled to dist/lib/portal.js → window.SteplightPortal).
// A small hash-routed SPA over the static data/<lang>.json files written by build.ts.
import { richText } from "../core/instructions.js";
import type { PlayerMode, ResolvedStep } from "../core/model.js";
import { SearchIndex } from "../core/search.js";
import css from "./portal.css";
import type { PortalData, PortalProcessEntry } from "./build.js";

interface PortalConfig {
  projectId: string;
  name: string;
  description: string;
  branding: { companyName: string; primaryColor: string; accentColor?: string; logoDataUrl?: string };
  languages: { code: string; native: string }[];
  defaultLang: string;
  apiBase: string;
  publishedAt: string;
}

declare global {
  interface Window {
    SteplightPlayer?: { mount(el: HTMLElement, cfg: Record<string, unknown>): { destroy(): void } };
  }
}

const FORMAT_LABEL: Record<string, string> = { docx: "Word", pdf: "PDF", pptx: "PowerPoint", html: "HTML guide", scorm: "SCORM 1.2", video: "Video" };
const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5a2 2 0 1 1 4 0v6m0-2a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15a2 2 0 0 1 3.3-2.3L9 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
};

function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}
const esc = (s: string | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

class Portal {
  private data?: PortalData;
  private index?: SearchIndex;
  private lang: string;
  private player?: { destroy(): void };
  private readonly embed: boolean;

  constructor(
    private root: HTMLElement,
    private cfg: PortalConfig,
  ) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const saved = safeGet(`sl-portal-lang-${cfg.projectId}`);
    const browser = navigator.language?.slice(0, 2);
    const codes = cfg.languages.map((l) => l.code);
    this.lang = (saved && codes.includes(saved) && saved) || (browser && codes.includes(browser) && browser) || cfg.defaultLang;
    this.embed = new URLSearchParams(location.search).has("embed");
    if (this.embed) document.documentElement.classList.add("slp-embed");
    window.addEventListener("hashchange", () => this.route());
  }

  t(key: string) {
    return this.data?.ui[key] ?? key;
  }

  async load(lang: string) {
    this.lang = lang;
    safeSet(`sl-portal-lang-${this.cfg.projectId}`, lang);
    document.documentElement.lang = lang;
    const res = await fetch(`data/${lang}.json`);
    this.data = (await res.json()) as PortalData;
    this.index = new SearchIndex();
    for (const p of this.data.processes) {
      this.index.add({ id: p.id, processId: p.id, title: p.title, text: `${p.chapter ?? ""} ${p.description ?? ""} ${p.steps.map((s) => s.title).join(" ")}` });
      for (const s of p.steps) this.index.add({ id: `${p.id}#${s.id}`, processId: p.id, stepId: s.id, title: p.title, text: `${s.title} ${s.description ?? ""}` });
    }
    this.route();
  }

  track(type: string, extra: Record<string, unknown> = {}) {
    if (!this.cfg.apiBase) return;
    fetch(`${this.cfg.apiBase}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: this.cfg.projectId, type, lang: this.lang, ...extra }),
      keepalive: true,
    }).catch(() => undefined);
  }

  // ---------------------------------------------------------------- layout
  private shell(content: HTMLElement) {
    this.player?.destroy();
    this.player = undefined;
    const b = this.cfg.branding;
    const logo = b.logoDataUrl
      ? `<img class="slp-logo-img" src="${esc(b.logoDataUrl)}" alt="">`
      : `<span class="slp-logo-mark" aria-hidden="true">${esc((b.companyName || this.cfg.name).slice(0, 1).toUpperCase())}</span>`;
    const langs = this.cfg.languages
      .map((l) => `<option value="${esc(l.code)}" ${l.code === this.lang ? "selected" : ""}>${esc(l.native)}</option>`)
      .join("");
    const header = h(`<header class="slp-header">
      <a class="slp-brand" href="#/">${logo}<span><strong>${esc(b.companyName || this.cfg.name)}</strong><small>${esc(this.cfg.name)}</small></span></a>
      <label class="slp-lang"><span class="slp-sr">${esc(this.t("language"))}</span><select aria-label="${esc(this.t("language"))}">${langs}</select></label>
    </header>`);
    header.querySelector("select")!.addEventListener("change", (e) => this.load((e.target as HTMLSelectElement).value));
    this.root.replaceChildren(header, content, this.footer(), this.askWidget());
  }

  private footer() {
    const d = new Date(this.cfg.publishedAt);
    return h(`<footer class="slp-footer"><span>${esc(this.t("updated"))} ${esc(d.toLocaleDateString(this.lang))}</span><span>Powered by <strong>Steplight</strong></span></footer>`);
  }

  route() {
    if (!this.data) return;
    const hash = location.hash.replace(/^#/, "");
    const m = hash.match(/^\/p\/([^/?]+)(?:\/(\w+))?/);
    if (m) {
      const proc = this.data.processes.find((p) => p.id === m[1]);
      if (proc) return this.processPage(proc, (m[2] as Tab) ?? "guide");
    }
    this.home();
  }

  // ---------------------------------------------------------------- home
  private home() {
    const data = this.data!;
    const chapters = new Map<string, PortalProcessEntry[]>();
    for (const p of data.processes) {
      const c = p.chapter || this.t("allProcesses");
      if (!chapters.has(c)) chapters.set(c, []);
      chapters.get(c)!.push(p);
    }
    const totalSteps = data.processes.reduce((a, p) => a + p.steps.length, 0);
    const main = h(`<main class="slp-main">
      <section class="slp-hero">
        <h1>${esc(this.cfg.name)}</h1>
        ${this.cfg.description ? `<p>${esc(this.cfg.description)}</p>` : ""}
        <div class="slp-search">${ICON.search}<input type="search" placeholder="${esc(this.t("search"))}" aria-label="${esc(this.t("search"))}" autocomplete="off"></div>
        <div class="slp-stats"><span><strong>${data.processes.length}</strong> ${esc(this.t("processes"))}</span><span><strong>${totalSteps}</strong> ${esc(this.t("steps"))}</span><span><strong>${this.cfg.languages.length}</strong> ${esc(this.t("languages"))}</span></div>
      </section>
      <section class="slp-results" hidden></section>
      <section class="slp-chapters"></section>
    </main>`);
    const chaptersEl = main.querySelector(".slp-chapters")!;
    for (const [name, procs] of chapters) {
      const sec = h(`<div class="slp-chapter"><h2>${esc(name)}</h2><div class="slp-grid"></div></div>`);
      const grid = sec.querySelector(".slp-grid")!;
      for (const p of procs) grid.appendChild(this.card(p));
      chaptersEl.appendChild(sec);
    }
    const input = main.querySelector("input")!;
    const results = main.querySelector<HTMLElement>(".slp-results")!;
    let timer: number | undefined;
    input.addEventListener("input", () => {
      const q = input.value.trim();
      chaptersEl.toggleAttribute("hidden", !!q);
      results.hidden = !q;
      if (!q) return;
      const hits = this.index!.search(q, 30);
      const seen = new Map<string, { score: number; step?: string }>();
      for (const hit of hits) {
        const cur = seen.get(hit.doc.processId);
        if (!cur) seen.set(hit.doc.processId, { score: hit.score, step: hit.doc.stepId });
        else cur.score += hit.score * 0.3;
      }
      const ordered = [...seen.entries()].sort((a, b) => b[1].score - a[1].score);
      results.replaceChildren();
      if (!ordered.length) results.appendChild(h(`<p class="slp-empty">${esc(this.t("noResults"))}</p>`));
      for (const [pid, info] of ordered) {
        const p = data.processes.find((x) => x.id === pid)!;
        const step = info.step ? p.steps.find((s) => s.id === info.step) : undefined;
        const card = this.card(p, step);
        results.appendChild(card);
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => this.track("search", { query: q }), 900);
    });
    this.shell(main);
    document.title = `${this.cfg.name} · ${this.cfg.branding.companyName}`;
    input.focus({ preventScroll: true });
  }

  private card(p: PortalProcessEntry, matchedStep?: ResolvedStep) {
    const thumb = p.steps.find((s) => s.screenshot);
    const formats = p.downloads.map((d) => `<span class="slp-chip">${esc(FORMAT_LABEL[d.format] ?? d.format)}</span>`).join("");
    const el = h(`<a class="slp-card" href="#/p/${esc(p.id)}">
      <div class="slp-thumb">${thumb?.screenshot ? `<img src="${esc(thumb.screenshot)}" alt="" loading="lazy">` : ""}</div>
      <div class="slp-card-body">
        <div class="slp-card-meta">${esc(p.chapter ?? "")}${p.appName ? ` · ${esc(p.appName)}` : ""}</div>
        <h3>${esc(p.title)}</h3>
        ${p.description ? `<p>${esc(p.description)}</p>` : ""}
        ${matchedStep ? `<p class="slp-match">${esc(this.t("step"))} ${matchedStep.index}: ${richText(matchedStep.title)}</p>` : ""}
        <div class="slp-card-foot"><span>${p.steps.length} ${esc(this.t("steps"))}</span><span class="slp-chips">${formats}</span></div>
      </div>
    </a>`);
    return el;
  }

  // ---------------------------------------------------------------- process page
  private processPage(p: PortalProcessEntry, tab: Tab) {
    const assistUrl = this.assistLink(p);
    const tabs: [Tab, string, string][] = [
      ["guide", this.t("written"), ICON.doc],
      ["show", this.t("showMe"), ICON.play],
      ["try", this.t("tryMe"), ICON.hand],
      ["test", this.t("testMe"), ICON.check],
    ];
    const main = h(`<main class="slp-main slp-process">
      <nav class="slp-crumbs"><a href="#/">${ICON.back}${esc(this.t("allProcesses"))}</a>${p.chapter ? `<span>/</span><span>${esc(p.chapter)}</span>` : ""}</nav>
      <div class="slp-process-head">
        <div>
          <h1>${esc(p.title)}</h1>
          ${p.description ? `<p class="slp-lead">${esc(p.description)}</p>` : ""}
          <div class="slp-meta"><span>${p.steps.length} ${esc(this.t("steps"))}</span>${p.appName ? `<span>${esc(p.appName)}</span>` : ""}<span>${esc(this.t("updated"))} ${esc(new Date(p.updatedAt).toLocaleDateString(this.lang))}</span></div>
        </div>
        ${assistUrl ? `<a class="slp-btn slp-btn-primary" href="${esc(assistUrl)}" target="_blank" rel="noopener">${ICON.compass}${esc(this.t("guideMe"))}</a>` : ""}
      </div>
      <div class="slp-tabs" role="tablist">${tabs
        .map(([id, label, icon]) => `<a role="tab" href="#/p/${esc(p.id)}/${id}" aria-selected="${id === tab}" class="slp-tab ${id === tab ? "on" : ""}">${icon}${esc(label)}</a>`)
        .join("")}</div>
      <div class="slp-layout">
        <div class="slp-content" role="tabpanel"></div>
        <aside class="slp-aside">
          <h2>${esc(this.t("downloads"))}</h2>
          <ul class="slp-downloads">${
            p.downloads.length
              ? p.downloads
                  .map(
                    (d) =>
                      `<li><a href="${esc(d.file)}" download data-format="${esc(d.format)}">${ICON.download}<span>${esc(FORMAT_LABEL[d.format] ?? d.format)}</span><small>${kb(d.size)}</small></a></li>`,
                  )
                  .join("")
              : `<li class="slp-empty">—</li>`
          }</ul>
          <h2>${esc(this.t("contents"))}</h2>
          <ol class="slp-toc">${p.steps.map((s) => `<li><a href="#/p/${esc(p.id)}/guide" data-step="${esc(s.id)}">${richText(s.title)}</a></li>`).join("")}</ol>
        </aside>
      </div>
    </main>`);
    main.querySelectorAll<HTMLAnchorElement>("[data-format]").forEach((a) => a.addEventListener("click", () => this.track("download", { processId: p.id, format: a.dataset.format })));
    this.shell(main);
    const content = main.querySelector<HTMLElement>(".slp-content")!;
    main.querySelectorAll<HTMLAnchorElement>("[data-step]").forEach((a) =>
      a.addEventListener("click", (e) => {
        if (tab === "guide") {
          e.preventDefault();
          document.getElementById(`step-${a.dataset.step}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }),
    );
    document.title = `${p.title} · ${this.cfg.name}`;
    this.track("view", { processId: p.id });
    if (tab === "guide") this.writtenGuide(content, p);
    else this.mountPlayer(content, p, tab);
    window.scrollTo({ top: 0 });
  }

  private assistLink(p: PortalProcessEntry): string | undefined {
    if (!this.cfg.apiBase || !p.startUrl) return undefined;
    const resolvedUrl = `${this.cfg.apiBase}/api/processes/${p.id}/resolved?lang=${this.lang}`;
    try {
      const u = new URL(p.startUrl, this.cfg.apiBase);
      const param = `sl_assist=${encodeURIComponent(resolvedUrl)}`;
      if (u.hash) u.hash = u.hash + (u.hash.includes("?") ? "&" : "?") + param;
      else u.search = u.search + (u.search ? "&" : "?") + param;
      return u.toString();
    } catch {
      return undefined;
    }
  }

  private writtenGuide(el: HTMLElement, p: PortalProcessEntry) {
    const list = h(`<ol class="slp-steps"></ol>`);
    for (const s of p.steps) {
      const vw = s.viewport?.width ?? 1280;
      const vh = s.viewport?.height ?? 800;
      const box = s.bbox
        ? `<span class="slp-hl" style="left:${(s.bbox.x / vw) * 100}%;top:${(s.bbox.y / vh) * 100}%;width:${(s.bbox.width / vw) * 100}%;height:${(s.bbox.height / vh) * 100}%"></span>`
        : "";
      list.appendChild(
        h(`<li class="slp-step" id="step-${esc(s.id)}">
          <div class="slp-step-head"><span class="slp-num">${s.index}</span><div><p class="slp-step-title">${richText(s.title)}</p>${s.description ? `<p class="slp-step-desc">${richText(s.description)}</p>` : ""}</div></div>
          ${s.screenshot ? `<figure class="slp-shot" style="aspect-ratio:${vw}/${vh}"><img src="${esc(s.screenshot)}" alt="${esc(this.t("step"))} ${s.index}" loading="lazy">${box}</figure>` : ""}
        </li>`),
      );
    }
    el.replaceChildren(list);
  }

  private mountPlayer(el: HTMLElement, p: PortalProcessEntry, mode: PlayerMode) {
    const host = h(`<div class="slp-player"></div>`);
    el.replaceChildren(host);
    if (!window.SteplightPlayer) {
      host.appendChild(h(`<p class="slp-empty">Player unavailable.</p>`));
      return;
    }
    this.player = window.SteplightPlayer.mount(host, {
      process: p,
      mode,
      ui: this.data!.ui,
      voice: mode === "show",
      primaryColor: this.cfg.branding.primaryColor,
      onEvent: (e: { type: string; mode: string; score?: number }) => {
        if (e.type === "complete") this.track(`${e.mode}_complete`, { processId: p.id, score: e.score });
      },
    });
  }

  // ---------------------------------------------------------------- ask widget
  private askWidget() {
    const w = h(`<div class="slp-ask">
      <button class="slp-ask-fab" aria-expanded="false" aria-controls="slp-ask-panel">${ICON.chat}<span>${esc(this.t("ask"))}</span></button>
      <section class="slp-ask-panel" id="slp-ask-panel" hidden aria-label="${esc(this.t("ask"))}">
        <header><strong>${esc(this.t("ask"))}</strong><button class="slp-icon-btn" aria-label="Close">${ICON.close}</button></header>
        <div class="slp-ask-log" aria-live="polite"></div>
        <form><input placeholder="${esc(this.t("askPlaceholder"))}" aria-label="${esc(this.t("ask"))}" autocomplete="off"><button class="slp-icon-btn slp-send" aria-label="Send">${ICON.send}</button></form>
      </section>
    </div>`);
    const fab = w.querySelector<HTMLButtonElement>(".slp-ask-fab")!;
    const panel = w.querySelector<HTMLElement>(".slp-ask-panel")!;
    const log = w.querySelector<HTMLElement>(".slp-ask-log")!;
    const input = w.querySelector<HTMLInputElement>("form input")!;
    const toggle = (open: boolean) => {
      panel.hidden = !open;
      fab.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    };
    fab.addEventListener("click", () => toggle(panel.hidden));
    w.querySelector("header button")!.addEventListener("click", () => toggle(false));
    w.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      log.appendChild(h(`<div class="slp-msg slp-msg-user">${esc(q)}</div>`));
      const pending = h(`<div class="slp-msg slp-msg-bot slp-typing"><span></span><span></span><span></span></div>`);
      log.appendChild(pending);
      log.scrollTop = log.scrollHeight;
      const ans = await this.ask(q);
      pending.remove();
      const sources = ans.sources
        .slice(0, 3)
        .map((s) => `<a href="#/p/${esc(s.processId)}">${esc(s.title)}</a>`)
        .join("");
      log.appendChild(h(`<div class="slp-msg slp-msg-bot"><div>${richText(ans.answer)}</div>${sources ? `<div class="slp-sources"><small>${esc(this.t("sources"))}</small>${sources}</div>` : ""}</div>`));
      log.scrollTop = log.scrollHeight;
    });
    return w;
  }

  private async ask(q: string): Promise<{ answer: string; sources: { processId: string; title: string }[] }> {
    if (this.cfg.apiBase) {
      try {
        const res = await fetch(`${this.cfg.apiBase}/api/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: this.cfg.projectId, question: q, lang: this.lang }),
        });
        if (res.ok) return await res.json();
      } catch {
        /* offline fallback below */
      }
    }
    // offline: best matching process and its steps
    const hits = this.index!.search(q, 10);
    if (!hits.length) return { answer: this.t("noResults"), sources: [] };
    const score = new Map<string, number>();
    for (const hit of hits) score.set(hit.doc.processId, (score.get(hit.doc.processId) ?? 0) + hit.score);
    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const p = this.data!.processes.find((x) => x.id === best)!;
    return { answer: `**${p.title}**\n${p.steps.map((s) => `${s.index}. ${s.title}`).join("\n")}`, sources: [{ processId: p.id, title: p.title }] };
  }
}

type Tab = "guide" | PlayerMode;

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function start(root: HTMLElement, cfg: PortalConfig) {
  const portal = new Portal(root, cfg);
  portal.load((portal as unknown as { lang: string }).lang).catch((err) => {
    root.textContent = `Could not load the portal: ${(err as Error).message}`;
  });
  return portal;
}
