import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OutputFormat, Process, ProcessLocalization, Project, Rect, ReplayReport, ResolvedProcess, Step, StepLocalization } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Chip, confirmDialog, EmptyState, IconButton, Menu, Skeleton, Spinner, toast, useElapsed, type MenuItem } from "../components/ui";
import { api, download, mediaUrl, type RecordingSession } from "../lib/api";
import { Link, navigate, useLocation } from "../lib/router";
import { useStudio } from "../lib/store";
import { absoluteUrl, cx, formatBytes, isTyping, langName, langNative, timeAgo, withParams } from "../lib/util";
import { ReplayChip } from "../pages/ProjectPage";
import { NoteDialog, RecordDialog, ReportPanel, TranslateDialog } from "./dialogs";
import { PreviewModal } from "./PreviewModal";
import { DraftText, StepInspector } from "./StepInspector";
import { StepList, type StepView } from "./StepList";
import { canLearnerChoose, choiceSuggestion } from "../../../src/core/choice";
import { flaggedSteps } from "../../../src/core/draft";
import { ROOT } from "../lib/base";
import { extensionVersion, finaliseGuide } from "../lib/extension";

type Job = { kind: "replay" | "test" | "translate" | "record"; label: string };

const EXPORTS: { id: OutputFormat; label: string; hint: string; icon: string }[] = [
  { id: "docx", label: "Word document", hint: ".docx · editable guide", icon: "fileText" },
  { id: "pdf", label: "PDF", hint: ".pdf · print-ready guide", icon: "file" },
  { id: "pptx", label: "PowerPoint", hint: ".pptx · one slide per step", icon: "presentation" },
  { id: "html", label: "HTML guide", hint: "Standalone web page", icon: "code" },
  { id: "scorm", label: "SCORM 1.2 package", hint: ".zip · Try Me + Test Me for your LMS", icon: "package" },
  { id: "video", label: "Video", hint: ".webm · rendered Show Me, takes a while", icon: "video" },
];

