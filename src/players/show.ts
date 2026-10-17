// Show Me: an auto-playing, narrated walkthrough of the recorded process.
import { plainText, richText } from "../core/instructions.js";
import type { Rect, ResolvedStep } from "../core/model.js";
import { Cancelled, Clock, clamp, h, icon, type Token } from "./dom.js";
import { ICONS } from "./icons.js";
import { checkBadge, FieldText, focusRect, ListOverlay, ripple, selectOptions, Spot } from "./overlays.js";
import { speak, speechAvailable, stopSpeaking } from "./speech.js";
import { padRect, positionCard } from "./stage.js";
import type { Controller, Ctx } from "./types.js";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Base timings in ms at speed 1 (scaled by the clock). */
const T = { fade: 380, move: 950, settle: 160, click: 520, perChar: 55, maxType: 1900, listOpen: 650, listPick: 520, keycap: 750, minRead: 2300, maxRead: 7000, end: 1600, title: 1900 };

export class ShowController implements Controller {
  private i = 0;
  private playing = false;
  private finished = false;
  private clock = new Clock();
  private voice: boolean;
  private spot: Spot;
  private cursor: HTMLElement;
  private cursorAt = { x: 0, y: 0 };
  private bubble: HTMLElement;
  private dock: HTMLElement;
  private transient: { remove(): void }[] = [];
  private card?: HTMLElement;
  private btnPlay?: HTMLButtonElement;
  private btnPrev?: HTMLButtonElement;
  private btnNext?: HTMLButtonElement;
  private segs: HTMLElement[] = [];
  private vprog?: HTMLElement;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private steps: ResolvedStep[];

  constructor(private ctx: Ctx) {
    const { stage, cfg, s } = ctx;
    this.steps = ctx.proc.steps;
    this.voice = !!cfg.voice && !cfg.video && speechAvailable();
    this.clock.speed = SPEEDS.includes(cfg.speed ?? 1) ? (cfg.speed ?? 1) : 1;
    this.spot = new Spot(stage);
    this.cursor = h("div", { class: "sl-cursor", "aria-hidden": "true", html: ICONS.cursor });
    stage.layer.append(this.cursor);
    this.bubble = h("div", { class: "sl-bubble", "aria-hidden": "true" });
    stage.float.append(this.bubble);
    this.dock = h("div", { class: "sl-caption", "aria-hidden": "true" });
    ctx.body.append(this.dock);
    if (!cfg.video) ctx.body.append(this.buildControls());
    else {
      this.vprog = h("div", { class: "sl-vprog" }, h("i"));
      stage.float.append(this.vprog);
    }
    this.cursorAt = { x: stage.vw * 0.62, y: stage.vh * 0.74 };
    ctx.root.addEventListener("keydown", this.onKey);
  }

  // ------------------------------------------------------------------ controls

  private buildControls(): HTMLElement {
    const { s } = this.ctx;
    const n = this.steps.length;
    const progress = h("div", { class: "sl-progress", role: "group", "aria-label": s.stepsLabel });
    this.segs = this.steps.map((st, k) => {
      const b = h("button", { class: "sl-seg", type: "button", "aria-label": `${s.step} ${k + 1} ${s.of} ${n}: ${plainText(st.title)}`, title: plainText(st.title) }, h("i"));
      b.addEventListener("click", () => this.go(k));
      progress.append(b);
      return b;
    });
    const btn = (cls: string, label: string, ico: string, on: () => void) => {
      const b = h("button", { class: `sl-btn sl-icon-btn ${cls}`, type: "button", "aria-label": label, title: label }, icon(ico));
      b.addEventListener("click", on);
      return b;
    };
    this.btnPrev = btn("sl-prev", s.prev, ICONS.prev, () => this.go(this.i - 1));
    this.btnPlay = btn("sl-play", s.play, ICONS.play, () => this.toggle());
    this.btnPlay.classList.add("sl-btn-primary");
    this.btnNext = btn("sl-next", s.next, ICONS.next, () => this.go(this.i + 1));
    const speed = h("select", { class: "sl-speed", "aria-label": s.speed, title: s.speed });
    for (const v of SPEEDS) speed.append(h("option", { value: String(v), selected: v === this.clock.speed }, `${v}×`));
    speed.addEventListener("change", () => (this.clock.speed = Number(speed.value) || 1));
    const right = h("div", { class: "sl-ctrl-right" }, h("label", { class: "sl-speed-wrap" }, h("span", { class: "sl-speed-label" }, s.speed), speed));
    if (speechAvailable()) {
      const vb = btn("sl-voice", s.narration, this.voice ? ICONS.voiceOn : ICONS.voiceOff, () => {
        this.voice = !this.voice;
        vb.setAttribute("aria-pressed", String(this.voice));
        vb.replaceChildren(icon(this.voice ? ICONS.voiceOn : ICONS.voiceOff));
        vb.title = this.voice ? s.narrationOn : s.narrationOff;
        if (!this.voice) stopSpeaking();
      });
      vb.setAttribute("aria-pressed", String(this.voice));
      right.append(vb);
    }
    return h(
      "div",
      { class: "sl-controls" },
      progress,
      h("div", { class: "sl-ctrl-row" }, h("div", { class: "sl-ctrl-left" }, this.btnPrev, this.btnPlay, this.btnNext), right),
    );
  }

