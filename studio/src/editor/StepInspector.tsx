import { useEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes, type InputHTMLAttributes } from "react";
import { canLearnerChoose, choiceSuggestion } from "../../../src/core/choice";
import { defaultKind, draftElementOf, draftTarget, ELEMENT_KINDS, type ElementKind } from "../../../src/core/draft";
import { richText } from "../../../src/core/instructions";
import type { ActionType, Process, Rect, Step, StepLocalization } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Chip, CopyButton, Field, IconButton, Kbd, Toggle } from "../components/ui";
import { ACTION_ICON, ACTION_LABEL, cx, formatDate, langName } from "../lib/util";
import { ScreenshotStage } from "./ScreenshotStage";
import type { StepView } from "./StepList";

/** Textarea/input that keeps a local draft and commits on blur or Ctrl/Cmd+Enter; Escape reverts. */
export function DraftText({
  value,
  onCommit,
  multiline = true,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement> & InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !multiline)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      setV(value);
      setTimeout(() => (e.target as HTMLElement).blur(), 0);
    }
  };
  const common = {
    ...rest,
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: () => {
      if (v !== value) onCommit(v);
    },
    onKeyDown,
  };
  return multiline ? <textarea {...(common as TextareaHTMLAttributes<HTMLTextAreaElement>)} /> : <input {...(common as InputHTMLAttributes<HTMLInputElement>)} />;
}

const VALUE_LABEL: Partial<Record<ActionType, string>> = { type: "Text entered", select: "Option chosen", press: "Key", navigate: "URL", check: "Checked" };