export function ProcessEditor({ id }: { id: string }) {
  const { setActiveProjectId, refreshProjects } = useStudio();
  const { search } = useLocation();
  const [proc, setProc] = useState<Process | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedProcess | null>(null);
  const [version, setVersion] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [exporting, setExporting] = useState<OutputFormat | null>(null);
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [dialog, setDialog] = useState<null | "record" | "translate" | "preview" | "note">(null);
  const [noteAfter, setNoteAfter] = useState<string | undefined>(undefined);
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [saving, setSaving] = useState(0);
  const savingRef = useRef(0);
  savingRef.current = saving;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const elapsed = useElapsed(!!job);
  const exportElapsed = useElapsed(!!exporting);
  const bump = () => setVersion((v) => v + 1);

  const qsLang = new URLSearchParams(search).get("lang");
  const lang = proc ? (qsLang && project?.languages.includes(qsLang) ? qsLang : proc.lang) : "";
  const isSource = !!proc && lang === proc.lang;

  // ---------------------------------------------------------------- load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await api.process(id);
        if (!alive) return;
        setProc(p);
        setSelId((cur) => cur ?? p.steps[0]?.id ?? null);
        setActiveProjectId(p.projectId);
        const pr = await api.project(p.projectId);
        if (alive) setProject(pr);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, setActiveProjectId]);

  useEffect(() => {
    if (proc) document.title = `${proc.title} · Steplight Studio`;
  }, [proc?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!proc || !lang) return;
    const ac = new AbortController();
    api.resolved(id, lang, ac.signal).then(setResolved, (e: Error) => {
      if (e.name !== "AbortError") setResolved(null);
    });
    return () => ac.abort();
  }, [id, lang, version, !!proc]); // eslint-disable-line react-hooks/exhaustive-deps

  // a draft is recorded from the guide in the application's tab: show the result on coming back
  const hasDrafts = !!proc?.steps.some((st) => st.draft);
  useEffect(() => {
    if (!hasDrafts || session) return;
    const onFocus = async () => {
      if (savingRef.current) return; // an edit made here is still being saved
      try {
        const p = await api.process(id);
        // only steps changed elsewhere (edits made here are already in procRef, and keep their undo history)
        if (savingRef.current || JSON.stringify(p.steps) === JSON.stringify(procRef.current?.steps)) return;
        clearHistory();
        setProc(p);
        bump();
      } catch {
        /* ignore transient errors */
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hasDrafts, session, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // live recording: poll the process while a session is active
  useEffect(() => {
    if (!session) return;
    const t = setInterval(async () => {
      try {
        const p = await api.process(id);
        setProc((cur) => {
          if (cur && p.steps.length !== cur.steps.length) {
            setSelId(p.steps[p.steps.length - 1]?.id ?? null);
            bump();
          }
          return p;
        });
      } catch {
        /* ignore transient errors */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [session, id]);

  const setLang = (l: string) => {
    if (!proc) return;
    navigate(`/processes/${id}${l === proc.lang ? "" : `?lang=${l}`}`, { replace: true });
  };

  // ---------------------------------------------------------------- view model
  const views: StepView[] = useMemo(() => {
    if (!proc) return [];
    const r = resolved && resolved.lang === lang && !isSource ? new Map(resolved.steps.map((s) => [s.id, s])) : null;
    const locs = !isSource ? proc.localizations[lang]?.steps ?? {} : {};
    return proc.steps.map((s) => {
      const rs = r?.get(s.id);
      const l = locs[s.id];
      return {
        step: s,
        title: isSource ? s.title : (rs?.title ?? l?.title ?? s.title),
        screenshot: isSource ? mediaUrl(proc.projectId, s.screenshot) : (rs?.screenshot ?? mediaUrl(proc.projectId, l?.screenshot ?? s.screenshot)),
        bbox: isSource ? s.target?.bbox : (rs?.bbox ?? (l?.screenshot && l.bbox ? l.bbox : s.target?.bbox)),
        localizedShot: !isSource && !!l?.screenshot,
        localizedTitle: !isSource && !!l?.title,
      };
    });
  }, [proc, resolved, lang, isSource]);

  const selIndex = views.findIndex((v) => v.step.id === selId);
  const selView = selIndex >= 0 ? views[selIndex] : undefined;

  useEffect(() => {
    if (proc && (selId === null || !proc.steps.some((s) => s.id === selId))) setSelId(proc.steps[0]?.id ?? null);
  }, [proc, selId]);

  // ---------------------------------------------------------------- mutations
  const track = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSaving((n) => n + 1);
    try {
      const r = await fn();
      setSavedAt(Date.now());
      return r;
    } catch (e) {
      toast.error("Could not save", e);
      try {
        setProc(await api.process(id));
      } catch {
        /* ignore */
      }
      return undefined;
    } finally {
      setSaving((n) => n - 1);
      bump();
    }
  };

  // ---------------------------------------------------------------- undo / redo
  // Each edit made here remembers the process as it was; undo saves that version back in one PATCH.
  // Changes made by the server (recording, replay, translation) clear the history.
  type Snap = { label: string; data: Pick<Process, "title" | "description" | "chapter" | "startUrl" | "steps" | "localizations"> };
  const procRef = useRef<Process | null>(null);
  procRef.current = proc;
  // stacks live in refs so quick repeated presses see each other; the state only re-renders the buttons
  const undoRef = useRef<Snap[]>([]);
  const redoRef = useRef<Snap[]>([]);
  const [, setHistory] = useState(0);
  const historyChanged = () => setHistory((n) => n + 1);
  const undoStack = undoRef.current;
  const redoStack = redoRef.current;
  const snapOf = (p: Process, label: string): Snap => ({
    label,
    // "" rather than undefined, so restoring clears a field that was empty before
    data: structuredClone({ title: p.title, description: p.description ?? "", chapter: p.chapter ?? "", startUrl: p.startUrl ?? "", steps: p.steps, localizations: p.localizations }),
  });
  const remember = (label: string) => {
    if (procRef.current) undoRef.current = [...undoRef.current.slice(-49), snapOf(procRef.current, label)];
    redoRef.current = [];
    historyChanged();
  };
  const clearHistory = () => {
    undoRef.current = [];
    redoRef.current = [];
    historyChanged();
  };
  // restores run one after another, each from the state the previous one left
  const restoring = useRef(Promise.resolve());
  const restoreSeq = useRef(0);
  const restore = (from: typeof undoRef, to: typeof undoRef, verb: string) => {
    const cur = procRef.current;
    const snap = from.current[from.current.length - 1];
    if (!cur || !snap) return;
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, snapOf(cur, snap.label)];
    procRef.current = { ...cur, ...snap.data };
    historyChanged();
    const back = snap.data.steps.find((st) => !cur.steps.some((c) => c.id === st.id));
    setProc((p) => (p ? { ...p, ...snap.data } : p));
    if (back) setSelId(back.id);
    else if (selId && !snap.data.steps.some((st) => st.id === selId)) setSelId(snap.data.steps[0]?.id ?? null);
    const seq = ++restoreSeq.current;
    restoring.current = restoring.current.then(() =>
      track(async () => {
        const saved = await api.updateProcess(id, snap.data);
        if (seq === restoreSeq.current) setProc(saved); // a later press is already on screen otherwise
        toast.info(`${verb}: ${snap.label}`);
      }).then(() => undefined),
    );
  };
  const undo = () => restore(undoRef, redoRef, "Undone");
  const redo = () => restore(redoRef, undoRef, "Redone");

  const patchProcess = (patch: Partial<Process>, label = "edit") => {
    remember(label);
    return patchProcessNow(patch);
  };
  const patchProcessNow = (patch: Partial<Process>) =>
    track(async () => {
      setProc((p) => (p ? { ...p, ...patch } : p));
      const next = await api.updateProcess(id, patch);
      setProc(next);
      return next;
    });

  const patchStep = (stepId: string, patch: Partial<Step>, label = stepEditLabel(patch)) => {
    remember(label);
    return patchStepNow(stepId, patch);
  };
  const patchStepNow = (stepId: string, patch: Partial<Step>) =>
    track(async () => {
      setProc((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? { ...s, ...patch, ...(patch.title !== undefined ? { titleEdited: true } : {}) } : s)) } : p));
      const step = await api.updateStep(id, stepId, patch);
      setProc((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? step : s)) } : p));
      return step;
    });

  /** "Learner picks…": set learnerChooses on exactly the ticked steps (only the ones that change). */
  const [picking, setPicking] = useState<Set<string> | null>(null);
  const applyPicks = async (ids: Set<string>) => {
    setPicking(null);
    const changes = (proc?.steps ?? []).filter((st) => canLearnerChoose(st) && ids.has(st.id) !== !!st.learnerChooses);
    if (changes.length) remember("learner picks");
    for (const st of changes) await patchStepNow(st.id, { learnerChooses: ids.has(st.id) });
  };

  const resetTitle = (stepId: string) => {
    remember("instruction reset");
    return resetTitleNow(stepId);
  };
  const resetTitleNow = (stepId: string) =>
    track(async () => {
      const step = await api.resetTitle(id, stepId);
      setProc((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? step : s)) } : p));
      toast.success("Instruction reset", "The automatic instruction was regenerated.");
    });

  const moveStep = (from: number, to: number) => {
    if (!proc || to < 0 || to >= proc.steps.length || from === to) return;
    const steps = [...proc.steps];
    const [m] = steps.splice(from, 1);
    steps.splice(to, 0, m);
    remember("move step");
    void track(async () => {
      setProc({ ...proc, steps });
      setProc(await api.putSteps(id, steps));
    });
  };

  const deleteStep = async (stepId: string) => {
    if (!proc) return;
    const i = proc.steps.findIndex((s) => s.id === stepId);
    const s = proc.steps[i];
    if (!(await confirmDialog({ title: `Delete step ${i + 1}?`, message: <span dangerouslySetInnerHTML={{ __html: `“${s.title.replace(/\*\*/g, "").replace(/</g, "&lt;")}” and its translations will be removed. You can undo this.` }} />, confirmLabel: "Delete step", danger: true }))) return;
    remember("delete step");
    await track(async () => {
      const next = await api.deleteStep(id, stepId);
      setProc(next);
      setSelId(next.steps[Math.min(i, next.steps.length - 1)]?.id ?? null);
      toast.success("Step deleted", "Undo with Ctrl+Z.");
    });
  };

  /** The step becomes a draft again: finalising the guide shows it in the application and records it anew. */
  const recordAgain = (stepId: string) => {
    const s = proc?.steps.find((x) => x.id === stepId);
    if (!s || s.draft) return;
    void patchStep(stepId, { draft: { source: s.title.replace(/\*\*/g, ""), again: true } }, "record again");
    toast.info("Marked to record again", "Finalise the guide to record its screen and element.");
  };

  const replaceShot = async (stepId: string, image: Blob) => {
    remember("screenshot change");
    await track(async () => {
      const step = await api.replaceScreenshot(id, stepId, await toPng(image));
      setProc((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === stepId ? step : s)) } : p));
      toast.success("Screenshot replaced", step.target && !step.target.bbox && step.action !== "note" ? "Add the highlight again: the image has another shape. Undo with Ctrl+Z." : "Undo with Ctrl+Z.");
    });
  };

  const insertNote = async (title: string, description: string) => {
    remember("insert note");
    await track(async () => {
      const step = await api.insertNote(id, { afterStepId: noteAfter, title, description: description || undefined });
      setProc(await api.process(id));
      setSelId(step.id);
      toast.success("Note inserted");
    });
  };

  const saveLocalization = (mut: (loc: ProcessLocalization) => ProcessLocalization) => {
    if (!proc) return;
    const cur = proc.localizations[lang] ?? { steps: {}, status: "reviewed" as const };
    const next = { ...mut({ ...cur, steps: { ...cur.steps } }), updatedAt: new Date().toISOString() };
    return patchProcess({ localizations: { ...proc.localizations, [lang]: next } }, "translation edit");
  };
  const saveStepLoc = (stepId: string, fields: Partial<StepLocalization>) =>
    saveLocalization((loc) => {
      const merged: StepLocalization = { ...(loc.steps[stepId] ?? {}), ...fields };
      for (const k of Object.keys(merged) as (keyof StepLocalization)[]) if (merged[k] === undefined) delete merged[k];
      loc.steps[stepId] = merged;
      return loc;
    });

  const saveBBox = (stepId: string, r: Rect, localized: boolean) => {
    if (!proc) return;
    if (localized) return saveStepLoc(stepId, { bbox: r });
    const s = proc.steps.find((x) => x.id === stepId);
    if (!s?.target) return;
    return patchStep(stepId, { target: { ...s.target, bbox: r } });
  };

  // ---------------------------------------------------------------- long-running jobs
  const runJob = async <T,>(j: Job, fn: () => Promise<T>, ok: (r: T) => void) => {
    if (job) return toast.info("Please wait", `${job.label} is still running.`);
    setJob(j);
    try {
      ok(await fn());
    } catch (e) {
      toast.error(`${j.label} failed`, e);
    } finally {
      setJob(null);
      bump();
    }
  };

  const replay = (mode: "update" | "test") =>
    runJob(
      { kind: mode === "test" ? "test" : "replay", label: mode === "test" ? "Process test" : "Replay" },
      () => api.replay(id, mode, lang),
      (r) => {
        clearHistory();
        setProc(r.process);
        setReport(r.report);
        const failed = r.report.results.filter((x) => x.status === "failed").length;
        const healed = r.report.results.filter((x) => x.status === "healed").length;
        if (failed) toast.error(mode === "test" ? "Test failed" : "Replay finished with errors", `${failed} step${failed === 1 ? "" : "s"} failed${healed ? `, ${healed} healed` : ""}`);
        else toast.success(mode === "test" ? "Test passed" : "Screenshots updated", `${r.report.results.length} steps${healed ? `, ${healed} healed` : ""}`);
      },
    );

  const translate = (target: string, replayUi: boolean) => {
    setDialog(null);
    void runJob(
      { kind: "translate", label: `Translation to ${langName(target)}` },
      () => api.translate(id, target, replayUi),
      (p) => {
        clearHistory();
        setProc(p);
        setLang(target);
        toast.success(`Translated to ${langName(target)}`, replayUi ? "Localized screenshots captured" : undefined);
      },
    );
  };

  const demoRecord = (scenarioId: string, title: string) => {
    setDialog(null);
    void runJob(
      { kind: "record", label: `Recording “${title}”` },
      () => api.demoRecord(id, scenarioId),
      (p) => {
        clearHistory();
        setProc(p);
        setSelId(p.steps[0]?.id ?? null);
        void refreshProjects();
        toast.success("Recording complete", `${p.steps.length} steps captured`);
      },
    );
  };

  const startSession = async (replace: boolean) => {
    try {
      const s = await api.startRecording(id, replace);
      clearHistory();
      setSession(s);
      if (replace) {
        setProc((p) => (p ? { ...p, steps: [], localizations: {} } : p));
      }
      toast.success("Recording session started", "Use the Steplight extension in your application.");
    } catch (e) {
      toast.error("Could not start recording", e);
    }
  };
  const stopSession = async () => {
    if (!session) return;
    try {
      const p = await api.stopRecording(session.token);
      if (p) setProc(p);
      setSession(null);
      setDialog(null);
      bump();
      toast.success("Recording stopped", p ? `${p.steps.length} steps in this process` : undefined);
    } catch (e) {
      toast.error("Could not stop recording", e);
    }
  };

  const doExport = async (f: OutputFormat) => {
    if (!proc) return;
    setExporting(f);
    try {
      const r = await download(api.exportUrl(id, f, lang), `${proc.title}.${f}`);
      toast.success("Export ready", `${r.name} · ${formatBytes(r.size)}`);
    } catch (e) {
      toast.error(`${EXPORTS.find((x) => x.id === f)?.label} export failed`, e);
    } finally {
      setExporting(null);
    }
  };

  const guideMe = () => {
    if (!proc) return;
    if (!proc.startUrl) return toast.error("No start URL", "Set a start URL for this process first (record a demo scenario or edit it in the header).");
    const assistUrl = `${window.location.origin}${ROOT}/api/processes/${id}/resolved?lang=${lang}`;
    const params: Record<string, string> = { sl_assist: encodeURIComponent(assistUrl) };
    if (!isSource) params.lang = lang;
    window.open(withParams(absoluteUrl(proc.startUrl), params), "_blank", "noopener");
  };

  // ---------------------------------------------------------------- keyboard
  const selRef = useRef({ selIndex, views });
  selRef.current = { selIndex, views };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || isTyping(e) || document.querySelector(".overlay, .menu")) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "z" || k === "y")) {
        e.preventDefault();
        if (k === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      // Delete (Backspace on a Mac keyboard) deletes the selected step, after the usual confirmation
      if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = selRef.current.views[selRef.current.selIndex]?.step.id;
        if (sel && !job && !session) {
          e.preventDefault();
          void deleteStep(sel);
        }
        return;
      }
      const { selIndex: i, views: vs } = selRef.current;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
        const dir = e.key === "ArrowDown" || e.key === "j" ? 1 : -1;
        if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          if (i >= 0) moveStep(i, i + dir);
          return;
        }
        const n = Math.max(0, Math.min(vs.length - 1, (i < 0 ? 0 : i) + dir));
        if (vs[n]) {
          e.preventDefault();
          setSelId(vs[n].step.id);
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-step-id="${vs[n].step.id}"]`)?.focus({ preventScroll: true }));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  if (error)
    return (
      <div className="page">
        <EmptyState icon="alert" title="Process not available" actions={<Button onClick={() => navigate("/")}>Back to projects</Button>}>
          {error}
        </EmptyState>
      </div>
    );

  if (!proc || !project) return <EditorSkeleton />;

  const loc = !isSource ? proc.localizations[lang] : undefined;
  const exportItems: MenuItem[] = EXPORTS.map((x) => ({ id: x.id, label: x.label, hint: x.hint, icon: x.icon, loading: exporting === x.id, disabled: !!exporting, onSelect: () => void doExport(x.id) }));
  const langItems: MenuItem[] = project.languages.map((l) => {
    const lo = proc.localizations[l];
    return {
      id: l,
      icon: l === lang ? "check" : undefined,
      label: (
        <span className="lang-menu-label">
          <span className="lang-code-badge">{l.toUpperCase()}</span> {langNative(l)}
        </span>
      ),
      hint: l === proc.lang ? "Source language" : lo ? (lo.status === "reviewed" ? "Reviewed translation" : `Translated ${timeAgo(lo.updatedAt)}`) : "Not translated · automatic templates",
      onSelect: () => setLang(l),
    };
  });

  return (
    <div className="editor">
      <header className="editor-head">
        <div className="editor-topline">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Projects</Link>
            <Icon name="chevronRight" size={14} />
            <Link to={`/projects/${project.id}`}>{project.name}</Link>
            {proc.chapter && (
              <>
                <Icon name="chevronRight" size={14} />
                <span>{proc.chapter}</span>
              </>
            )}
          </nav>
          <div className="save-state muted small" aria-live="polite">
            {saving > 0 ? (
              <>
                <Spinner size={11} /> Saving…
              </>
            ) : savedAt ? (
              <>
                <Icon name="check" size={12} /> Saved
              </>
            ) : null}
          </div>
        </div>

        <div className="editor-titlerow">
          <div className="editor-titles">
            <DraftText
              multiline={false}
              className="title-input"
              aria-label="Process title"
              value={isSource ? proc.title : (loc?.title ?? "")}
              placeholder={isSource ? "Untitled process" : proc.title}
              onCommit={(v) => {
                if (isSource) {
                  if (v.trim()) void patchProcess({ title: v.trim() }, "title change");
                } else void saveLocalization((l) => ({ ...l, title: v.trim() || undefined }));
              }}
              data-testid="process-title"
            />
            <DraftText
              className="desc-input autosize"
              rows={1}
              aria-label="Process description"
              value={isSource ? (proc.description ?? "") : (loc?.description ?? "")}
              placeholder={isSource ? "Add a short description of what this process achieves…" : proc.description || "Description in this language"}
              onCommit={(v) => (isSource ? void patchProcess({ description: v }, "description change") : void saveLocalization((l) => ({ ...l, description: v.trim() || undefined })))}
            />
          </div>
          <Menu
            align="right"
            width={280}
            header={<span className="muted small">View and edit content in</span>}
            items={langItems}
            trigger={({ toggle, ref, open }) => (
              <button ref={ref} className={cx("lang-switch", open && "is-open", !isSource && "is-foreign")} onClick={toggle} data-testid="lang-switch" aria-label="Content language">
                <Icon name="globe" size={15} />
                <span className="lang-switch-name">{langNative(lang)}</span>
                <span className="lang-code-badge">{lang.toUpperCase()}</span>
                <Icon name="chevronDown" size={14} />
              </button>
            )}
          />
        </div>

        <div className="editor-meta">
          <label className="meta-field" title="Chapter in the portal table of contents">
            <Icon name="book" size={13} />
            <DraftText multiline={false} className="meta-input" value={proc.chapter ?? ""} placeholder="Chapter" onCommit={(v) => void patchProcess({ chapter: v.trim() }, "chapter change")} aria-label="Chapter" />
          </label>
          <label className="meta-field meta-url" title="Start URL used by Replay and Guide me">
            <Icon name="link" size={13} />
            <DraftText multiline={false} className="meta-input mono" value={proc.startUrl ?? ""} placeholder="Start URL" onCommit={(v) => void patchProcess({ startUrl: v.trim() }, "start URL change")} aria-label="Start URL" />
          </label>
          {proc.appName && (
            <span className="meta-field static">
              <Icon name="monitor" size={13} />
              {proc.appName}
            </span>
          )}
          <span className="meta-sep" />
          <Chip icon="list">
            {proc.steps.length} step{proc.steps.length === 1 ? "" : "s"}
          </Chip>
          <button className="chip-btn" onClick={() => proc.lastReplay && setReport(proc.lastReplay)} disabled={!proc.lastReplay} title={proc.lastReplay ? "Show the last replay report" : undefined}>
            <ReplayChip p={proc} />
          </button>
          {!isSource &&
            (loc ? (
              loc.status === "reviewed" ? (
                <Chip tone="success" icon="check">
                  Reviewed
                </Chip>
              ) : (
                <button className="chip-btn" onClick={() => void saveLocalization((l) => ({ ...l, status: "reviewed" }))} title="Mark this translation as reviewed">
                  <Chip tone="warning" dot>
                    Auto-translated · mark reviewed
                  </Chip>
                </button>
              )
            ) : (
              <Chip>Not translated</Chip>
            ))}
        </div>

        <div className="editor-toolbar" role="toolbar" aria-label="Process actions">
          <div className="tb-group">
            {session ? (
              <Button variant="danger" icon="stop" onClick={() => setDialog("record")} data-testid="recording-indicator">
                Recording · {proc.steps.length}
              </Button>
            ) : (
              <Button icon="record" onClick={() => setDialog("record")} disabled={!!job} data-testid="record">
                Record
              </Button>
            )}
            <Button icon="refresh" onClick={() => void replay("update")} disabled={!!job || !proc.steps.length} loading={job?.kind === "replay"} data-testid="replay" title="Replay the recording to refresh every screenshot">
              Replay
            </Button>
            <Button icon="flask" onClick={() => void replay("test")} disabled={!!job || !proc.steps.length} loading={job?.kind === "test"} data-testid="test" title="Run the process as an automated test">
              Test
            </Button>
            <Button icon="languages" onClick={() => setDialog("translate")} disabled={!!job || !proc.steps.length} loading={job?.kind === "translate"} data-testid="translate">
              Translate
            </Button>
          </div>
          {job && (
            <div className="job-status" data-testid="job-status">
              <span className="job-bar">
                <span />
              </span>
              <span>
                {job.label}… <span className="mono muted">{elapsed}s</span>
              </span>
            </div>
          )}
          {exporting && !job && (
            <div className="job-status">
              <Spinner size={12} />
              <span>
                Exporting {EXPORTS.find((x) => x.id === exporting)?.label}… <span className="mono muted">{exportElapsed}s</span>
              </span>
            </div>
          )}
          <div className="tb-group tb-right">
            <IconButton icon="undo" label={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : "Nothing to undo"} disabled={!undoStack.length || !!job || !!session} onClick={undo} data-testid="undo" />
            <IconButton icon="redo" label={redoStack.length ? `Redo ${redoStack[redoStack.length - 1].label} (Ctrl+Shift+Z)` : "Nothing to redo"} disabled={!redoStack.length || !!job || !!session} onClick={redo} data-testid="redo" />
            <Button icon="eye" onClick={() => setDialog("preview")} disabled={!proc.steps.length} data-testid="preview">
              Preview
            </Button>
            <Button icon="compass" onClick={guideMe} disabled={!proc.steps.length} data-testid="guide-me" title="Open the application with in-app guidance">
              Guide me
            </Button>
            <Menu
              align="right"
              width={290}
              header={
                <span className="muted small">
                  Export in <strong>{langName(lang)}</strong>
                </span>
              }
              items={exportItems}
              trigger={({ toggle, ref }) => (
                <Button ref={ref} variant="primary" icon={exporting ? undefined : "download"} loading={!!exporting} iconRight="chevronDown" onClick={toggle} disabled={!proc.steps.length} data-testid="export">
                  Export
                </Button>
              )}
            />
          </div>
        </div>
      </header>

      <div className="editor-body">
        <div className="pane-steps">
          <div className="pane-head">
            <span>
              Steps <span className="muted">{proc.steps.length}</span>
            </span>
            {isSource && proc.steps.some(canLearnerChoose) && !picking && (
              <Button size="sm" variant="ghost" icon="users" onClick={() => setPicking(new Set(proc.steps.filter((st) => st.learnerChooses).map((st) => st.id)))} data-testid="pick-start">
                Learner picks…
              </Button>
            )}
            {proc.steps.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon="noteAdd"
                onClick={() => {
                  setNoteAfter(selId ?? undefined);
                  setDialog("note");
                }}
              >
                Note
              </Button>
            )}
          </div>
          {isSource && proc.steps.some((st) => st.draft) && <DraftBanner proc={proc} selId={selId} onSelect={setSelId} />}
          <StepList
            items={views}
            selectedId={selId}
            onSelect={setSelId}
            onMove={moveStep}
            onDelete={(sid) => void deleteStep(sid)}
            onInsertNote={(after) => {
              setNoteAfter(after);
              setDialog("note");
            }}
            onRecord={() => setDialog("record")}
            onRecordAgain={isSource ? recordAgain : undefined}
            picking={picking ?? undefined}
            onTogglePick={(sid) =>
              setPicking((cur) => {
                const next = new Set(cur);
                if (next.has(sid)) next.delete(sid);
                else next.add(sid);
                return next;
              })
            }
          />
          {picking && (
            <div className="pick-bar" data-testid="pick-bar">
              <span className="muted small">Tick the steps where each learner enters or picks their own value or record.</span>
              <div className="pick-actions">
                <Button size="sm" variant="ghost" onClick={() => setPicking(new Set([...picking, ...proc.steps.filter((st) => choiceSuggestion(st)).map((st) => st.id)]))} data-testid="pick-suggested">
                  Add suggested
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicking(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => void applyPicks(picking)} data-testid="pick-apply">
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="pane-inspector">
          {selView ? (
            <StepInspector
              key={selView.step.id + lang}
              proc={proc}
              view={selView}
              index={selIndex}
              total={views.length}
              lang={lang}
              isSource={isSource}
              onPatch={(p, label) => void patchStep(selView.step.id, p, label)}
              onResetTitle={() => void resetTitle(selView.step.id)}
              onSaveLoc={(f) => void saveStepLoc(selView.step.id, f)}
              onBBox={(r, localized) => void saveBBox(selView.step.id, r, localized)}
              onPrev={() => selIndex > 0 && setSelId(views[selIndex - 1].step.id)}
              onNext={() => selIndex < views.length - 1 && setSelId(views[selIndex + 1].step.id)}
              onDelete={() => void deleteStep(selView.step.id)}
              onTranslate={() => setDialog("translate")}
              onRecordAgain={() => recordAgain(selView.step.id)}
              onReplaceShot={(img) => void replaceShot(selView.step.id, img)}
            />
          ) : (
            <div className="inspector-empty">
              <EmptyState icon="record" title={proc.steps.length ? "Select a step" : "Record your first steps"} actions={!proc.steps.length && <Button variant="primary" icon="record" onClick={() => setDialog("record")}>Record</Button>}>
                {proc.steps.length
                  ? "Pick a step on the left to edit its instruction, highlight and details."
                  : "Use the Steplight browser extension, or let Steplight record a demo scenario in the Northwind ERP app for you."}
              </EmptyState>
            </div>
          )}
        </div>
        {report && <ReportPanel report={report} proc={proc} onClose={() => setReport(null)} onSelectStep={setSelId} />}
      </div>

      <RecordDialog open={dialog === "record"} onClose={() => setDialog(null)} proc={proc} session={session} onStart={startSession} onStop={stopSession} onDemoRecord={demoRecord} />
      <TranslateDialog open={dialog === "translate"} onClose={() => setDialog(null)} proc={proc} project={project} onTranslate={translate} initial={!isSource ? lang : undefined} />
      <NoteDialog open={dialog === "note"} onClose={() => setDialog(null)} onSave={insertNote} />
      <PreviewModal open={dialog === "preview"} onClose={() => setDialog(null)} processId={id} lang={lang} title={resolved?.title ?? proc.title} primaryColor={project.branding.primaryColor} />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="editor">
      <header className="editor-head">
        <Skeleton w={220} h={12} />
        <Skeleton w={420} h={28} style={{ marginTop: 14 }} />
        <Skeleton w={320} h={14} style={{ marginTop: 10 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {[90, 80, 70, 96, 84].map((w, i) => (
            <Skeleton key={i} w={w} h={32} r={8} />
          ))}
        </div>
      </header>
      <div className="editor-body">
        <div className="pane-steps">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="step-item is-skeleton">
              <Skeleton w={22} h={22} r={11} />
              <Skeleton w={72} h={46} r={6} />
              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                <Skeleton w="90%" h={12} />
                <Skeleton w="50%" h={10} />
              </div>
            </div>
          ))}
        </div>
        <div className="pane-inspector">
          <div className="inspector">
            <Skeleton h={420} r={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Imported from a written guide: how many steps are still drafts, and a jump to the next one to check. */
function DraftBanner({ proc, selId, onSelect }: { proc: Process; selId: string | null; onSelect: (id: string) => void }) {
  const drafts = proc.steps.filter((st) => st.draft).length;
  const again = proc.steps.filter((st) => st.draft?.again).length;
  const flagged = flaggedSteps(proc.steps);
  const at = proc.steps.findIndex((st) => st.id === selId);
  const next = flagged.find((st) => proc.steps.indexOf(st) > at) ?? flagged[0];
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const finalise = async () => {
    if (!proc.startUrl) return toast.error("No start URL", "Set the application's address (Start URL) in the header first.");
    setBusy(true);
    try {
      if (!(await extensionVersion())) return setHelp(true);
      setHelp(false);
      const r = await finaliseGuide(proc.id);
      if (r.error) toast.error("Could not finalise the guide", r.error);
      else toast.success("Finalising in the new tab", "Do each step Steplight shows there. Each screen and element is recorded, and shows here when you come back.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="draft-banner" data-testid="draft-banner">
      <Icon name="fileText" size={15} />
      <div>
        <strong>{again === drafts ? `${again === 1 ? "1 step" : `${again} steps`} to record again` : `Drafted from ${proc.importedFrom?.fileName ?? "a written guide"}`}</strong>
        {again < drafts && (
          <span className="small block">
            {drafts === proc.steps.length ? "Not recorded in the application yet." : `${drafts} of ${proc.steps.length} steps not recorded yet.`}{" "}
            {flagged.length ? `${flagged.length} step${flagged.length === 1 ? "" : "s"} to check.` : "Nothing left to check."}
          </span>
        )}
        <span className="small block draft-banner-how" data-testid="draft-how">
          <strong>Finalise the guide</strong> to record it: Steplight opens the application and shows each step there. You do it, and Steplight records the screen and the element.
        </span>
        {help && (
          <span className="small block draft-banner-help" data-testid="finalise-help">
            Finalising needs the Steplight browser extension (0.7 or later), connected to this server: <code>{window.location.origin + ROOT}</code>, with your access key. Installed or reloaded it just now? Refresh this page. You can also open the application and choose{" "}
            <strong>Finalise the guide</strong> in the extension.
          </span>
        )}
      </div>
      <div className="draft-banner-actions">
        <Button size="sm" variant="primary" icon="record" loading={busy} onClick={() => void finalise()} data-testid="finalise">
          Finalise the guide
        </Button>
        {next && (
          <Button size="sm" onClick={() => onSelect(next.id)} data-testid="next-to-check">
            Next to check
          </Button>
        )}
        {proc.startUrl && (
          <Button size="sm" variant="ghost" icon="external" onClick={() => window.open(absoluteUrl(proc.startUrl), "_blank")} data-testid="open-app">
            Open the application
          </Button>
        )}
      </div>
    </div>
  );
}

/** An image as PNG (the server keeps screenshots as PNG). */
async function toPng(image: Blob): Promise<Blob> {
  if (image.type === "image/png") return image;
  const bmp = await createImageBitmap(image);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the image."))), "image/png"));
}

/** Undo label for a step edit, from the fields it changes. */
function stepEditLabel(patch: Partial<Step>): string {
  if (patch.draft !== undefined) return "mark as checked";
  if (patch.title !== undefined) return "instruction edit";
  if (patch.description !== undefined) return "description edit";
  if (patch.learnerChooses !== undefined || patch.choiceHint !== undefined) return "learner picks";
  if (patch.target) return "highlight change";
  if (patch.sensitive !== undefined) return "sensitive value";
  if (patch.action) return "action type";
  if (patch.value !== undefined) return "value edit";
  return "step edit";
}
