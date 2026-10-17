// Try Me (guided practice) and Test Me (scored assessment) on top of the screenshots.
import { plainText, richText } from "../core/instructions.js";
import type { Rect, ResolvedStep } from "../core/model.js";
import { h, icon } from "./dom.js";
import { ICONS } from "./icons.js";
import { checkBadge, FieldText, isScorable, ListOverlay, norm, ripple, selectOptions, sizeToField, Spot } from "./overlays.js";
import { scorm } from "./scorm.js";
import { padRect } from "./stage.js";
import { fill } from "./strings.js";
import type { Controller, Ctx } from "./types.js";

interface Rec {
  step: ResolvedStep;
  scored: boolean;
  correct: boolean;
  answer?: string;
}

type Removable = { remove(): void };

export class PracticeController implements Controller {
  private test: boolean;
  private i = -1;
  private misses = 0;
  private mistakes = 0;
  private locked = true;
  private recorded = false;
  private records: Rec[] = [];
  private gen = 0;
  private spot: Spot;
  private transient: Removable[] = [];
  private input?: HTMLInputElement;
  private list?: ListOverlay;
  private combo?: HTMLButtonElement;
  private card?: HTMLElement;
  private result?: HTMLElement;
  private steps: ResolvedStep[];
  // task panel
  private task: HTMLElement;
  private tNum: HTMLElement;
  private tMeta: HTMLElement;
  private tTitle: HTMLElement;
  private tDesc: HTMLElement;
  private tFeedback: HTMLElement;
  private tActions: HTMLElement;
  private tBar: HTMLElement;
  private hintBtn?: HTMLButtonElement;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private onStageClick = (e: MouseEvent) => this.stageClick(e);

  constructor(private ctx: Ctx, mode: "try" | "test") {
    this.test = mode === "test";
    this.steps = ctx.proc.steps;
    const { s, stage } = ctx;
    this.spot = new Spot(stage);
    this.tNum = h("div", { class: "sl-task-num", "aria-hidden": "true" });
    this.tMeta = h("div", { class: "sl-task-meta" });
    this.tTitle = h("div", { class: "sl-task-title", tabindex: "-1" });
    this.tDesc = h("div", { class: "sl-task-desc" });
    this.tFeedback = h("div", { class: "sl-feedback", "aria-live": "off" });
    this.tActions = h("div", { class: "sl-task-actions" });
    this.tBar = h("div", { class: "sl-task-bar", "aria-hidden": "true" }, h("i"));
    const head = h("div", { class: "sl-task-head" }, this.tMeta);
    if (!this.test) {
      this.hintBtn = h("button", { class: "sl-btn sl-btn-ghost sl-hint-btn", type: "button" }, icon(ICONS.eye), s.hint);
      this.hintBtn.addEventListener("click", () => this.hint());
      head.append(this.hintBtn);
    }
    this.task = h(
      "div",
      { class: "sl-task" },
      h("div", { class: "sl-task-row" }, this.tNum, h("div", { class: "sl-task-main" }, head, this.tTitle, this.tDesc, this.tFeedback, this.tActions)),
      this.tBar,
    );
    ctx.body.insertBefore(this.task, stage.el);
    stage.view.addEventListener("click", this.onStageClick);
    ctx.root.addEventListener("keydown", this.onKey);
  }

  // ------------------------------------------------------------------ lifecycle

  start(): void {
    const first = this.steps[0];
    void this.ctx.stage.setStep(first, true);
    if (!this.steps.length) {
      this.finish();
      return;
    }
    this.renderTaskIntro();
    if (this.ctx.cfg.autoplay) void this.begin(0);
    else this.showIntro();
  }

  destroy(): void {
    this.gen++;
    this.ctx.stage.view.removeEventListener("click", this.onStageClick);
    this.ctx.root.removeEventListener("keydown", this.onKey);
  }

  relayout(): void {
    /* overlays are positioned in %, nothing to do */
  }

  private restart() {
    this.gen++;
    this.result?.remove();
    this.result = undefined;
    this.task.hidden = false;
    this.ctx.stage.el.hidden = false;
    this.records = [];
    this.mistakes = 0;
    this.ctx.stage.layout();
    void this.begin(0);
  }

  private renderTaskIntro() {
    const { s, proc } = this.ctx;
    this.tNum.replaceChildren(icon(this.test ? ICONS.award : ICONS.hand));
    this.tMeta.textContent = this.test ? s.testMe : s.tryMe;
    this.tTitle.innerHTML = richText(proc.title);
    this.tDesc.innerHTML = richText(proc.description);
    this.tDesc.hidden = !proc.description;
    if (this.hintBtn) this.hintBtn.hidden = true;
  }