  private syncControls() {
    const { s } = this.ctx;
    if (this.btnPlay) {
      const playing = this.playing && !this.finished;
      this.btnPlay.replaceChildren(icon(playing ? ICONS.pause : ICONS.play));
      this.btnPlay.setAttribute("aria-label", playing ? s.pause : s.play);
      this.btnPlay.title = playing ? s.pause : s.play;
    }
    if (this.btnPrev) this.btnPrev.disabled = this.i <= 0;
    if (this.btnNext) this.btnNext.disabled = this.i >= this.steps.length - 1;
    this.segs.forEach((b, k) => {
      b.classList.toggle("sl-done", k < this.i || (this.finished && k === this.i));
      b.classList.toggle("sl-cur", k === this.i && !this.finished);
      if (k === this.i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
  }

  private progress(frac: number) {
    const seg = this.segs[this.i];
    if (seg) (seg.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    this.segs.forEach((b, k) => {
      if (k !== this.i) (b.firstElementChild as HTMLElement).style.width = k < this.i ? "100%" : "0%";
    });
    if (this.vprog) (this.vprog.firstElementChild as HTMLElement).style.width = `${((this.i + frac) / Math.max(1, this.steps.length)) * 100}%`;
  }

  private key(e: KeyboardEvent) {
    if (this.ctx.cfg.video) return;
    const t = e.target as HTMLElement;
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (e.key === "ArrowRight" && !inField) {
      e.preventDefault();
      this.go(this.i + 1);
    } else if (e.key === "ArrowLeft" && !inField) {
      e.preventDefault();
      this.go(this.i - 1);
    } else if ((e.key === " " || e.key === "k") && !inField && t.tagName !== "BUTTON") {
      e.preventDefault();
      this.toggle();
    } else if (e.key === "Home" && !inField) {
      e.preventDefault();
      this.go(0);
    }
  }

  // ------------------------------------------------------------------ lifecycle

  start(): void {
    const { cfg } = this.ctx;
    if (!this.steps.length) {
      this.showEnd();
      return;
    }
    if (cfg.video) {
      void this.runVideo();
      return;
    }
    if (cfg.autoplay) this.play();
    else {
      void this.renderStatic(0, true);
      this.showIntro();
    }
  }

  destroy(): void {
    this.clock.cancel();
    stopSpeaking();
    this.ctx.root.removeEventListener("keydown", this.onKey);
  }

  relayout(): void {
    const st = this.steps[this.i];
    if (st && (this.bubble.classList.contains("sl-on") || this.dock.classList.contains("sl-on"))) this.showCaption(st, true);
  }

  private toggle() {
    if (this.finished) {
      this.restart();
      return;
    }
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    this.hideCard();
    this.playing = true;
    if (this.clock.paused) {
      this.clock.resume();
      this.syncControls();
      return;
    }
    this.syncControls();
    void this.runFrom(this.i);
  }

  pause() {
    this.playing = false;
    this.clock.pause();
    stopSpeaking();
    this.syncControls();
  }

  restart() {
    this.finished = false;
    this.hideCard();
    this.clock.cancel();
    this.clock.paused = false;
    this.i = 0;
    this.playing = true;
    this.syncControls();
    void this.runFrom(0);
  }

  go(k: number) {
    if (k < 0 || k >= this.steps.length) return;
    this.hideCard();
    this.finished = false;
    this.clock.cancel();
    stopSpeaking();
    this.i = k;
    if (this.playing) {
      this.clock.paused = false;
      void this.runFrom(k);
    } else {
      this.clock.paused = false;
      void this.renderStatic(k);
    }
    this.syncControls();
  }

  private async runFrom(k: number) {
    const tok = this.clock.token();
    try {
      for (let j = k; j < this.steps.length; j++) {
        this.i = j;
        this.syncControls();
        await this.animateStep(this.steps[j], tok);
      }
      this.finish();
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  private async runVideo() {
    const tok = this.clock.token();
    const { stage, proc, s } = this.ctx;
    await stage.setStep(this.steps[0], true);
    this.cursor.classList.add("sl-hidden");
    const title = h(
      "div",
      { class: "sl-card sl-card-title" },
      proc.appName ? h("div", { class: "sl-card-kicker" }, proc.appName) : null,
      h("div", { class: "sl-card-h", html: richText(proc.title) }),
      proc.description ? h("div", { class: "sl-card-p", html: richText(proc.description) }) : null,
      h("div", { class: "sl-card-meta" }, `${this.steps.length} ${s.steps}`),
    );
    this.showCard(title);
    await tok.wait(T.title);
    this.hideCard();
    this.cursor.classList.remove("sl-hidden");
    for (let j = 0; j < this.steps.length; j++) {
      this.i = j;
      await this.animateStep(this.steps[j], tok);
    }
    this.progress(1);
    this.clearStep();
    this.showCard(h("div", { class: "sl-card sl-card-end" }, h("div", { class: "sl-card-icon", html: ICONS.check }), h("div", { class: "sl-card-h" }, s.done)));
    await tok.wait(T.end);
    this.finished = true;
    (window as unknown as { __steplightVideoDone?: boolean }).__steplightVideoDone = true;
    this.ctx.emit({ type: "complete", mode: "show" });
  }

  private finish() {
    this.finished = true;
    this.playing = false;
    this.progress(1);
    this.syncControls();
    this.showEnd();
    this.ctx.emit({ type: "complete", mode: "show" });
  }

  // ------------------------------------------------------------------ cards

  private showCard(card: HTMLElement) {
    this.hideCard();
    this.card = h("div", { class: "sl-overlay" }, card);
    this.ctx.stage.view.append(this.card);
    void this.card.offsetWidth;
    this.card.classList.add("sl-on");
  }

  private hideCard() {
    this.card?.remove();
    this.card = undefined;
  }

  private showIntro() {
    const { proc, s } = this.ctx;
    const play = h("button", { class: "sl-bigplay", type: "button", "aria-label": `${s.play}: ${plainText(proc.title)}` }, icon(ICONS.play));
    play.addEventListener("click", () => this.play());
    this.showCard(
      h(
        "div",
        { class: "sl-card sl-card-intro" },
        play,
        h("div", { class: "sl-card-h", html: richText(proc.title) }),
        h("div", { class: "sl-card-meta" }, `${s.showMe} · ${this.steps.length} ${s.steps}`),
      ),
    );
  }

  private showEnd() {
    const { s } = this.ctx;
    this.clearStep();
    this.cursor.classList.add("sl-hidden");
    const again = h("button", { class: "sl-btn sl-btn-primary", type: "button" }, icon(ICONS.restart), s.watchAgain);
    again.addEventListener("click", () => this.restart());
    this.showCard(h("div", { class: "sl-card sl-card-end" }, h("div", { class: "sl-card-icon", html: ICONS.check }), h("div", { class: "sl-card-h" }, s.done), h("div", { class: "sl-card-actions" }, again)));
    this.ctx.announce(s.done);
    again.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ step rendering

  private clearStep() {
    this.transient.forEach((t) => t.remove());
    this.transient = [];
    this.spot.hide();
    this.bubble.classList.remove("sl-on");
    this.dock.classList.remove("sl-on");
    this.ctx.stage.zoomTo(null);
  }

  private captionContent(st: ResolvedStep): HTMLElement[] {
    const { s } = this.ctx;
    const n = this.steps.length;
    return [
      h("div", { class: "sl-cap-step" }, `${s.step} ${st.index} ${s.of} ${n}`),
      h("div", { class: "sl-cap-title", html: richText(st.title) }),
      st.description ? h("div", { class: "sl-cap-desc", html: richText(st.description) }) : (null as unknown as HTMLElement),
    ].filter(Boolean);
  }

  private showCaption(st: ResolvedStep, silent = false) {
    const content = this.captionContent(st);
    if (this.ctx.compact()) {
      this.bubble.classList.remove("sl-on");
      this.dock.replaceChildren(...content);
      this.dock.classList.add("sl-on");
    } else {
      this.dock.classList.remove("sl-on");
      this.bubble.replaceChildren(...content);
      this.bubble.classList.add("sl-on");
      this.placeCaption(st);
    }
    this.ctx.setCounter(st.index - 1);
    if (!silent) this.ctx.announce(`${this.ctx.s.step} ${st.index} ${this.ctx.s.of} ${this.steps.length}: ${plainText(st.title)} ${plainText(st.description)}`.trim());
  }

  private placeCaption(st: ResolvedStep | undefined) {
    if (!st || !this.bubble.classList.contains("sl-on")) return;
    const { stage } = this.ctx;
    this.bubble.style.width = `${Math.round(clamp(stage.W * 0.4, 240, 380))}px`;
    let r = st.bbox && st.action !== "note" && st.action !== "navigate" ? padRect(st.bbox, 6) : null;
    // Keep the caption clear of the dropdown list drawn under a select.
    if (r && st.action === "select") r = { ...r, y: r.y - st.bbox!.height * 0.1, height: r.height + Math.max(st.bbox!.height * 0.92, 18) * 4 + 14 };
    const b = r ? stage.toPx(r) : null;
    if (b) positionCard(this.bubble, b, stage.W, stage.H);
    else {
      this.bubble.dataset.side = "none";
      this.bubble.style.left = `${Math.round((stage.W - this.bubble.offsetWidth) / 2)}px`;
      this.bubble.style.top = `${Math.round(stage.H - this.bubble.offsetHeight - 24)}px`;
    }
  }

  private moveCursor(x: number, y: number, ms: number) {
    this.cursor.classList.remove("sl-hidden");
    this.cursor.style.transitionDuration = `${Math.round(ms / this.clock.speed)}ms`;
    this.ctx.stage.placePoint(this.cursor, x, y);
    this.cursorAt = { x, y };
  }

  private aimPoint(st: ResolvedStep, b: Rect): { x: number; y: number } {
    if (st.action === "type") return { x: b.x + Math.min(b.width * 0.55, 220), y: b.y + b.height * 0.6 };
    if (st.action === "check") return { x: b.x + Math.min(b.width, b.height) / 2, y: b.y + b.height / 2 };
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.55 };
  }

  private readTime(st: ResolvedStep): number {
    const chars = plainText(st.title).length + plainText(st.description).length;
    return clamp(1400 + chars * 38, T.minRead, T.maxRead);
  }

  /** Paused navigation: show the step in its "about to act" state without animation. */
  private async renderStatic(k: number, initial = false) {
    const st = this.steps[k];
    const { stage } = this.ctx;
    this.i = k;
    this.clearStep();
    await stage.setStep(st, initial);
    if (this.i !== k) return;
    if (this.ctx.compact() && st.bbox) stage.zoomTo(focusRect(st)!, !initial);
    this.showCaption(st);
    if (st.bbox && st.action !== "note" && st.action !== "navigate") {
      const p = this.aimPoint(st, st.bbox);
      this.moveCursor(p.x, p.y, initial ? 0 : 400);
      this.spot.show(st.bbox, { pulse: true });
    } else this.cursor.classList.add("sl-hidden");
    this.progress(initial ? 0 : 0.5);
    this.syncControls();
  }

  private async animateStep(st: ResolvedStep, tok: Token) {
    const { stage, cfg } = this.ctx;
    this.clearStep();
    this.progress(0.05);
    await stage.setStep(st);
    tok.check();
    const b = st.bbox && st.action !== "note" && st.action !== "navigate" ? st.bbox : undefined;
    if (this.ctx.compact() && b) stage.zoomTo(focusRect(st)!);
    this.showCaption(st);
    const speech = this.voice ? speak([plainText(st.title), plainText(st.description)].filter(Boolean).join(" "), this.ctx.proc.lang, this.clock.speed) : Promise.resolve();
    let spent = T.fade;
    await tok.wait(T.fade);
    this.progress(0.2);
    if (b) {
      const p = this.aimPoint(st, b);
      this.moveCursor(p.x, p.y, T.move);
      await tok.wait(T.move + T.settle);
      spent += T.move + T.settle;
      this.spot.show(b, { pulse: true });
      this.progress(0.45);
      spent += await this.act(st, b, p, tok);
    } else {
      this.cursor.classList.add("sl-hidden");
      if (st.action === "press") spent += await this.pressKey(st, tok);
    }
    this.progress(0.75);
    const rest = Math.max(800, this.readTime(st) - spent);
    await tok.wait(rest);
    if (this.voice && !cfg.video) {
      await speech;
      tok.check();
      await tok.wait(250);
    }
    this.progress(1);
  }

  /** Perform the action visually; returns the base time spent. */
  private async act(st: ResolvedStep, b: Rect, p: { x: number; y: number }, tok: Token): Promise<number> {
    const { stage, proc, s } = this.ctx;
    this.cursor.classList.add("sl-press");
    ripple(stage, p.x, p.y);
    await tok.wait(180);
    this.cursor.classList.remove("sl-press");
    let spent = 180;
    switch (st.action) {
      case "type": {
        const f = new FieldText(stage, b, "text");
        this.transient.push(f);
        f.typing(true);
        const text = st.sensitive ? "••••••••" : (st.value ?? "");
        const per = Math.min(T.perChar, T.maxType / Math.max(1, text.length));
        for (let c = 1; c <= text.length; c++) {
          f.set(text.slice(0, c));
          await tok.wait(per);
          spent += per;
        }
        await tok.wait(200);
        f.typing(false);
        spent += 200;
        break;
      }
      case "select": {
        const opts = selectOptions(proc, st, ["—", s.optOther, s.optNone]);
        const field = new FieldText(stage, b, "select");
        const list = new ListOverlay(stage, b, opts);
        this.transient.push(field, list);
        await tok.wait(T.listOpen);
        const pick = list.items.find((x) => x.dataset.value === st.value);
        if (pick) {
          const r = pick.getBoundingClientRect();
          const q = stage.toShot(r.left + Math.min(40, r.width / 3), r.top + r.height / 2);
          this.moveCursor(q.x, q.y, T.listPick * 0.7);
        }
        list.mark(st.value ?? "");
        await tok.wait(T.listPick);
        ripple(stage, this.cursorAt.x, this.cursorAt.y);
        await tok.wait(160);
        list.remove();
        field.set(st.value ?? "");
        spent += T.listOpen + T.listPick + 160;
        break;
      }
      case "check": {
        this.transient.push(checkBadge(stage, b, st.value !== "false"));
        await tok.wait(300);
        spent += 300;
        break;
      }
      case "press": {
        spent += await this.pressKey(st, tok);
        break;
      }
      default: {
        await tok.wait(T.click - 180);
        spent += T.click - 180;
      }
    }
    return spent;
  }

  private async pressKey(st: ResolvedStep, tok: Token): Promise<number> {
    const cap = h("div", { class: "sl-keycap", "aria-hidden": "true" }, icon(ICONS.keyboard), h("kbd", null, st.value || "Enter"));
    this.ctx.stage.float.append(cap);
    this.transient.push(cap);
    await tok.wait(250);
    cap.classList.add("sl-press");
    await tok.wait(T.keycap - 250);
    return T.keycap;
  }

  /** For tests: current step index. */
  get index() {
    return this.i;
  }
  get speedValue() {
    return this.clock.speed;
  }
  set speedValue(v: number) {
    this.clock.speed = v;
  }
}
