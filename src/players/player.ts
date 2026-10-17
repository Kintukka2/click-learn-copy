// SteplightPlayer.mount(): builds the player shell (top bar, stage, live region) and hands over to
// the Show Me or Try/Test controller.
import { plainText } from "../core/instructions.js";
import css from "./player.css";
import { h, icon } from "./dom.js";
import { ICONS } from "./icons.js";
import { PracticeController } from "./practice.js";
import { ShowController } from "./show.js";
import { stopSpeaking } from "./speech.js";
import { Stage } from "./stage.js";
import { playerStrings } from "./strings.js";
import type { Controller, Ctx, PlayerConfig } from "./types.js";

export type { PlayerConfig, PlayerEvent } from "./types.js";

const STYLE_ID = "steplight-player-css";

function injectCss() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = css;
  (document.head ?? document.documentElement).append(st);
}

const COMPACT_W = 640;

export function mount(el: HTMLElement, cfg: PlayerConfig): { destroy(): void } {
  if (!el) throw new Error("SteplightPlayer.mount: missing element");
  if (!cfg?.process) throw new Error("SteplightPlayer.mount: missing cfg.process");
  injectCss();
  const mode = cfg.mode === "try" || cfg.mode === "test" ? cfg.mode : "show";
  const proc = cfg.process;
  const s = playerStrings(proc.lang, cfg.ui);
  const fixed = !!cfg.video || el.clientHeight >= 200;

  const live = h("div", { class: "sl-sr", "aria-live": "polite", "aria-atomic": "true" });
  const root = h("div", {
    class: `sl-player sl-m-${mode}${cfg.video ? " sl-video" : ""}${fixed ? " sl-fixed" : ""}`,
    role: "region",
    "aria-label": `${plainText(proc.title)} – ${mode === "show" ? s.showMe : mode === "try" ? s.tryMe : s.testMe}`,
    lang: proc.lang,
    "data-steplight-ignore": "",
  });
  if (cfg.primaryColor) root.style.setProperty("--sl-primary", cfg.primaryColor);

  const counter = h("span", { class: "sl-count" });
  if (!cfg.video) {
    const modeLabel = mode === "show" ? s.showMe : mode === "try" ? s.tryMe : s.testMe;
    const modeIcon = mode === "show" ? ICONS.play : mode === "try" ? ICONS.hand : ICONS.award;
    const fs = h("button", { class: "sl-btn sl-icon-btn sl-btn-ghost sl-fs", type: "button", "aria-label": s.fullscreen, title: s.fullscreen }, icon(ICONS.fullscreen));
    fs.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void root.requestFullscreen?.().catch(() => undefined);
    });
    if (!document.fullscreenEnabled) fs.hidden = true;
    root.append(
      h(
        "header",
        { class: "sl-top" },
        h("div", { class: "sl-top-l" }, h("span", { class: "sl-mode" }, icon(modeIcon), modeLabel), h("span", { class: "sl-top-title", title: plainText(proc.title) }, plainText(proc.title))),
        h("div", { class: "sl-top-r" }, counter, fs),
      ),
    );
  }

  const stage = new Stage({ fixed, chrome: !cfg.video, reserve: mode === "show" ? 230 : 260 });
  const body = h("div", { class: "sl-body" }, stage.el);
  root.append(body, live);
  el.append(root);

  let liveTimer = 0;
  const ctx: Ctx = {
    root,
    body,
    cfg,
    s,
    proc,
    stage,
    announce(msg: string) {
      window.clearTimeout(liveTimer);
      live.textContent = "";
      liveTimer = window.setTimeout(() => (live.textContent = msg), 60);
    },
    emit(e) {
      try {
        cfg.onEvent?.(e);
      } catch (err) {
        console.error(err);
      }
    },
    compact: () => root.classList.contains("sl-compact"),
    setCounter(i: number) {
      counter.textContent = i >= 0 ? `${s.step} ${i + 1} ${s.of} ${proc.steps.length}` : "";
    },
  };

  const syncCompact = () => {
    const w = root.clientWidth || el.clientWidth || window.innerWidth;
    const was = root.classList.contains("sl-compact");
    const now = w < COMPACT_W;
    root.classList.toggle("sl-compact", now);
    return was !== now;
  };
  syncCompact();

  const controller: Controller = mode === "show" ? new ShowController(ctx) : new PracticeController(ctx, mode);
  stage.layout();
  let raf = 0;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      syncCompact();
      stage.layout();
      controller.relayout();
    });
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(root);
  if (fixed) ro?.observe(stage.el);
  window.addEventListener("resize", onResize);
  controller.start();

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      controller.destroy();
      stopSpeaking();
      root.remove();
    },
  };
}
