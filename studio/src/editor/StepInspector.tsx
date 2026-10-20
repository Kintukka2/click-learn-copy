import { useEffect, useState, type KeyboardEvent, type TextareaHTMLAttributes, type InputHTMLAttributes } from "react";
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
}: {
  proc: Process;
  view: StepView;
  index: number;
  total: number;
  lang: string;
  isSource: boolean;
  onPatch: (patch: Partial<Step>) => void;
  onResetTitle: () => void;
  onSaveLoc: (fields: Partial<StepLocalization>) => void;
  onBBox: (r: Rect, localized: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onTranslate: () => void;
}) {
  const s = view.step;
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
        />
        {view.bbox && s.action !== "note" && (
          <div className="stage-hint muted small">
            <Icon name="pointer" size={12} /> Drag the highlight to move it, pull a handle to resize. Saved automatically
            {!isSource && !bboxIsLocalized ? " (applies to the source screenshot)" : ""}.
          </div>
        )}
      </div>

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

      {isSource && s.action !== "note" && (
        <section className="insp-section">
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
            ) : s.action !== "click" ? (
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
          {((s.action === "type" && !s.sensitive) || (s.action === "click" && s.target?.row)) && (
            <Toggle
              checked={!!s.learnerChooses}
              onChange={(v) => onPatch({ learnerChooses: v })}
              label={
                <span>
                  <strong>The learner picks this</strong>
                  <span className="muted small block">
                    {s.action === "type"
                      ? "Accept any value: the recorded one is only an example."
                      : `Accept a click on any row${s.target?.row?.column ? ` of the ${s.target.row.column} column` : ""}: the recorded record is only an example.`}
                  </span>
                </span>
              }
            />
          )}
        </section>
      )}

      {t && (
        <section className="insp-section">
          <div className="insp-section-head">
            <h3>
              <Icon name="target" size={15} /> Target element
            </h3>
          </div>
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
                {Math.round(t.bbox.x)}, {Math.round(t.bbox.y)} · {Math.round(t.bbox.width)}×{Math.round(t.bbox.height)}
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
        </section>
      )}

      <section className="insp-section">
        <div className="insp-section-head">
          <h3>
            <Icon name="globe" size={15} /> Page
          </h3>
        </div>
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
      </section>
    </div>
  );
}
