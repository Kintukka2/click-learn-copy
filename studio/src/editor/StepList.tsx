import { useEffect, useRef, useState } from "react";
import { canLearnerChoose, choiceSuggestion } from "../../../src/core/choice";
import { richText } from "../../../src/core/instructions";
import type { Rect, Step } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, EmptyState, IconButton, Menu } from "../components/ui";
import { ACTION_ICON, ACTION_LABEL, cx } from "../lib/util";

export interface StepView {
  step: Step;
  title: string;
  screenshot?: string;
  bbox?: Rect;
  localizedShot: boolean;
  localizedTitle: boolean;
}

export function StepList({
  items,
  selectedId,
  onSelect,
  onMove,
  onDelete,
  onInsertNote,
  onRecord,
  readOnlyOrder,
  picking,
  onTogglePick,
}: {
  items: StepView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  onInsertNote: (afterId?: string) => void;
  onRecord: () => void;
  readOnlyOrder?: boolean;
  /** "Learner picks…" mode: the steps ticked so far (only steps that can be the learner's choice). */
  picking?: Set<string>;
  onTogglePick?: (id: string) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<{ i: number; after: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-step-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (items.length === 0)
    return (
      <div className="step-list-empty">
        <EmptyState
          compact
          icon="record"
          title="No steps yet"
          actions={
            <>
              <Button variant="primary" icon="record" onClick={onRecord}>
                Record
              </Button>
              <Button icon="noteAdd" onClick={() => onInsertNote()}>
                Add note
              </Button>
            </>
          }
        >
          Record the process with the extension or a demo scenario.
        </EmptyState>
      </div>
    );

  return (
    <div className="step-list" ref={listRef} role="listbox" aria-label="Steps" data-testid="step-list">
      {items.map((v, i) => {
        const s = v.step;
        const vw = s.viewport?.width ?? 1280;
        const vh = s.viewport?.height ?? 800;
        const selected = s.id === selectedId;
        return (
          <div key={s.id} className="step-slot">
            {over && over.i === i && !over.after && drag !== null && <div className="drop-line" />}
            <div
              data-step-id={s.id}
              role="option"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={cx("step-item", selected && "is-selected", drag === i && "is-dragging", s.action === "note" && "is-note")}
              onClick={() => (picking && canLearnerChoose(s) ? onTogglePick?.(s.id) : onSelect(s.id))}
              onFocus={() => !selected && onSelect(s.id)}
              draggable={!readOnlyOrder}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.id);
                setDrag(i);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setOver({ i, after: e.clientY > r.top + r.height / 2 });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag === null || !over) return;
                let to = over.after ? over.i + 1 : over.i;
                if (drag < to) to -= 1;
                if (to !== drag) onMove(drag, to);
                setDrag(null);
                setOver(null);
              }}
              data-testid="step-item"
            >
              {picking && (
                <input
                  type="checkbox"
                  className="step-pick"
                  aria-label={`Learner picks step ${i + 1}`}
                  checked={picking.has(s.id)}
                  disabled={!canLearnerChoose(s)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onTogglePick?.(s.id)}
                  data-testid="step-pick"
                />
              )}
              <div className="step-num">{i + 1}</div>
              <div className="step-thumb">
                {v.screenshot ? (
                  <>
                    <img src={v.screenshot} alt="" loading="lazy" draggable={false} />
                    {v.bbox && s.action !== "note" && (
                      <span
                        className="thumb-hl"
                        style={{ left: `${(v.bbox.x / vw) * 100}%`, top: `${(v.bbox.y / vh) * 100}%`, width: `${(v.bbox.width / vw) * 100}%`, height: `${(v.bbox.height / vh) * 100}%` }}
                      />
                    )}
                  </>
                ) : (
                  <Icon name={s.action === "note" ? "note" : "image"} size={16} />
                )}
              </div>
              <div className="step-text">
                <div className="step-title" dangerouslySetInnerHTML={{ __html: richText(v.title) }} />
                <div className="step-meta">
                  <span className="step-action">
                    <Icon name={ACTION_ICON[s.action]} size={12} />
                    {ACTION_LABEL[s.action]}
                  </span>
                  {s.sensitive && (
                    <span className="step-flag" title="Value is masked in all outputs">
                      <Icon name="lock" size={11} />
                    </span>
                  )}
                  {s.learnerChooses ? (
                    <span className="step-flag violet" title="The learner picks their own value or record">
                      <Icon name="users" size={11} />
                    </span>
                  ) : (
                    choiceSuggestion(s) && (
                      <span className="step-flag suggest" title={`Suggestion: ${choiceSuggestion(s)!.toLowerCase()} usually differs for each learner`} data-testid="step-suggest">
                        <Icon name="users" size={11} />?
                      </span>
                    )
                  )}
                  {s.draft?.flag ? (
                    <span className="step-flag amber" title={s.draft.flag} data-testid="step-check">
                      <Icon name="alert" size={11} /> check
                    </span>
                  ) : (
                    s.draft && <span className="step-flag" title="From the imported guide, not recorded in the application yet">draft</span>
                  )}
                  {s.draft?.added && (
                    <span className="step-flag amber" title="Not in the guide: added because the process needs it">
                      added
                    </span>
                  )}
                  {s.titleEdited && s.action !== "note" && !s.draft && <span className="step-flag">edited</span>}
                  {v.localizedShot && <span className="step-flag teal">localized</span>}
                </div>
              </div>
              {s.replayStatus && <span className={cx("status-dot", `is-${s.replayStatus}`)} title={`Last replay: ${s.replayStatus}`} />}
              <div className="step-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton icon="arrowUp" label="Move up" size={14} disabled={i === 0 || readOnlyOrder} onClick={() => onMove(i, i - 1)} tabIndex={-1} />
                <IconButton icon="arrowDown" label="Move down" size={14} disabled={i === items.length - 1 || readOnlyOrder} onClick={() => onMove(i, i + 1)} tabIndex={-1} />
                <Menu
                  align="right"
                  width={200}
                  trigger={({ toggle, ref }) => (
                    <button ref={ref} className="icon-btn" aria-label="Step actions" onClick={toggle} tabIndex={-1}>
                      <Icon name="more" size={14} />
                    </button>
                  )}
                  items={[
                    { id: "note", label: "Insert note after", icon: "noteAdd", onSelect: () => onInsertNote(s.id) },
                    { id: "del", label: "Delete step", icon: "trash", danger: true, divider: true, onSelect: () => onDelete(s.id) },
                  ]}
                />
              </div>
            </div>
            {over && over.i === i && over.after && drag !== null && <div className="drop-line" />}
          </div>
        );
      })}
      <button className="add-step" onClick={() => onInsertNote(items[items.length - 1]?.step.id)} data-testid="add-note">
        <Icon name="plus" size={14} /> Add note step
      </button>
    </div>
  );
}
