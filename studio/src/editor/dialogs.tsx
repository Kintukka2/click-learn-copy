import { useEffect, useState } from "react";
import type { Process, Project, ReplayReport } from "../../../src/core/model";

import { Icon } from "../components/Icon";
import { Button, Chip, CopyButton, Dialog, EmptyState, Field, IconButton, Skeleton, Tabs, Toggle } from "../components/ui";
import { api, type DemoScenarioInfo, type RecordingSession } from "../lib/api";
import { useStudio } from "../lib/store";
import { cx, formatDate, langName, langNative, timeAgo } from "../lib/util";

// ------------------------------------------------------------------ Record
export function RecordDialog({
  open,
  onClose,
  proc,
  session,
  onStart,
  onStop,
  onDemoRecord,
}: {
  open: boolean;
  onClose: () => void;
  proc: Process;
  session: RecordingSession | null;
  onStart: (replace: boolean) => Promise<void>;
  onStop: () => Promise<void>;
  onDemoRecord: (scenarioId: string, title: string) => void;
}) {
  const { setHelpOpen } = useStudio();
  const [tab, setTab] = useState<"extension" | "demo">("extension");
  const [replace, setReplace] = useState(proc.steps.length > 0);
  const [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState<DemoScenarioInfo[] | null>(null);
  const [scErr, setScErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tab !== "demo" || scenarios) return;
    api.demoScenarios().then(
      (s) => {
        setScenarios(s);
        setPicked((s.find((x) => x.title.toLowerCase() === proc.title.toLowerCase()) ?? s[0])?.id ?? null);
      },
      (e: Error) => setScErr(e.message),
    );
  }, [open, tab, scenarios]);

  const startUrl = proc.startUrl ? new URL(proc.startUrl, window.location.origin).toString() : "";
  const sc = scenarios?.find((s) => s.id === picked);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record steps"
      description="Capture the process by doing it once in the real application."
      icon="record"
      width={620}
      footer={
        tab === "extension" ? (
          session ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Keep recording in background
              </Button>
              <Button
                variant="danger"
                icon="stop"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onStop();
                  } finally {
                    setBusy(false);
                  }
                }}
                data-testid="stop-recording"
              >
                Stop recording
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon="record"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onStart(replace);
                  } finally {
                    setBusy(false);
                  }
                }}
                data-testid="start-recording"
              >
                Start recording session
              </Button>
            </>
          )
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon="play" disabled={!sc} onClick={() => sc && onDemoRecord(sc.id, sc.title)} data-testid="record-scenario">
              Record scenario
            </Button>
          </>
        )
      }
    >
      <Tabs
        className="dialog-tabs"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "extension", label: "Browser extension", icon: "puzzle" },
          { id: "demo", label: "Demo scenario", icon: "sparkles" },
        ]}
      />
      {tab === "extension" &&
        (session ? (
          <div className="rec-live">
            <div className="rec-live-head">
              <span className="rec-dot" />
              <strong>Recording</strong>
              <span className="muted">started {timeAgo(session.startedAt)}</span>
            </div>
            <div className="rec-count">
              <span className="rec-count-num">{proc.steps.length}</span>
              <span className="muted">steps captured so far</span>
            </div>
            <p className="muted small">Work through the process in the application. The Steplight extension streams every action and screenshot into this session; the step list updates live.</p>
            <div className="rec-token">
              <span className="muted small">Session</span>
              <code>{session.token}</code>
              <CopyButton text={session.token} />
            </div>
            {startUrl && (
              <Button icon="external" onClick={() => window.open(startUrl, "_blank")}>
                Open {proc.appName || "application"}
              </Button>
            )}
          </div>
        ) : (
          <div className="form-stack">
            <ol className="flow-steps">
              <li>
                <span className="flow-num">1</span>
                <div>
                  <strong>Install the Steplight extension</strong>
                  <span>
                    Chrome or Edge, loaded from <code>dist/extension</code>.{" "}
                    <button className="link-btn" onClick={() => setHelpOpen(true)}>
                      How to install
                    </button>
                  </span>
                </div>
              </li>
              <li>
                <span className="flow-num">2</span>
                <div>
                  <strong>Start a recording session</strong>
                  <span>
                    Studio creates a session with <code>POST /api/recordings</code>. The extension finds it via <code>/api/recordings/active</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="flow-num">3</span>
                <div>
                  <strong>Do the task in your application</strong>
                  <span>Every click, entry and selection becomes a step with a screenshot and an automatic instruction.</span>
                </div>
              </li>
            </ol>
            {proc.steps.length > 0 && <Toggle checked={replace} onChange={setReplace} label={`Replace the existing ${proc.steps.length} steps (otherwise new steps are appended)`} />}
            {startUrl && (
              <div className="muted small">
                Start URL: <code>{startUrl}</code>
              </div>
            )}
          </div>
        ))}
      {tab === "demo" && (
        <div className="form-stack">
          <p className="muted small">Steplight drives the bundled Northwind ERP in a headless browser and records the scenario into this process. Existing steps and translations are replaced.</p>
          {scErr && (
            <div className="callout callout-danger">
              <Icon name="alert" size={16} />
              <div>{scErr}</div>
            </div>
          )}
          {!scenarios && !scErr && (
            <div className="scenario-list">
              {[0, 1, 2].map((i) => (
                <div key={i} className="scenario">
                  <Skeleton w="50%" h={14} />
                  <Skeleton w="80%" h={12} />
                </div>
              ))}
            </div>
          )}
          {scenarios && scenarios.length === 0 && (
            <EmptyState compact icon="sparkles" title="No demo scenarios available">
              The server has no scripted scenarios yet.
            </EmptyState>
          )}
          {scenarios && scenarios.length > 0 && (
            <div className="scenario-list" role="radiogroup">
              {scenarios.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={picked === s.id} className={cx("scenario", picked === s.id && "is-on")} onClick={() => setPicked(s.id)}>
                  <span className="radio" />
                  <span className="scenario-text">
                    <span className="scenario-title">{s.title}</span>
                    <span className="scenario-desc">{s.description}</span>
                  </span>
                  <span className="scenario-meta">
                    {s.chapter && <Chip>{s.chapter}</Chip>}
                    <span className="muted small">{s.actionCount} actions</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ Translate
export function TranslateDialog({ open, onClose, proc, project, onTranslate, initial }: { open: boolean; onClose: () => void; proc: Process; project: Project; onTranslate: (lang: string, replayUi: boolean) => void; initial?: string }) {
  const { ai } = useStudio();
  const targets = project.languages.filter((l) => l !== proc.lang);
  const [lang, setLang] = useState<string>(initial && targets.includes(initial) ? initial : targets[0] ?? "");
  const [replayUi, setReplayUi] = useState(true);
  useEffect(() => {
    if (open) setLang(initial && targets.includes(initial) ? initial : targets.find((t) => !proc.localizations[t]) ?? targets[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Translate process"
      description={`From ${langName(proc.lang)} into another project language.`}
      icon="languages"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="languages" disabled={!lang} onClick={() => onTranslate(lang, replayUi)} data-testid="run-translate">
            Translate to {lang ? langName(lang) : "…"}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <div className="ai-banner">
          <span className={cx("ai-badge", ai?.provider === "claude" ? "is-claude" : "is-offline")}>
            <Icon name={ai?.provider === "claude" ? "sparkles" : "fileText"} size={14} />
          </span>
          <div>
            <div>
              Translation engine: <strong>{ai?.provider === "claude" ? "Claude" : "Offline templates"}</strong>
              {ai?.model && <span className="muted"> · {ai.model}</span>}
            </div>
            <div className="muted small">
              {ai?.provider === "claude"
                ? "Edited instructions and descriptions are translated by Claude. Automatic instructions come from language templates."
                : "Automatic instructions are generated from language templates. Set ANTHROPIC_API_KEY on the server to translate hand-written text with Claude."}
            </div>
          </div>
        </div>
        {targets.length === 0 ? (
          <div className="callout">
            <Icon name="info" size={16} />
            <div>This project has only one language. Add languages in project settings first.</div>
          </div>
        ) : (
          <Field label="Target language">
            <div className="lang-cards" role="radiogroup">
              {targets.map((l) => {
                const loc = proc.localizations[l];
                return (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} className={cx("lang-card", lang === l && "is-on")} onClick={() => setLang(l)}>
                    <span className="lang-card-code">{l.toUpperCase()}</span>
                    <span className="lang-card-name">{langNative(l)}</span>
                    <span className="lang-card-status">{loc ? (loc.status === "reviewed" ? "Reviewed" : `Translated ${timeAgo(loc.updatedAt)}`) : "Not translated"}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Toggle
          checked={replayUi}
          onChange={setReplayUi}
          label={
            <span>
              <strong>Capture localized screenshots</strong>
              <span className="muted small block">Replays the recording with the application UI in the target language, so screenshots and element names match.</span>
            </span>
          }
        />
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Note
export function NoteDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (title: string, description: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
    }
  }, [open]);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onSave(title.trim(), description.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Insert a note"
      description="An explanation step with no action, e.g. a tip or a business rule."
      icon="noteAdd"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!title.trim()} data-testid="save-note">
            Insert note
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Note" htmlFor="note-title" hint="Use **double asterisks** for bold.">
          <input id="note-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Check the **credit limit** before you continue." />
        </Field>
        <Field label="Details (optional)" htmlFor="note-desc">
          <textarea id="note-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Replay report
export function ReportPanel({ report, proc, onClose, onSelectStep }: { report: ReplayReport; proc: Process; onClose: () => void; onSelectStep: (id: string) => void }) {
  const ok = report.results.filter((r) => r.status === "ok").length;
  const healed = report.results.filter((r) => r.status === "healed").length;
  const failed = report.results.filter((r) => r.status === "failed").length;
  const total = report.results.reduce((s, r) => s + (r.durationMs ?? 0), 0);
  const idx = new Map(proc.steps.map((s, i) => [s.id, i]));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <aside className="drawer" aria-label="Replay report" data-testid="report-panel">
      <div className="drawer-head">
        <div>
          <div className="drawer-kicker">{report.mode === "test" ? "Process test" : "Screenshot update"} · {report.lang.toUpperCase()}</div>
          <h2>{report.passed ? (report.mode === "test" ? "Test passed" : "Replay completed") : report.mode === "test" ? "Test failed" : "Replay finished with errors"}</h2>
          <div className="muted small">
            {formatDate(report.finishedAt)} · {(total / 1000).toFixed(1)}s total
          </div>
        </div>
        <IconButton icon="x" label="Close report" onClick={onClose} />
      </div>
      <div className={cx("report-summary", report.passed ? "is-pass" : "is-fail")}>
        <div>
          <span className="rs-num">{ok}</span>
          <span className="rs-label">
            <span className="status-dot is-ok" /> OK
          </span>
        </div>
        <div>
          <span className="rs-num">{healed}</span>
          <span className="rs-label">
            <span className="status-dot is-healed" /> Healed
          </span>
        </div>
        <div>
          <span className="rs-num">{failed}</span>
          <span className="rs-label">
            <span className="status-dot is-failed" /> Failed
          </span>
        </div>
      </div>
      <ol className="report-list">
        {report.results.map((r) => {
          const i = idx.get(r.stepId);
          const step = i !== undefined ? proc.steps[i] : undefined;
          return (
            <li key={r.stepId}>
              <button className={cx("report-row", `is-${r.status}`)} onClick={() => onSelectStep(r.stepId)} disabled={!step}>
                <span className="report-idx">{i !== undefined ? i + 1 : "–"}</span>
                <span className="report-main">
                  <span className="report-title">{step ? step.title.replace(/\*\*/g, "") : "(deleted step)"}</span>
                  {r.matched && (
                    <span className="report-sel mono">
                      <span className="sel-kind">{r.matched.kind}</span> {r.matched.value}
                      {(r.matchedIndex ?? 0) > 0 && <span className="muted"> · fallback #{(r.matchedIndex ?? 0) + 1}</span>}
                    </span>
                  )}
                  {r.message && <span className="report-msg">{r.message}</span>}
                </span>
                <span className="report-side">
                  <Chip tone={r.status === "ok" ? "success" : r.status === "healed" ? "warning" : "danger"}>{r.status}</Chip>
                  <span className="muted small mono">{r.durationMs} ms</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}


