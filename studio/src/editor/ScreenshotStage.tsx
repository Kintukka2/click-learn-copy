// Screenshot with an editable highlight box. bbox is in screenshot (viewport) pixels.
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import type { Rect } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { cx } from "../lib/util";

type Mode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Mode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function ScreenshotStage({
  src,
  bbox,
  viewport,
  editable,
  onChange,
  emptyLabel = "No screenshot for this step",
}: {
  src?: string;
  bbox?: Rect;
  viewport?: { width: number; height: number };
  editable: boolean;
  onChange?: (r: Rect) => void;
  emptyLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [loaded, setLoaded] = useState(false);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Rect; scale: number; moved: boolean } | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [bbox?.x, bbox?.y, bbox?.width, bbox?.height, src]);
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const vw = viewport?.width ?? natural?.w ?? 1280;
  const vh = viewport?.height ?? natural?.h ?? 800;
  const box = draft ?? bbox;

  const begin = (mode: Mode) => (e: RPointerEvent) => {
    if (!editable || !box || !ref.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...box }, scale: vw / ref.current.clientWidth, moved: false };
  };
  const moveTo = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) * d.scale;
    const dy = (e.clientY - d.sy) * d.scale;
    if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
    let { x, y, width, height } = d.start;
    const m = d.mode;
    if (m === "move") {
      x += dx;
      y += dy;
    } else {
      if (m.includes("w")) {
        x += dx;
        width -= dx;
      }
      if (m.includes("e")) width += dx;
      if (m.includes("n")) {
        y += dy;
        height -= dy;
      }
      if (m.includes("s")) height += dy;
    }
    const MIN = 8;
    if (width < MIN) {
      if (m.includes("w")) x -= MIN - width;
      width = MIN;
    }
    if (height < MIN) {
      if (m.includes("n")) y -= MIN - height;
      height = MIN;
    }
    x = Math.max(0, Math.min(x, vw - width));
    y = Math.max(0, Math.min(y, vh - height));
    width = Math.min(width, vw - x);
    height = Math.min(height, vh - y);
    setDraft({ x, y, width, height });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved || !draft) return;
    const r = { x: Math.round(draft.x), y: Math.round(draft.y), width: Math.round(draft.width), height: Math.round(draft.height) };
    setDraft(r);
    onChange?.(r);
  };
  const nudge = (e: RKeyboardEvent) => {
    if (!editable || !box) return;
    const k = e.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 10 : 1;
    const r = { ...box };
    if (e.altKey) {
      if (k === "ArrowRight") r.width += step;
      if (k === "ArrowLeft") r.width = Math.max(8, r.width - step);
      if (k === "ArrowDown") r.height += step;
      if (k === "ArrowUp") r.height = Math.max(8, r.height - step);
    } else {
      if (k === "ArrowRight") r.x += step;
      if (k === "ArrowLeft") r.x -= step;
      if (k === "ArrowDown") r.y += step;
      if (k === "ArrowUp") r.y -= step;
    }
    r.x = Math.max(0, Math.min(r.x, vw - r.width));
    r.y = Math.max(0, Math.min(r.y, vh - r.height));
    setDraft(r);
  };
  const commitNudge = () => {
    if (draft && bbox && (draft.x !== bbox.x || draft.y !== bbox.y || draft.width !== bbox.width || draft.height !== bbox.height)) onChange?.(draft);
  };

  if (!src)
    return (
      <div className="stage stage-empty" style={{ aspectRatio: `${vw} / ${vh}` }}>
        <Icon name="image" size={28} />
        <span>{emptyLabel}</span>
      </div>
    );

  return (
    <div ref={ref} className={cx("stage", editable && "is-editable", !!draft && "is-drafting")} style={{ aspectRatio: `${vw} / ${vh}` }} data-testid="stage">
      <img
        src={src}
        alt="Step screenshot"
        draggable={false}
        onLoad={(e) => {
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
          setLoaded(true);
        }}
      />
      {!loaded && <span className="stage-loading skeleton" />}
      {box && (
        <div
          className="hl-box"
          style={{ left: `${(box.x / vw) * 100}%`, top: `${(box.y / vh) * 100}%`, width: `${(box.width / vw) * 100}%`, height: `${(box.height / vh) * 100}%` }}
          onPointerDown={begin("move")}
          onPointerMove={moveTo}
          onPointerUp={end}
          onPointerCancel={end}
          tabIndex={editable ? 0 : -1}
          onKeyDown={nudge}
          onKeyUp={(e) => e.key.startsWith("Arrow") && commitNudge()}
          role={editable ? "slider" : undefined}
          aria-label={editable ? "Highlight area. Drag to move, use handles to resize, arrow keys to nudge (Alt+arrows to resize)." : undefined}
          aria-valuetext={`x ${Math.round(box.x)}, y ${Math.round(box.y)}, ${Math.round(box.width)} by ${Math.round(box.height)}`}
          data-testid="hl-box"
        >
          {editable &&
            HANDLES.map((h) => <span key={h} className={`hl-handle h-${h}`} onPointerDown={begin(h)} onPointerMove={moveTo} onPointerUp={end} onPointerCancel={end} />)}
          {draft && (
            <span className="hl-size mono">
              {Math.round(box.width)}×{Math.round(box.height)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
