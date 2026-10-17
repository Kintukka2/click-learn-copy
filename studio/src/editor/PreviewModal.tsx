import { useEffect, useRef, useState } from "react";
import { uiStrings } from "../../../src/core/instructions";
import type { PlayerMode, ResolvedProcess } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Dialog, EmptyState, Segmented, Spinner, toast } from "../components/ui";
import { api } from "../lib/api";
import { langNative } from "../lib/util";

interface PlayerHandle {
  destroy(): void;
}
interface PlayerApi {
  mount(
    el: HTMLElement,
    cfg: {
      process: ResolvedProcess;
      mode: PlayerMode;
      ui?: Record<string, string>;
      autoplay?: boolean;
      voice?: boolean;
      primaryColor?: string;
      onEvent?: (e: PlayerEvent) => void;
    },
  ): PlayerHandle;
}
interface PlayerEvent {
  type: string;
  mode: string;
  score?: number;
  passed?: boolean;
}
const player = () => (window as unknown as { SteplightPlayer?: PlayerApi }).SteplightPlayer;

let playerLoad: Promise<void> | null = null;
export function loadPlayer(): Promise<void> {
  if (player()) return Promise.resolve();
  if (!playerLoad)
    playerLoad = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/lib/player.js";
      s.async = true;
      s.onload = () => (player() ? resolve() : reject(new Error("player.js loaded but did not define window.SteplightPlayer.")));
      s.onerror = () => {
        s.remove();
        reject(new Error("The player library (/lib/player.js) is not available. Build it with: npm run build:lib"));
      };
      document.head.appendChild(s);
    }).catch((e) => {
      playerLoad = null;
      throw e;
    });
  return playerLoad;
}

const MODES: { id: PlayerMode; label: string; icon: string; hint: string }[] = [
  { id: "show", label: "Show Me", icon: "play", hint: "Narrated walkthrough" },
  { id: "try", label: "Try Me", icon: "hand", hint: "Guided practice" },
  { id: "test", label: "Test Me", icon: "target", hint: "Scored assessment" },
];

export function PreviewModal({ open, onClose, processId, lang, title, primaryColor }: { open: boolean; onClose: () => void; processId: string; lang: string; title: string; primaryColor?: string }) {
  const [mode, setMode] = useState<PlayerMode>("show");
  const [resolved, setResolved] = useState<ResolvedProcess | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResolved(null);
    let alive = true;
    Promise.all([loadPlayer(), api.resolved(processId, lang)]).then(
      ([, r]) => {
        if (!alive) return;
        setResolved(r);
        setReady(true);
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [open, processId, lang]);

  useEffect(() => {
    const P = player();
    if (!open || !ready || !resolved || !host.current || !P) return;
    const el = host.current;
    el.innerHTML = "";
    let handle: PlayerHandle | null = null;
    try {
      handle = P.mount(el, {
        process: resolved,
        mode,
        ui: uiStrings(lang),
        primaryColor,
        onEvent: (e: PlayerEvent) => {
          if (e.type === "complete") {
            if (e.mode === "test") toast.success(e.passed ? "Test passed" : "Test completed", e.score !== undefined ? `Score ${e.score}%` : undefined);
            else toast.success(`${MODES.find((m) => m.id === e.mode)?.label ?? "Preview"} completed`);
          }
        },
      });
    } catch (e) {
      setError(`The player failed to start: ${(e as Error).message}`);
    }
    return () => {
      try {
        handle?.destroy();
      } catch {
        /* ignore */
      }
      el.innerHTML = "";
    };
  }, [open, ready, resolved, mode, lang, nonce, primaryColor]);

  return (
    <Dialog open={open} onClose={onClose} width="min(1240px, 96vw)" className="preview-dialog">
      <div className="preview-head">
        <div className="preview-title">
          <span className="preview-kicker">
            <Icon name="eye" size={13} /> Preview · {langNative(lang)}
          </span>
          <strong>{title}</strong>
        </div>
        <Segmented
          options={MODES.map((m) => ({
            id: m.id,
            title: m.hint,
            label: (
              <span className="seg-label" data-testid={`mode-${m.id}`}>
                <Icon name={m.icon} size={14} /> {m.label}
              </span>
            ),
          }))}
          value={mode}
          onChange={setMode}
        />
        <div className="preview-actions">
          <Button size="sm" variant="ghost" icon="reset" onClick={() => setNonce((n) => n + 1)}>
            Restart
          </Button>
        </div>
      </div>
      <div className="preview-stage">
        {error ? (
          <EmptyState icon="alert" title="Preview unavailable">
            {error}
          </EmptyState>
        ) : !ready || !resolved ? (
          <div className="preview-loading">
            <Spinner size={20} />
            <span className="muted">Loading player…</span>
          </div>
        ) : resolved.steps.length === 0 ? (
          <EmptyState icon="layers" title="Nothing to preview yet">
            Record some steps first.
          </EmptyState>
        ) : null}
        <div ref={host} className="player-host" data-testid="player-host" style={{ display: error || !ready || !resolved?.steps.length ? "none" : undefined }} />
      </div>
    </Dialog>
  );
}