  private showIntro() {
    const { s, proc } = this.ctx;
    const startBtn = h("button", { class: "sl-btn sl-btn-primary sl-btn-lg", type: "button" }, s.start, icon(ICONS.next));
    startBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.begin(0);
    });
    const meta = [`${this.steps.length} ${s.steps}`];
    if (this.test) meta.push(`${s.passMark} ${proc.passMark}%`);
    this.card = h(
      "div",
      { class: "sl-overlay sl-on" },
      h(
        "div",
        { class: "sl-card sl-card-intro" },
        h("div", { class: "sl-card-icon sl-card-icon-soft", html: this.test ? ICONS.award : ICONS.hand }),
        h("div", { class: "sl-card-h", html: richText(proc.title) }),
        h("div", { class: "sl-card-p" }, this.test ? fill(s.introTest, { p: proc.passMark }) : s.introTry),
        h("div", { class: "sl-card-meta" }, meta.join(" · ")),
        h("div", { class: "sl-card-actions" }, startBtn),
      ),
    );
    this.ctx.stage.view.append(this.card);
  }

  // ------------------------------------------------------------------ steps

  private clearStep() {
    this.transient.forEach((t) => t.remove());
    this.transient = [];
    this.input = undefined;
    this.list = undefined;
    this.combo = undefined;
    this.spot.hide();
    this.tActions.replaceChildren();
    this.feedback("");
  }

  private async begin(k: number) {
    const g = ++this.gen;
    const { stage, s } = this.ctx;
    this.card?.remove();
    this.card = undefined;
    this.i = k;
    this.misses = 0;
    this.recorded = false;
    this.locked = true;
    this.clearStep();
    const st = this.steps[k];
    await stage.setStep(st);
    if (g !== this.gen) return;
    const n = this.steps.length;
    this.ctx.setCounter(k);
    this.tNum.textContent = String(st.index);
    this.tMeta.textContent = `${s.step} ${st.index} ${s.of} ${n}`;
    this.tTitle.innerHTML = richText(st.title);
    this.tDesc.innerHTML = richText(st.description);
    this.tDesc.hidden = !st.description;
    (this.tBar.firstElementChild as HTMLElement).style.width = `${(k / n) * 100}%`;
    const b = st.bbox;
    if (this.hintBtn) this.hintBtn.hidden = !b || !isScorable(st);
    stage.zoomTo(!this.test && this.ctx.compact() && b && isScorable(st) ? b : null);
    this.locked = false;
    if (st.action === "press") this.setupPress(st);
    else if (!b || !isScorable(st)) this.setupContinue(st);
    else if (st.action === "type") this.setupType(st, b);
    else if (st.action === "select" && st.value) this.setupSelect(st, b);
    else this.setupClick(st, b);
    this.ctx.announce(`${s.step} ${st.index} ${s.of} ${n}: ${plainText(st.title)} ${plainText(st.description)}`.trim());
    const focusInside = this.ctx.root.contains(document.activeElement) && document.activeElement !== this.ctx.root;
    if (!(this.input && !this.test && !this.ctx.compact()) && focusInside) this.tTitle.focus({ preventScroll: true });
  }

  private setupContinue(st: ResolvedStep) {
    const b = h("button", { class: "sl-btn sl-btn-primary", type: "button" }, this.ctx.s.continue, icon(ICONS.next));
    b.addEventListener("click", () => {
      if (this.locked) return;
      this.locked = true;
      this.record(st, false, true);
      this.advance();
    });
    this.tActions.append(b);
  }

  private setupPress(st: ResolvedStep) {
    const key = st.value || "Enter";
    const b = h("button", { class: "sl-btn sl-keybtn", type: "button" }, icon(ICONS.keyboard), fill(this.ctx.s.pressKey, { k: "" }).trim(), h("kbd", null, key));
    b.addEventListener("click", () => this.success(st));
    this.tActions.append(b);
  }

  private setupClick(st: ResolvedStep, b: Rect) {
    const hot = h("button", { class: "sl-hotspot", type: "button", "aria-label": plainText(st.title) });
    this.ctx.stage.place(hot, padRect(b, 2));
    hot.addEventListener("click", (e) => {
      e.stopPropagation();
      this.success(st);
    });
    this.ctx.stage.layer.append(hot);
    this.transient.push(hot);
  }

  private setupType(st: ResolvedStep, b: Rect) {
    const { s, stage } = this.ctx;
    const input = h("input", {
      class: "sl-input",
      type: st.sensitive ? "password" : "text",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": plainText(st.title),
      placeholder: this.test ? undefined : s.typeHere,
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submitValue(st, input.value);
      }
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    this.input = input;
    if (this.ctx.compact()) {
      // Docked answer field: comfortable on phones; the screenshot shows a mirror of the text.
      const mirror = new FieldText(stage, b, "text");
      this.transient.push(mirror);
      input.addEventListener("input", () => mirror.set(st.sensitive ? "•".repeat(input.value.length) : input.value));
      input.classList.add("sl-input-docked");
      const go = h("button", { class: "sl-btn sl-btn-primary sl-icon-btn", type: "button", "aria-label": "Enter" }, icon(ICONS.next));
      go.addEventListener("click", () => this.submitValue(st, input.value));
      this.tActions.append(h("div", { class: "sl-answer" }, input, go));
      this.transient.push({ remove: () => void 0 });
    } else {
      stage.place(input, b);
      sizeToField(input, b);
      if (!this.test) input.classList.add("sl-input-shown");
      stage.layer.append(input);
      this.transient.push(input);
      if (!this.test) window.setTimeout(() => this.input === input && input.focus({ preventScroll: true }), 60);
    }
  }

  private setupSelect(st: ResolvedStep, b: Rect) {
    const { s, stage, proc } = this.ctx;
    const opts = selectOptions(proc, st, ["—", s.optOther, s.optNone]);
    if (this.ctx.compact()) {
      const group = h("div", { class: "sl-choices", role: "group", "aria-label": plainText(st.title) });
      for (const o of opts) {
        const c = h("button", { class: "sl-choice", type: "button", "data-value": o }, o);
        c.addEventListener("click", () => this.choose(st, b, o));
        group.append(c);
      }
      this.tActions.append(group);
      return;
    }
    const listId = `sl-list-${st.id}`;
    const combo = h("button", {
      class: `sl-combo${this.test ? "" : " sl-combo-shown"}`,
      type: "button",
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": listId,
      "aria-label": plainText(st.title),
    }, h("span", null, this.test ? "" : s.chooseOption), icon(ICONS.chevronDown));
    stage.place(combo, b);
    sizeToField(combo, b);
    combo.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleList(st, b, opts, listId);
    });
    combo.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && !this.list) {
        e.preventDefault();
        this.toggleList(st, b, opts, listId);
      }
    });
    stage.layer.append(combo);
    this.combo = combo;
    this.transient.push(combo);
  }

  private toggleList(st: ResolvedStep, b: Rect, opts: string[], id: string) {
    if (this.locked) return;
    if (this.list) {
      this.closeList();
      return;
    }
    const list = new ListOverlay(this.ctx.stage, b, opts, { interactive: true, label: plainText(st.title), id, onPick: (v) => this.choose(st, b, v) });
    list.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeList();
        this.combo?.focus();
      }
    });
    this.list = list;
    this.transient.push(list);
    this.combo?.setAttribute("aria-expanded", "true");
    this.combo?.classList.add("sl-open");
    list.focusItem(list.items[0]);
  }

  private closeList() {
    this.list?.remove();
    this.list = undefined;
    this.combo?.setAttribute("aria-expanded", "false");
    this.combo?.classList.remove("sl-open");
  }

  // ------------------------------------------------------------------ answers

  private stageClick(e: MouseEvent) {
    const st = this.steps[this.i];
    if (this.locked || !st || this.card || this.result) return;
    const t = e.target as HTMLElement;
    if (t.closest(".sl-hotspot, .sl-input, .sl-combo, .sl-list, .sl-overlay")) return;
    const { stage } = this.ctx;
    const p = stage.toShot(e.clientX, e.clientY);
    const b = st.bbox;
    if (b) {
      const tol = Math.max(6, 10 / (stage.scale * stage.z));
      const r = padRect(b, tol);
      if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height) {
        if (st.action === "type") this.input?.focus({ preventScroll: true });
        else if (st.action === "select" && st.value) {
          if (this.combo) this.combo.click();
        } else if (isScorable(st)) this.success(st);
        return;
      }
    }
    if (!isScorable(st)) return;
    if (this.list) this.closeList();
    this.miss(st, "click", undefined, p);
  }

  private key(e: KeyboardEvent) {
    const st = this.steps[this.i];
    if (!st || this.locked || st.action !== "press" || this.card) return;
    const want = (st.value || "Enter").toLowerCase();
    if (e.key.toLowerCase() === want) {
      e.preventDefault();
      this.success(st);
    }
  }

  private submitValue(st: ResolvedStep, value: string) {
    if (this.locked) return;
    if (!value.trim()) {
      this.feedback(this.ctx.s.typeHere, "info");
      return;
    }
    const ok = st.sensitive || !st.value ? true : norm(value) === norm(st.value);
    if (ok) this.success(st, value);
    else this.miss(st, "value", value);
  }

  private choose(st: ResolvedStep, b: Rect, v: string) {
    if (this.locked) return;
    this.closeList();
    if (norm(v) === norm(st.value)) {
      this.showFieldValue(b, v);
      this.success(st, v);
    } else this.miss(st, "value", v);
  }

  private showFieldValue(b: Rect, v: string) {
    const f = new FieldText(this.ctx.stage, b, "select");
    f.set(v);
    this.transient.push(f);
    if (this.combo) this.combo.style.visibility = "hidden";
  }

  private record(st: ResolvedStep, scored: boolean, correct: boolean, answer?: string) {
    if (this.recorded) return;
    this.recorded = true;
    this.records.push({ step: st, scored, correct, answer });
  }

  private feedback(msg: string, tone: "ok" | "bad" | "info" | "" = "") {
    this.tFeedback.textContent = msg;
    this.tFeedback.dataset.tone = tone;
    this.tFeedback.classList.toggle("sl-on", !!msg);
    if (msg) this.ctx.announce(msg);
  }

  private hint() {
    const st = this.steps[this.i];
    if (!st?.bbox || this.locked) return;
    this.spot.show(st.bbox, { pulse: true });
    this.ctx.stage.zoomTo(this.ctx.compact() ? st.bbox : null);
    if (st.action === "type" && st.value && !st.sensitive) this.feedback(fill(this.ctx.s.expected, { v: st.value }), "info");
    else if (st.action === "select" && st.value) this.feedback(fill(this.ctx.s.expectedOption, { v: st.value }), "info");
  }

  private shake() {
    const f = this.ctx.stage.frame;
    f.classList.remove("sl-shake");
    void f.offsetWidth;
    f.classList.add("sl-shake");
  }

  private miss(st: ResolvedStep, kind: "click" | "value", answer?: string, p?: { x: number; y: number }) {
    const { s, stage } = this.ctx;
    if (p) ripple(stage, p.x, p.y, "bad");
    this.shake();
    if (this.test) {
      this.locked = true;
      this.record(st, true, false, answer);
      this.feedback(s.answerShown, "bad");
      this.reveal(st);
      const g = this.gen;
      window.setTimeout(() => g === this.gen && this.advance(), 1700);
      return;
    }
    this.misses++;
    this.mistakes++;
    let msg = kind === "click" ? s.wrongClick : s.wrongValue;
    if (this.misses >= 2 && st.bbox) {
      this.spot.show(st.bbox, { pulse: true });
      if (st.action === "type" && st.value && !st.sensitive) msg = fill(s.expected, { v: st.value });
      if (st.action === "select" && st.value) msg = fill(s.expectedOption, { v: st.value });
    }
    this.feedback(msg, "bad");
    if (kind === "value" && this.input) {
      this.input.select();
    }
  }

  private reveal(st: ResolvedStep) {
    const b = st.bbox;
    if (!b) return;
    this.spot.show(b, { tone: "reveal", pulse: false });
    if (st.action === "type" && this.input) {
      this.input.value = st.sensitive ? "" : (st.value ?? "");
      this.input.readOnly = true;
      this.input.classList.add("sl-input-shown");
      const mirror = new FieldText(this.ctx.stage, b, "text");
      mirror.set(st.sensitive ? "••••••••" : (st.value ?? ""));
      this.transient.push(mirror);
    } else if (st.action === "select") {
      this.closeList();
      this.showFieldValue(b, st.value ?? "");
    } else if (st.action === "check") this.transient.push(checkBadge(this.ctx.stage, b, st.value !== "false"));
  }

  private success(st: ResolvedStep, answer?: string) {
    if (this.locked) return;
    this.locked = true;
    const { s, stage } = this.ctx;
    this.record(st, isScorable(st), this.test ? true : this.misses === 0, answer);
    const b = st.bbox;
    if (b) {
      ripple(stage, b.x + b.width / 2, b.y + b.height / 2, "ok");
      this.spot.show(b, { tone: "ok", pulse: false });
      if (st.action === "check") this.transient.push(checkBadge(stage, b, st.value !== "false"));
      if (st.action === "type" && this.input) {
        this.input.readOnly = true;
        this.input.classList.add("sl-input-shown", "sl-input-ok");
        this.input.blur();
      }
    }
    this.feedback(s.wellDone, "ok");
    const g = this.gen;
    window.setTimeout(() => g === this.gen && this.advance(), this.test ? 420 : 560);
  }

  private advance() {
    if (this.i + 1 < this.steps.length) void this.begin(this.i + 1);
    else this.finish();
  }

  // ------------------------------------------------------------------ results

  private finish() {
    this.gen++;
    this.locked = true;
    this.clearStep();
    const { ctx } = this;
    const { s, proc } = ctx;
    (this.tBar.firstElementChild as HTMLElement).style.width = "100%";
    this.task.hidden = true;
    ctx.stage.el.hidden = true;
    ctx.setCounter(-1);
    const again = h("button", { class: "sl-btn sl-btn-primary", type: "button" }, icon(ICONS.restart), this.test ? s.tryAgain : s.restart);
    again.addEventListener("click", () => this.restart());
    if (!this.test) {
      this.result = h(
        "div",
        { class: "sl-result sl-result-try", role: "region", "aria-label": s.done },
        h("div", { class: "sl-result-badge sl-ok", html: ICONS.check }),
        h("h2", { class: "sl-result-h" }, s.done),
        h("div", { class: "sl-result-sub", html: richText(proc.title) }),
        h(
          "div",
          { class: "sl-stats" },
          h("div", { class: "sl-stat" }, h("b", null, String(this.steps.length)), h("span", null, s.stepsLabel)),
          h("div", { class: "sl-stat" }, h("b", null, String(this.mistakes)), h("span", null, s.mistakes)),
        ),
        h("div", { class: "sl-result-actions" }, again),
      );
      ctx.body.append(this.result);
      ctx.announce(s.done);
      again.focus({ preventScroll: true });
      if (ctx.cfg.scorm) scorm.reportCompleted();
      ctx.emit({ type: "complete", mode: "try" });
      return;
    }
    const scored = this.records.filter((r) => r.scored);
    const correct = scored.filter((r) => r.correct).length;
    const score = scored.length ? Math.round((correct / scored.length) * 100) : 100;
    const passed = score >= proc.passMark;
    const R = 52;
    const C = 2 * Math.PI * R;
    const ring = h("div", {
      class: `sl-ring ${passed ? "sl-ok" : "sl-bad"}`,
      html: `<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="sl-ring-bg"/><circle cx="60" cy="60" r="${R}" class="sl-ring-fg" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" style="--sl-off:${(C * (1 - score / 100)).toFixed(2)}"/></svg>`,
    });
    ring.append(h("div", { class: "sl-ring-val" }, h("b", null, `${score}%`), h("span", null, s.score)));
    const review = h("ol", { class: "sl-review", "aria-label": s.review });
    for (const r of this.records) {
      if (!r.scored) continue;
      review.append(
        h(
          "li",
          { class: r.correct ? "sl-ok" : "sl-bad" },
          h("span", { class: "sl-review-ico", html: r.correct ? ICONS.check : ICONS.x }),
          h("span", { class: "sl-review-n" }, String(r.step.index)),
          h("span", { class: "sl-review-t", html: richText(r.step.title) }),
          h("span", { class: "sl-sr" }, r.correct ? s.correct : s.incorrect),
        ),
      );
    }
    this.result = h(
      "div",
      { class: `sl-result sl-result-test ${passed ? "sl-passed" : "sl-failed"}`, role: "region", "aria-label": s.score },
      h(
        "div",
        { class: "sl-result-top" },
        ring,
        h(
          "div",
          { class: "sl-result-info" },
          h("span", { class: `sl-pill ${passed ? "sl-ok" : "sl-bad"}` }, passed ? s.passed : s.failed),
          h("h2", { class: "sl-result-h", html: richText(proc.title) }),
          h("div", { class: "sl-result-sub" }, `${fill(s.correctSteps, { c: correct, t: scored.length })} · ${s.passMark} ${proc.passMark}%`),
          h("div", { class: "sl-result-actions" }, again),
        ),
      ),
      h("h3", { class: "sl-review-h" }, s.review),
      review,
    );
    ctx.body.append(this.result);
    requestAnimationFrame(() => requestAnimationFrame(() => this.result?.classList.add("sl-on")));
    ctx.announce(`${s.score}: ${score}%. ${passed ? s.passed : s.failed}.`);
    again.focus({ preventScroll: true });
    if (ctx.cfg.scorm) scorm.reportScore(score, passed);
    ctx.emit({ type: "complete", mode: "test", score, passed });
  }
}
