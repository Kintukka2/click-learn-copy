import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Button, Chip, confirmDialog, LangPills, Menu, Skeleton, toast } from "../components/ui";
import { api, type ProjectSummary } from "../lib/api";
import { Link, navigate } from "../lib/router";
import { useStudio } from "../lib/store";
import { initials, timeAgo } from "../lib/util";
import { NewProjectDialog, SampleProjectDialog } from "./ProjectDialogs";

export function ProjectsHome() {
  const { projects, projectsError, refreshProjects } = useStudio();
  const [newOpen, setNewOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    document.title = "Projects · Steplight Studio";
    void refreshProjects();
  }, [refreshProjects]);

  const filtered = (projects ?? []).filter((p) => !query || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const isEmpty = projects !== null && projects.length === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-titles">
          <h1>Projects</h1>
          <p className="page-sub">Each project is a learning portal: its processes, languages and branding.</p>
        </div>
        {!isEmpty && (
          <div className="page-actions">
            <Button icon="sparkles" onClick={() => setSampleOpen(true)} data-testid="sample-project">
              Create sample project
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)} data-testid="new-project">
              New project
            </Button>
          </div>
        )}
      </header>

      {projectsError && (
        <div className="callout callout-danger">
          <Icon name="alert" size={16} />
          <div>
            <strong>Could not load projects.</strong> {projectsError}
          </div>
          <Button size="sm" onClick={() => void refreshProjects()}>
            Retry
          </Button>
        </div>
      )}

      {projects === null && (
        <div className="project-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="project-card is-skeleton">
              <Skeleton h={84} r={0} />
              <div className="project-card-body">
                <Skeleton w="60%" h={16} />
                <Skeleton w="90%" h={12} />
                <Skeleton w="40%" h={12} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isEmpty && <Onboarding onSample={() => setSampleOpen(true)} onNew={() => setNewOpen(true)} />}

      {projects && projects.length > 0 && (
        <>
          <div className="toolbar-row">
            <div className="search-input">
              <Icon name="search" size={15} />
              <input placeholder="Filter projects" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter projects" />
            </div>
            <span className="muted">
              {filtered.length} of {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="project-grid">
            {filtered.map((p) => (
              <ProjectCard key={p.id} p={p} onChanged={refreshProjects} />
            ))}
            <button className="project-card project-card-new" onClick={() => setNewOpen(true)}>
              <span className="new-plus">
                <Icon name="plus" size={20} />
              </span>
              <span className="new-title">New project</span>
              <span className="muted">Start an empty project</span>
            </button>
          </div>
        </>
      )}

      <NewProjectDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(p) => {
          void refreshProjects();
          navigate(`/projects/${p.id}`);
        }}
      />
      <SampleProjectDialog
        open={sampleOpen}
        onClose={() => setSampleOpen(false)}
        onCreated={(p) => {
          void refreshProjects();
          navigate(`/projects/${p.id}`);
        }}
      />
    </div>
  );
}

function ProjectCard({ p, onChanged }: { p: ProjectSummary; onChanged: () => Promise<void> }) {
  const primary = p.branding?.primaryColor || "#2f6fed";
  const accent = p.branding?.accentColor || "#14b8a6";
  return (
    <div className="project-card" data-testid="project-card">
      <Link to={`/projects/${p.id}`} className="project-card-link" aria-label={`Open ${p.name}`} />
      <div className="project-cover" style={{ background: `linear-gradient(120deg, ${primary} 0%, ${accent} 100%)` }}>
        <div className="cover-pattern" />
        <span className="project-logo">{p.branding?.logoDataUrl ? <img src={p.branding.logoDataUrl} alt="" /> : initials(p.branding?.companyName || p.name)}</span>
        {p.publishedAt && (
          <span className="cover-badge" title={`Published ${timeAgo(p.publishedAt)}`}>
            <span className="status-dot is-on" /> Published
          </span>
        )}
      </div>
      <div className="project-card-body">
        <div className="project-card-title">
          <h3>{p.name}</h3>
          <Menu
            align="right"
            width={200}
            trigger={({ toggle, ref }) => (
              <button ref={ref} className="icon-btn card-menu" aria-label="Project actions" onClick={(e) => (e.stopPropagation(), toggle())}>
                <Icon name="more" size={16} />
              </button>
            )}
            items={[
              { id: "open", label: "Open", icon: "arrowRight", onSelect: () => navigate(`/projects/${p.id}`) },
              { id: "settings", label: "Settings", icon: "sliders", onSelect: () => navigate(`/projects/${p.id}/settings`) },
              ...(p.publishedAt ? [{ id: "portal", label: "Open portal", icon: "external", onSelect: () => window.open(`/portal/${p.id}/`, "_blank") }] : []),
              {
                id: "delete",
                label: "Delete project",
                icon: "trash",
                danger: true,
                divider: true,
                onSelect: async () => {
                  if (!(await confirmDialog({ title: `Delete “${p.name}”?`, message: "All processes, screenshots and the published portal will be permanently removed.", confirmLabel: "Delete project", danger: true }))) return;
                  try {
                    await api.deleteProject(p.id);
                    toast.success("Project deleted");
                    await onChanged();
                  } catch (e) {
                    toast.error("Could not delete project", e);
                  }
                },
              },
            ]}
          />
        </div>
        <p className="project-desc">{p.description || <span className="muted">No description</span>}</p>
        <div className="project-meta">
          <span className="meta-item">
            <Icon name="layers" size={14} /> {p.processCount} process{p.processCount === 1 ? "" : "es"}
          </span>
          <LangPills langs={p.languages} />
        </div>
        <div className="project-foot">
          <span className="muted">
            <Icon name="clock" size={13} /> Updated {timeAgo(p.updatedAt)}
          </span>
          {!p.publishedAt && <Chip>Draft</Chip>}
        </div>
      </div>
    </div>
  );
}

