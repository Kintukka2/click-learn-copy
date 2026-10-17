import { useCallback, useEffect, useMemo, useState } from "react";
import type { Process, Project } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Chip, confirmDialog, Dialog, EmptyState, Field, IconButton, Menu, Skeleton, Tabs, toast } from "../components/ui";
import { api, mediaUrl } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { useStudio } from "../lib/store";
import { cx, initials, langName, timeAgo } from "../lib/util";
import { AnalyticsTab } from "./AnalyticsTab";
import { PublishingTab } from "./PublishingTab";
import { SettingsTab } from "./SettingsTab";
import { withRoot } from "../lib/base";

export type ProjectTab = "processes" | "publishing" | "analytics" | "settings";

export function ProjectPage({ pid, tab }: { pid: string; tab: ProjectTab }) {
  const { refreshProjects } = useStudio();
  const [project, setProject] = useState<Project | null>(null);
  const [processes, setProcesses] = useState<Process[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([api.project(pid), api.processes(pid)]);
      setProject(p);
      setProcesses(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pid]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (project) document.title = `${project.name} · Steplight Studio`;
  }, [project]);

  if (error)
    return (
      <div className="page">
        <EmptyState icon="alert" title="Project not available" actions={<Button onClick={() => navigate("/")}>Back to projects</Button>}>
          {error}
        </EmptyState>
      </div>
    );

  const setTab = (t: ProjectTab) => navigate(`/projects/${pid}${t === "processes" ? "" : `/${t}`}`);
  const primary = project?.branding.primaryColor || "#2f6fed";
  const accent = project?.branding.accentColor || "#14b8a6";

  return (
    <div className="page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <Icon name="chevronRight" size={14} />
        <span>{project?.name ?? "…"}</span>
      </nav>
      <header className="page-head project-head">
        <div className="project-head-main">
          <span className="project-head-avatar" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
            {project?.branding.logoDataUrl ? <img src={project.branding.logoDataUrl} alt="" /> : initials(project?.branding.companyName || project?.name || "")}
          </span>
          <div className="page-titles">
            {project ? <h1>{project.name}</h1> : <Skeleton w={260} h={28} />}
            <div className="project-head-meta">
              {project ? (
                <>
                  <span>{project.description || "No description"}</span>
                  <span className="sep" />
                  <span>
                    {project.languages.map((l, i) => (
                      <span key={l} className="inline-lang" title={langName(l)}>
                        {l.toUpperCase()}
                        {i === 0 && <span className="muted"> (source)</span>}
                        {i < project.languages.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </span>
                  <span className="sep" />
                  {project.publishedAt ? (
                    <Chip tone="success" dot>
                      Published {timeAgo(project.publishedAt)}
                    </Chip>
                  ) : (
                    <Chip>Not published</Chip>
                  )}
                </>
              ) : (
                <Skeleton w={320} h={14} />
              )}
            </div>
          </div>
        </div>
        <div className="page-actions">
          {project?.publishedAt && (
            <Button icon="external" onClick={() => window.open(withRoot(`/portal/${pid}/`), "_blank")}>
              View portal
            </Button>
          )}
          <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)} data-testid="new-process">
            New process
          </Button>
        </div>
      </header>

      <Tabs<ProjectTab>
        className="page-tabs"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "processes", label: "Processes", icon: "layers", count: processes?.length },
          { id: "publishing", label: "Portal & publishing", icon: "globe" },
          { id: "analytics", label: "Analytics", icon: "chart" },
          { id: "settings", label: "Settings", icon: "sliders" },
        ]}
      />

      <div className="tab-panel">
        {tab === "processes" && <ProcessesTab project={project} processes={processes} setProject={setProject} reload={load} onNew={() => setNewOpen(true)} />}
        {tab === "publishing" && project && (
          <PublishingTab
            project={project}
            processes={processes ?? []}
            onPublished={(p) => {
              setProject(p);
              void refreshProjects();
            }}
          />
        )}
        {tab === "analytics" && project && <AnalyticsTab project={project} processes={processes ?? []} />}
        {tab === "settings" && project && (
          <SettingsTab
            project={project}
            onSaved={(p) => {
              setProject(p);
              void refreshProjects();
            }}
          />
        )}
      </div>

      {project && (
        <NewProcessDialog
          open={newOpen}
          onClose={() => setNewOpen(false)}
          project={project}
          chapters={[...new Set((processes ?? []).map((p) => p.chapter).filter(Boolean) as string[])]}
          onCreated={(proc) => {
            void refreshProjects();
            navigate(`/processes/${proc.id}`);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ processes tab
function orderProcesses(project: Project, processes: Process[]): Process[] {
  const byId = new Map(processes.map((p) => [p.id, p]));
  const out: Process[] = [];
  for (const id of project.processIds) {
    const p = byId.get(id);
    if (p) {
      out.push(p);
      byId.delete(id);
    }
  }
  return [...out, ...byId.values()];
}

function groupByChapter(list: Process[]): { chapter: string; items: Process[] }[] {
  const groups: { chapter: string; items: Process[] }[] = [];
  for (const p of list) {
    const ch = p.chapter?.trim() || "";
    let g = groups.find((x) => x.chapter === ch);
    if (!g) groups.push((g = { chapter: ch, items: [] }));
    g.items.push(p);
  }
  return groups;
}

function ProcessesTab({ project, processes, setProject, reload, onNew }: { project: Project | null; processes: Process[] | null; setProject: (p: Project) => void; reload: () => Promise<void>; onNew: () => void }) {
  const { refreshProjects } = useStudio();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const groups = useMemo(() => (project && processes ? groupByChapter(orderProcesses(project, processes)) : []), [project, processes]);

  if (!project || !processes)
    return (
      <div className="card list-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="proc-row is-skeleton">
            <Skeleton w={72} h={46} r={6} />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              <Skeleton w="40%" h={14} />
              <Skeleton w="65%" h={12} />
            </div>
          </div>
        ))}
      </div>
    );

  if (processes.length === 0)
    return (
      <div className="card">
        <EmptyState
          icon="layers"
          title="No processes yet"
          actions={
            <>
              <Button variant="primary" icon="plus" onClick={onNew}>
                New process
              </Button>
            </>
          }
        >
          A process is one business task, for example “Create a sales order”. Create one, then record it with the browser extension or a demo scenario.
        </EmptyState>
      </div>
    );

  const commit = async (nextGroups: { chapter: string; items: Process[] }[]) => {
    const ids = nextGroups.flatMap((g) => g.items.map((p) => p.id));
    const prev = project;
    setProject({ ...project, processIds: ids });
    try {
      setProject(await api.reorder(project.id, ids));
    } catch (e) {
      setProject(prev);
      toast.error("Could not reorder", e);
    }
  };
  const move = (gi: number, i: number, dir: -1 | 1) => {
    const j = i + dir;
    const g = groups[gi];
    if (j < 0 || j >= g.items.length) return;
    const items = [...g.items];
    [items[i], items[j]] = [items[j], items[i]];
    void commit(groups.map((x, k) => (k === gi ? { ...x, items } : x)));
  };
  const moveGroup = (gi: number, dir: -1 | 1) => {
    const j = gi + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[gi], next[j]] = [next[j], next[gi]];
    void commit(next);
  };
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const gi = groups.findIndex((g) => g.items.some((p) => p.id === targetId));
    const g = groups[gi];
    if (!g.items.some((p) => p.id === dragId)) {
      toast.info("Drag within a chapter", "Change a process's chapter in the editor to move it to another chapter.");
      return;
    }
    const items = g.items.filter((p) => p.id !== dragId);
    const dragged = g.items.find((p) => p.id === dragId)!;
    const from = g.items.findIndex((p) => p.id === dragId);
    const to = g.items.findIndex((p) => p.id === targetId);
    items.splice(from < to ? items.findIndex((p) => p.id === targetId) + 1 : items.findIndex((p) => p.id === targetId), 0, dragged);
    void commit(groups.map((x, k) => (k === gi ? { ...x, items } : x)));
  };
  const remove = async (p: Process) => {
    if (!(await confirmDialog({ title: `Delete “${p.title}”?`, message: "The process, its steps and translations will be removed. Screenshots stay in the project media folder.", confirmLabel: "Delete process", danger: true }))) return;
    try {
      await api.deleteProcess(p.id);
      toast.success("Process deleted");
      await reload();
      void refreshProjects();
    } catch (e) {
      toast.error("Could not delete process", e);
    }
  };

  return (
    <div className="chapters">
      {groups.map((g, gi) => (
        <section key={g.chapter || "__none"} className="chapter">
          <div className="chapter-head">
            <h2>
              <Icon name="book" size={15} />
              {g.chapter || "No chapter"}
              <span className="chapter-count">{g.items.length}</span>
            </h2>
            {groups.length > 1 && (
              <div className="row-actions always">
                <IconButton icon="chevronUp" label="Move chapter up" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} />
                <IconButton icon="chevronDown" label="Move chapter down" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} />
              </div>
            )}
          </div>
          <div className="card list-card">
            {g.items.map((p, i) => (
              <ProcessRow
                key={p.id}
                p={p}
                project={project}
                dragging={dragId === p.id}
                over={overId === p.id && dragId !== p.id}
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={() => setOverId(p.id)}
                onDrop={() => {
                  drop(p.id);
                  setDragId(null);
                  setOverId(null);
                }}
                canUp={i > 0}
                canDown={i < g.items.length - 1}
                onUp={() => move(gi, i, -1)}
                onDown={() => move(gi, i, 1)}
                onDelete={() => remove(p)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ReplayChip({ p }: { p: Process }) {
  const r = p.lastReplay;
  if (!r) return <Chip title="Never replayed">Not replayed</Chip>;
  const failed = r.results.filter((x) => x.status === "failed").length;
  const healed = r.results.filter((x) => x.status === "healed").length;
  const when = timeAgo(r.finishedAt);
  if (failed) return <Chip tone="danger" dot title={`${r.mode === "test" ? "Test" : "Replay"} ${when}`}>{failed} failed</Chip>;
  if (healed) return <Chip tone="warning" dot title={`${r.mode === "test" ? "Test" : "Replay"} ${when}`}>{r.mode === "test" ? "Passed" : "Updated"} · {healed} healed</Chip>;
  return (
    <Chip tone="success" dot title={`${r.mode === "test" ? "Test" : "Replay"} ${when}`}>
      {r.mode === "test" ? "Test passed" : "Up to date"}
    </Chip>
  );
}

function ProcessRow(props: {
  p: Process;
  project: Project;
  dragging: boolean;
  over: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const { p, project } = props;
  const thumb = p.steps.find((s) => s.screenshot)?.screenshot;
  const localized = new Set([p.lang, ...Object.keys(p.localizations ?? {})]);
  return (
    <div
      className={cx("proc-row", props.dragging && "is-dragging", props.over && "is-over")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
      data-testid="process-row"
    >
      <span className="drag-handle" title="Drag to reorder">
        <Icon name="grip" size={14} />
      </span>
      <Link to={`/processes/${p.id}`} className="proc-thumb" tabIndex={-1} aria-hidden="true">
        {thumb ? <img src={mediaUrl(p.projectId, thumb)} alt="" loading="lazy" /> : <Icon name="image" size={18} />}
      </Link>
      <div className="proc-main">
        <Link to={`/processes/${p.id}`} className="proc-title">
          {p.title}
        </Link>
        <div className="proc-sub">{p.description || (p.appName ? p.appName : <span className="muted">No description</span>)}</div>
      </div>
      <div className="proc-stat" title="Steps">
        <Icon name="list" size={14} />
        {p.steps.length} step{p.steps.length === 1 ? "" : "s"}
      </div>
      <div className="proc-langs">
        {project.languages.map((l) => {
          const loc = p.localizations?.[l];
          const has = localized.has(l);
          return (
            <span
              key={l}
              className={cx("lang-pill", l === p.lang && "is-source", !has && "is-missing", loc?.status === "auto" && "is-auto")}
              title={l === p.lang ? `${langName(l)} (source)` : has ? `${langName(l)}: ${loc?.status === "reviewed" ? "reviewed" : "translated"}` : `${langName(l)}: not translated yet`}
            >
              {l.toUpperCase()}
            </span>
          );
        })}
      </div>
      <div className="proc-replay">
        <ReplayChip p={p} />
      </div>
      <div className="proc-updated muted">{timeAgo(p.updatedAt)}</div>
      <div className="row-actions">
        <IconButton icon="arrowUp" label="Move up" disabled={!props.canUp} onClick={props.onUp} />
        <IconButton icon="arrowDown" label="Move down" disabled={!props.canDown} onClick={props.onDown} />
        <Menu
          align="right"
          width={190}
          trigger={({ toggle, ref }) => (
            <button ref={ref} className="icon-btn" aria-label="Process actions" onClick={toggle}>
              <Icon name="more" size={16} />
            </button>
          )}
          items={[
            { id: "open", label: "Open editor", icon: "pencil", onSelect: () => navigate(`/processes/${p.id}`) },
            { id: "del", label: "Delete", icon: "trash", danger: true, divider: true, onSelect: props.onDelete },
          ]}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new process
function NewProcessDialog({ open, onClose, project, chapters, onCreated }: { open: boolean; onClose: () => void; project: Project; chapters: string[]; onCreated: (p: Process) => void }) {
  const [title, setTitle] = useState("");
  const [chapter, setChapter] = useState("");
  const [appName, setAppName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle("");
      setChapter(chapters[0] ?? "");
      setAppName(project.branding.companyName && project.name.includes("Northwind") ? "Northwind ERP" : "");
      setStartUrl("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProcess(project.id, { title: title.trim(), chapter: chapter.trim(), appName: appName.trim(), startUrl: startUrl.trim() });
      toast.success("Process created", p.title);
      onClose();
      onCreated(p);
    } catch (e) {
      toast.error("Could not create process", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New process"
      description="Describe the task. You will record its steps next."
      icon="layers"
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!title.trim()} data-testid="create-process">
            Create process
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
        <Field label="Title" htmlFor="npr-title" hint="Start with a verb: “Create a sales order”, “Approve an invoice”.">
          <input id="npr-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Create a sales order" autoComplete="off" />
        </Field>
        <div className="form-grid-2">
          <Field label="Chapter" htmlFor="npr-chapter">
            <input id="npr-chapter" className="input" list="npr-chapters" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Sales" />
            <datalist id="npr-chapters">
              {chapters.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Application" htmlFor="npr-app">
            <input id="npr-app" className="input" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Northwind ERP" />
          </Field>
        </div>
        <Field label="Start URL" htmlFor="npr-url" hint="Where Replay and in-app guidance begin. Relative URLs resolve against this server.">
          <input id="npr-url" className="input mono" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="/demo-erp/#/sales-orders" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
