import { useEffect, useState, type DragEvent } from "react";
import type { Process, Project } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Dialog, Field, Spinner, toast, useElapsed } from "../components/ui";
import { api, type AiStatus, type ImportResult } from "../lib/api";
import { cx, formatBytes } from "../lib/util";

const STAGES = {
  claude: [
    { at: 0, label: "Reading the document" },
    { at: 2, label: "Preparing the screenshots" },
    { at: 5, label: "Claude is reading the steps and screenshots" },
    { at: 45, label: "Still reading: a long guide can take a couple of minutes" },
  ],
  offline: [
    { at: 0, label: "Reading the document" },
    { at: 2, label: "Preparing the screenshots" },
    { at: 4, label: "Matching the steps" },
  ],
};

const startUrlKey = (pid: string) => `steplight.import.startUrl.${pid}`;
function rememberedStartUrl(pid: string, processes: Process[]): string {
  try {
    const saved = localStorage.getItem(startUrlKey(pid));
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  const latest = [...processes].filter((p) => /^https?:\/\//i.test(p.startUrl ?? "")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.startUrl ?? "";
}

export function ImportGuideDialog({ open, onClose, project, processes, chapters, onImported }: { open: boolean; onClose: () => void; project: Project; processes: Process[]; chapters: string[]; onImported: (r: ImportResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [startUrl, setStartUrl] = useState("");
  const [chapter, setChapter] = useState("");
  const [appName, setAppName] = useState("");
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const elapsed = useElapsed(state === "running");

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setState("idle");
    setError("");
    setStartUrl(rememberedStartUrl(project.id, processes));
    setChapter("");
    setAppName("");
    api.aiStatus().then(setAi, () => setAi(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) return toast.error("Choose a Word document", f.name.toLowerCase().endsWith(".doc") ? "Open it in Word and save it as .docx first." : "Steplight imports .docx files.");
    setFile(f);
    setState("idle");
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  };

  const run = async () => {
    if (!file) return;
    setState("running");
    try {
      localStorage.setItem(startUrlKey(project.id), startUrl.trim());
    } catch {
      /* storage unavailable */
    }
    try {
      const r = await api.importGuide(project.id, file, { startUrl, chapter, appName });
      onClose();
      onImported(r);
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const stages = STAGES[ai?.provider === "claude" ? "claude" : "offline"];
  const stageIdx = stages.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={state !== "running"}
      title="Import a written guide"
      description="Steplight reads the steps of a Word guide and drafts the process. You check the draft, then record it in the application."
      icon="upload"
      width={580}
      footer={
        state === "running" ? (
          <span className="muted">Keep this tab open.</span>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={state === "error" ? "refresh" : "upload"} onClick={run} disabled={!file} data-testid="run-import">
              {state === "error" ? "Try again" : "Import guide"}
            </Button>
          </>
        )
      }
    >
      {state === "running" ? (
        <div className="progress-panel" data-testid="import-progress">
          <div className="progress-bar indeterminate">
            <span />
          </div>
          <ul className="stage-list">
            {stages.map((s, i) => (
              <li key={s.label} className={cx(i < stageIdx && "is-done", i === stageIdx && "is-current")}>
                <span className="stage-icon">{i < stageIdx ? <Icon name="check" size={12} strokeWidth={2.6} /> : i === stageIdx ? <Spinner size={12} /> : null}</span>
                {s.label}
              </li>
            ))}
          </ul>
          <div className="elapsed mono">{elapsed}s elapsed</div>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {state === "error" && (
            <div className="callout callout-danger">
              <Icon name="alert" size={16} />
              <div>
                <strong>The guide could not be imported.</strong>
                <div className="small">{error}</div>
              </div>
            </div>
          )}
          <label
            className={cx("drop-zone", over && "is-over", file && "has-file")}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            data-testid="drop-zone"
          >
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
              data-testid="guide-file"
            />
            <Icon name="fileText" size={file ? 20 : 26} />
            {file ? (
              <span className="drop-file">
                <strong>{file.name}</strong>
                <span className="muted small">{formatBytes(file.size)} · click to choose another file</span>
              </span>
            ) : (
              <span>
                <strong>Drop a Word document here</strong>
                <span className="muted small block">or click to choose a .docx file</span>
              </span>
            )}
          </label>
          <Field label="Start URL" htmlFor="imp-url" hint="Where the process starts in the application, in your test environment. Steplight remembers it for this project.">
            <input id="imp-url" className="input mono" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://yourcompany.sandbox.operations.dynamics.com/?cmp=…" autoComplete="off" />
          </Field>
          <div className="form-grid-2">
            <Field label="Chapter" htmlFor="imp-chapter" hint="Empty: the guide's module or area.">
              <input id="imp-chapter" className="input" list="imp-chapters" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Accounts receivable" />
              <datalist id="imp-chapters">
                {chapters.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Application" htmlFor="imp-app" hint="Empty: the application the guide names.">
              <input id="imp-app" className="input" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Dynamics 365" />
            </Field>
          </div>
          {ai &&
            (ai.provider === "claude" ? (
              <div className="callout callout-subtle">
                <Icon name="sparkles" size={15} />
                <div>Claude reads the guide's text and screenshots, so the document is sent to the Anthropic API.</div>
              </div>
            ) : (
              <div className="callout">
                <Icon name="info" size={15} />
                <div>
                  Claude isn't set up on this server, so Steplight reads the guide with simple rules (lines like “Click <strong>New</strong>”). Expect more steps to check. Set{" "}
                  <code>ANTHROPIC_API_KEY</code> on the server to let Claude read it.
                </div>
              </div>
            ))}
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}