export function StepInspector({
  proc,
  view,
  index,
  total,
  lang,
  isSource,
  onPatch,
  onResetTitle,
  onSaveLoc,
  onBBox,
  onPrev,
  onNext,
  onDelete,
  onTranslate,
  onRecordAgain,
  onReplaceShot,
}: {
  proc: Process;
  view: StepView;
  index: number;
  total: number;
  lang: string;
  isSource: boolean;
  onPatch: (patch: Partial<Step>, label?: string) => void;
  onResetTitle: () => void;
  onSaveLoc: (fields: Partial<StepLocalization>) => void;
  onBBox: (r: Rect, localized: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onTranslate: () => void;
  /** Make the step a draft again: finalising the guide records it again (screen and element). */
  onRecordAgain: () => void;
  /** Replace the screenshot with an image the author has (file or pasted). */
  onReplaceShot: (image: Blob) => void;
}) {
  const s = view.step;
  /** A step drafted from the guide (not one recorded before and marked to record again). */
  const fromGuide = !!s.draft && !s.draft.again;
  const fileRef = useRef<HTMLInputElement>(null);
  // a pasted image (e.g. Win+Shift+S, then Ctrl+V) replaces the screenshot of the source step
  useEffect(() => {
    if (!isSource) return;
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      onReplaceShot(img);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [isSource, onReplaceShot]);
  const loc = isSource ? undefined : proc.localizations[lang]?.steps[s.id];
  const hasLocalization = !isSource && !!proc.localizations[lang];
  const bboxIsLocalized = !isSource && !!loc?.screenshot && !!loc?.bbox;
  const t = s.target;

  return (
    <div className="inspector" data-testid="inspector">
      <div className="inspector-head">
        <div className="inspector-title">
          <span className="step-badge">Step {index + 1}</span>
          <span className="muted">of {total}</span>
          <Chip icon={ACTION_ICON[s.action]}>{ACTION_LABEL[s.action]}</Chip>
          {s.replayStatus && (
            <Chip tone={s.replayStatus === "ok" ? "success" : s.replayStatus === "healed" ? "warning" : "danger"} dot>
              Replay {s.replayStatus}
            </Chip>
          )}
          {!isSource && (view.localizedShot ? <Chip tone="teal" icon="image">Localized screenshot</Chip> : <Chip title="Run Translate with screenshot capture to get one">Source screenshot</Chip>)}
        </div>
        <div className="inspector-nav">
          <span className="muted small hide-sm">
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate
          </span>
          <IconButton icon="chevronUp" label="Previous step" onClick={onPrev} disabled={index === 0} />
          <IconButton icon="chevronDown" label="Next step" onClick={onNext} disabled={index === total - 1} />
          <IconButton icon="trash" label="Delete step" onClick={onDelete} />
        </div>
      </div>

      <div className="stage-wrap">
        <ScreenshotStage
          src={view.screenshot}
          bbox={s.action === "note" ? undefined : view.bbox}
          viewport={s.viewport}
          editable={!!view.bbox && s.action !== "note" && (isSource || bboxIsLocalized || !loc?.screenshot)}
          onChange={(r) => onBBox(r, bboxIsLocalized)}
          emptyLabel={s.draft ? "Screenshot to come: it is taken when you finalise the guide" : undefined}
        />
        {view.bbox && s.action !== "note" && (
          <div className="stage-hint muted small">
            <Icon name="pointer" size={12} /> Drag the highlight to move it, pull a handle to resize. Saved automatically
            {!isSource && !bboxIsLocalized ? " (applies to the source screenshot)" : ""}.
          </div>
        )}
        {isSource && (
          <div className="stage-hint muted small stage-tools">
            {!s.draft && (
              <Button size="sm" variant="ghost" icon="record" onClick={onRecordAgain} data-testid="record-again">
                Record again
              </Button>
            )}
            <Button size="sm" variant="ghost" icon="image" onClick={() => fileRef.current?.click()} data-testid="replace-shot">
              Replace screenshot
            </Button>
            <span>or paste an image here (Ctrl+V)</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="replace-shot-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onReplaceShot(f);
              }}
            />
          </div>
        )}
        {isSource && !view.bbox && view.screenshot && t && s.action !== "note" && (
          <div className="stage-hint muted small">
            <Button size="sm" variant="ghost" icon="target" onClick={() => onBBox(centeredBox(s.viewport), false)} data-testid="add-highlight">
              Add highlight
            </Button>
            Mark where the element is on the guide's screenshot.
          </div>
        )}
      </div>

      {isSource && s.draft && (s.draft.again ? <RecordAgain step={s} onPatch={onPatch} /> : <GuideSource step={s} onPatch={onPatch} />)}

      {!isSource && (
        <section className="insp-section">
          <div className="insp-section-head">
            <h3>
              <Icon name="languages" size={15} /> {langName(lang)} text
            </h3>
            {!hasLocalization && (
              <Button size="sm" icon="languages" onClick={onTranslate}>
                Translate process
              </Button>
            )}
          </div>
          {!hasLocalization && (
            <div className="callout callout-subtle">
              <Icon name="info" size={15} />
              <div>
                Not translated yet. The instruction below is generated from {langName(lang)} templates using the source element names. Edit it here, or run Translate to localize
                names and screenshots.
              </div>
            </div>
          )}
          <div className="source-ref">
            <span className="source-ref-label">{proc.lang.toUpperCase()} source</span>
            <span dangerouslySetInnerHTML={{ __html: richText(s.title) }} />
          </div>
          <Field
            label="Instruction"
            htmlFor="loc-title"
            aside={
              loc?.title ? (
                <button className="link-btn" onClick={() => onSaveLoc({ title: undefined, titleEdited: false })}>
                  <Icon name="reset" size={12} /> Use automatic
                </button>
              ) : (
                <span className="muted small">Automatic</span>
              )
            }
            hint="Use **double asterisks** for bold. Leave empty to use the automatic instruction."
          >
            <DraftText id="loc-title" className="input autosize" rows={2} value={loc?.title ?? ""} placeholder={view.title.replace(/\*\*/g, "")} onCommit={(v) => onSaveLoc({ title: v.trim() || undefined, titleEdited: !!v.trim() })} data-testid="loc-title" />
          </Field>
          <Field label="Description" htmlFor="loc-desc">
            <DraftText id="loc-desc" className="input autosize" rows={2} value={loc?.description ?? ""} placeholder={s.description || "Optional explanation in this language"} onCommit={(v) => onSaveLoc({ description: v.trim() || undefined })} />
          </Field>
          {(loc?.name || loc?.label || loc?.value) && (
            <dl className="kv kv-compact">
              {loc?.name && (
                <div>
                  <dt>Localized name</dt>
                  <dd>{loc.name}</dd>
                </div>
              )}
              {loc?.label && (
                <div>
                  <dt>Localized label</dt>
                  <dd>{loc.label}</dd>
                </div>
              )}
              {loc?.value && (
                <div>
                  <dt>Localized value</dt>
                  <dd>{loc.value}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
      )}

      {isSource && (
        <section className="insp-section" data-testid="action-section">
          <div className="insp-section-head">
            <h3>
              <Icon name="pointer" size={15} /> Action
            </h3>
          </div>
          <div className="form-grid-2">
            <Field label="Action type" htmlFor="st-action">
              <select id="st-action" className="input" value={s.action} onChange={(e) => onPatch({ action: e.target.value as ActionType })}>
                {(Object.keys(ACTION_LABEL) as ActionType[]).map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABEL[a]}
                  </option>
                ))}
              </select>
            </Field>
            {s.action === "check" ? (
              <Field label="State">
                <Toggle checked={s.value !== "false"} onChange={(v) => onPatch({ value: v ? "true" : "false" })} label={s.value === "false" ? "Clear the check box" : "Select the check box"} />
              </Field>
            ) : s.action !== "click" && s.action !== "note" ? (
              <Field label={VALUE_LABEL[s.action] ?? "Value"} htmlFor="st-value" hint={s.action === "select" && s.optionValue ? <>Option value <code>{s.optionValue}</code></> : undefined}>
                <DraftText id="st-value" multiline={false} className={cx("input", s.sensitive && "is-masked")} type={s.sensitive ? "password" : "text"} value={s.value ?? ""} onCommit={(v) => onPatch({ value: v })} />
              </Field>
            ) : (
              <div />
            )}
          </div>
          {(s.action === "type" || s.action === "select") && (
            <Toggle
              checked={!!s.sensitive}
              onChange={(v) => onPatch({ sensitive: v })}
              label={
                <span>
                  <strong>Sensitive value</strong>
                  <span className="muted small block">Mask the value in every guide, player and export (passwords, personal data).</span>
                </span>
              }
            />
          )}
          {canLearnerChoose(s) && <LearnerChoice step={s} onPatch={onPatch} />}
        </section>
      )}

      {isSource && (
        <section className="insp-section">
          <div className="insp-section-head">
            <h3>
              <Icon name="pencil" size={15} /> Instruction
            </h3>
            {s.action !== "note" &&
              (s.titleEdited ? (
                <Button size="sm" variant="ghost" icon="reset" onClick={onResetTitle} data-testid="reset-title">
                  Reset to automatic
                </Button>
              ) : (
                <Chip tone="brand" icon="zap">
                  Automatic
                </Chip>
              ))}
          </div>
          <Field label="Title" htmlFor="st-title" hint={<>Use <code>**double asterisks**</code> for bold. <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> saves.</>}>
            <DraftText id="st-title" className="input input-lg autosize" rows={2} value={s.title} onCommit={(v) => onPatch({ title: v })} data-testid="title-input" />
          </Field>
          <div className="title-preview" aria-label="Preview">
            <span className="muted small">Preview</span>
            <span dangerouslySetInnerHTML={{ __html: richText(s.title) }} />
          </div>
          <Field label="Description" htmlFor="st-desc" hint="Optional. Shown under the instruction in guides and players.">
            <DraftText id="st-desc" className="input autosize" rows={2} value={s.description ?? ""} placeholder="Add an explanation, a business rule or a tip…" onCommit={(v) => onPatch({ description: v })} />
          </Field>
        </section>
      )}

      {isSource && fromGuide && s.action !== "note" && s.action !== "press" && <DraftElement step={s} onPatch={onPatch} />}

      {t && !fromGuide && (
        <details className="insp-section insp-collapsible" data-testid="target-section">
          <summary className="insp-section-head">
            <h3>
              <Icon name="chevronRight" size={15} className="insp-caret" /> <Icon name="target" size={15} /> Target element
            </h3>
            <span className="muted small insp-summary-text">{t.name || t.label || `<${t.tag}>`}</span>
          </summary>
          <dl className="kv">
            <div>
              <dt>Element</dt>
              <dd>
                <code>{`<${t.tag}${t.inputType ? ` type="${t.inputType}"` : ""}>`}</code>
              </dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{t.role || <span className="muted">–</span>}</dd>
            </div>
            <div>
              <dt>Accessible name</dt>
              <dd>{t.name || <span className="muted">–</span>}</dd>
            </div>
            <div>
              <dt>Label</dt>
              <dd>{t.label || <span className="muted">–</span>}</dd>
            </div>
            {t.context && (
              <div>
                <dt>Context</dt>
                <dd>{t.context}</dd>
              </div>
            )}
            <div>
              <dt>Highlight</dt>
              <dd className="mono small">
                {t.bbox ? (
                  <>
                    {Math.round(t.bbox.x)}, {Math.round(t.bbox.y)} · {Math.round(t.bbox.width)}×{Math.round(t.bbox.height)}
                  </>
                ) : (
                  <span className="muted">–</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="selectors">
            <div className="selectors-head">
              <span>Selectors</span>
              <span className="muted small">Tried in order by Replay and Assist</span>
            </div>
            {t.selectors.length === 0 && <div className="muted small">No selectors captured.</div>}
            {t.selectors.map((sel, i) => (
              <div key={i} className="selector-row">
                <span className="sel-order">{i + 1}</span>
                <span className={cx("sel-kind", `kind-${sel.kind}`)}>{sel.kind}</span>
                <code className="sel-value" title={sel.value}>
                  {sel.value}
                </code>
                {i === 0 && <span className="sel-primary">primary</span>}
                <CopyButton text={sel.value} />
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="insp-section insp-collapsible" data-testid="page-section">
        <summary className="insp-section-head">
          <h3>
            <Icon name="chevronRight" size={15} className="insp-caret" /> <Icon name="globe" size={15} /> Page
          </h3>
          {s.pageTitle && <span className="muted small insp-summary-text">{s.pageTitle}</span>}
        </summary>
        <dl className="kv">
          <div>
            <dt>URL</dt>
            <dd className="url-cell">
              <a href={s.url} target="_blank" rel="noreferrer" className="mono small">
                {s.url || "–"}
              </a>
            </dd>
          </div>
          {s.pageTitle && (
            <div>
              <dt>Page title</dt>
              <dd>{s.pageTitle}</dd>
            </div>
          )}
          {s.viewport && (
            <div>
              <dt>Viewport</dt>
              <dd className="mono small">
                {s.viewport.width}×{s.viewport.height}
              </dd>
            </div>
          )}
          {s.capturedAt && (
            <div>
              <dt>Captured</dt>
              <dd>{formatDate(s.capturedAt)}</dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}

/** A highlight in the middle of a screenshot, for the author to move onto the element. */
function centeredBox(vp: Step["viewport"]): Rect {
  const w = vp?.width ?? 1280;
  const h = vp?.height ?? 800;
  const width = Math.round(Math.min(w, Math.max(60, w * 0.2)));
  const height = Math.round(Math.min(h, Math.max(24, h * 0.08)));
  return { x: Math.round((w - width) / 2), y: Math.round((h - height) / 2), width, height };
}

/** What the imported guide says for this step, and what the author should check. */
function GuideSource({ step: s, onPatch }: { step: Step; onPatch: (p: Partial<Step>, label?: string) => void }) {
  const d = s.draft!;
  return (
    <section className="insp-section" data-testid="guide-source">
      <div className="insp-section-head">
        <h3>
          <Icon name="fileText" size={15} /> From the guide
        </h3>
        {d.added && (
          <Chip tone="warning" title="The guide doesn't have this step: it was added because the process needs it">
            Added
          </Chip>
        )}
      </div>
      <div className="source-ref">
        <span dangerouslySetInnerHTML={{ __html: richText(d.source) }} />
      </div>
      {d.flag ? (
        <div className="callout callout-warning" data-testid="draft-flag">
          <Icon name="alert" size={15} />
          <div>{d.flag}</div>
          <Button size="sm" onClick={() => onPatch({ draft: { source: d.source, ...(d.added ? { added: true } : {}) } }, "mark as checked")} data-testid="mark-checked">
            Mark as checked
          </Button>
        </div>
      ) : (
        <div className="muted small">
          <Icon name="check" size={12} /> Nothing to check. Finalising the guide records each step in the application, with its screen and element.
        </div>
      )}
    </section>
  );
}

/** A recorded step marked to record again: finalising the guide shows it in the application. */
function RecordAgain({ step: s, onPatch }: { step: Step; onPatch: (p: Partial<Step>, label?: string) => void }) {
  return (
    <section className="insp-section" data-testid="record-again-panel">
      <div className="insp-section-head">
        <h3>
          <Icon name="record" size={15} /> To record again
        </h3>
      </div>
      <div className="muted small">Finalise the guide: Steplight shows this step in the application, and records its screen and element again. Until then, it keeps the current recording.</div>
      <div className="stage-hint">
        <Button size="sm" onClick={() => onPatch({ draft: null } as unknown as Partial<Step>, "keep the recording")} data-testid="keep-recording">
          Keep the current recording
        </Button>
      </div>
    </section>
  );
}

/** Which element a drafted step works on: its kind and the name or label the application shows. */
function DraftElement({ step: s, onPatch }: { step: Step; onPatch: (p: Partial<Step>, label?: string) => void }) {
  const el = draftElementOf(s.target) ?? { kind: defaultKind(s.action), name: "" };
  const [kind, setKind] = useState(el.kind);
  const save = (kind: ElementKind, name: string) => {
    if (!name.trim()) return;
    const patch: Partial<Step> = { target: { ...draftTarget(kind, name), bbox: s.target?.bbox } };
    // the first element set on a step: its instruction is generated from now on, and the question is answered
    if (!s.target) {
      patch.titleEdited = false;
      if (s.draft?.flag) patch.draft = { source: s.draft.source, ...(s.draft.added ? { added: true } : {}) };
    }
    onPatch(patch, "element change");
  };
  return (
    <section className="insp-section" data-testid="draft-element">
      <div className="insp-section-head">
        <h3>
          <Icon name="target" size={15} /> Element
        </h3>
        <span className="muted small">Found by name when you record or use Guide me</span>
      </div>
      <div className="form-grid-2">
        <Field label="Kind" htmlFor="el-kind">
          <select
            id="el-kind"
            className="input"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as ElementKind;
              setKind(k);
              save(k, el.name);
            }}
            data-testid="element-kind"
          >
            {ELEMENT_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name or label" htmlFor="el-name" hint="As the application shows it.">
          <DraftText id="el-name" multiline={false} className="input" value={el.name} placeholder="e.g. New" onCommit={(v) => save(kind, v)} data-testid="element-name" />
        </Field>
      </div>
    </section>
  );
}

const CHOICE_TEXT: Record<string, { accept: string; hint: string }> = {
  type: { accept: "Accept any value: the recorded one is only an example.", hint: "e.g. the first day of last month" },
  select: { accept: "Accept any option: the recorded one is only an example.", hint: "e.g. the format you need" },
  check: { accept: "The learner ticks or clears it as needed; Guide me offers Next.", hint: "e.g. tick it to include closed orders" },
  click: { accept: "Accept a click on any row: the recorded record is only an example.", hint: "e.g. your purchase requisition" },
  day: { accept: "Accept any day in the calendar: the recorded date is only an example.", hint: "e.g. the last day of the month" },
};

/** "The learner picks this" toggle, what to enter, and a suggestion for steps that look like one. */
function LearnerChoice({ step: s, onPatch }: { step: Step; onPatch: (p: Partial<Step>) => void }) {
  const kind = s.action === "click" && s.target?.row?.calendar ? "day" : s.action;
  const text = CHOICE_TEXT[kind] ?? CHOICE_TEXT.type;
  const column = s.action === "click" && !s.target?.row?.calendar ? s.target?.row?.column : undefined;
  const suggestion = choiceSuggestion(s);
  return (
    <div className="learner-choice" data-testid="learner-choice">
      <Toggle
        checked={!!s.learnerChooses}
        onChange={(v) => onPatch({ learnerChooses: v })}
        label={
          <span>
            <strong>The learner picks this</strong>
            <span className="muted small block">{column ? text.accept.replace("any row", `any row of the ${column} column`) : text.accept}</span>
          </span>
        }
      />
      {s.learnerChooses && (
        <Field label="What to enter" htmlFor="st-choice-hint" hint="Optional. Shown in the instruction instead of the recorded example.">
          <DraftText id="st-choice-hint" multiline={false} className="input" value={s.choiceHint ?? ""} placeholder={text.hint} onCommit={(v) => onPatch({ choiceHint: v.trim() || undefined })} />
        </Field>
      )}
      {suggestion && (
        <div className="choice-suggestion" data-testid="choice-suggestion">
          <span>
            <strong>Suggestion:</strong> {suggestion.toLowerCase()} usually differs for each learner.
          </span>
          <Button size="sm" onClick={() => onPatch({ learnerChooses: true })}>
            Learner picks this
          </Button>
        </div>
      )}
    </div>
  );
}