const OUTPUTS: { icon: string; label: string; tone: string }[] = [
  { icon: "fileText", label: "Word & PDF", tone: "blue" },
  { icon: "presentation", label: "PowerPoint", tone: "orange" },
  { icon: "play", label: "Show Me", tone: "teal" },
  { icon: "hand", label: "Try Me", tone: "violet" },
  { icon: "target", label: "Test Me", tone: "rose" },
  { icon: "package", label: "SCORM", tone: "amber" },
  { icon: "video", label: "Video", tone: "blue" },
  { icon: "compass", label: "In-app Assist", tone: "teal" },
  { icon: "languages", label: "7 languages", tone: "violet" },
  { icon: "globe", label: "Learning portal", tone: "green" },
];

function Onboarding({ onSample, onNew }: { onSample: () => void; onNew: () => void }) {
  return (
    <section className="onboarding">
      <div className="onb-copy">
        <Chip tone="teal" icon="sparkles">
          Welcome to Steplight
        </Chip>
        <h2>
          Record a process once.
          <br />
          <span className="grad-text">Publish it everywhere.</span>
        </h2>
        <p>
          Click through a task in your web application. Steplight writes the instructions, captures every screen and turns it into guides, interactive training, in-app guidance
          and a branded portal, in every language you need.
        </p>
        <ol className="onb-steps">
          <li>
            <span className="onb-num">1</span>
            <div>
              <strong>Record</strong>
              <span>with the browser extension or a scripted demo</span>
            </div>
          </li>
          <li>
            <span className="onb-num">2</span>
            <div>
              <strong>Refine</strong>
              <span>edit instructions, highlights and translations</span>
            </div>
          </li>
          <li>
            <span className="onb-num">3</span>
            <div>
              <strong>Publish</strong>
              <span>export documents, SCORM, video and a learning portal</span>
            </div>
          </li>
        </ol>
        <div className="onb-actions">
          <Button variant="primary" size="lg" icon="sparkles" onClick={onSample} data-testid="sample-project">
            Create sample project
          </Button>
          <Button size="lg" icon="plus" onClick={onNew} data-testid="new-project">
            Start from scratch
          </Button>
        </div>
        <p className="onb-note muted">The sample records the bundled Northwind ERP demo app automatically. It takes about a minute.</p>
      </div>
      <div className="onb-visual" aria-hidden="true">
        <div className="onb-window">
          <div className="onb-window-bar">
            <span />
            <span />
            <span />
            <div className="onb-url">northwind-erp / sales-orders / new</div>
          </div>
          <div className="onb-window-body">
            <div className="onb-side">
              <i />
              <i />
              <i className="on" />
              <i />
            </div>
            <div className="onb-form">
              <b />
              <i />
              <i />
              <div className="onb-target">
                <i />
                <span className="onb-tip">
                  <span className="onb-tip-step">Step 3 of 7</span>
                  <span>
                    Click <strong>Post</strong>.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="onb-outputs">
          {OUTPUTS.map((o) => (
            <span key={o.label} className={`onb-out tone-${o.tone}`}>
              <Icon name={o.icon} size={14} />
              {o.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
