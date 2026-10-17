import { useEffect } from "react";
import { ExtensionHelp } from "./components/ExtensionHelp";
import { Icon, Logo } from "./components/Icon";
import { ConfirmHost, Toaster } from "./components/ui";
import { ProcessEditor } from "./editor/ProcessEditor";
import { Link, match, useLocation } from "./lib/router";
import { StudioProvider, useStudio } from "./lib/store";
import { cx, initials } from "./lib/util";
import { ProjectPage, type ProjectTab } from "./pages/ProjectPage";
import { ProjectsHome } from "./pages/ProjectsHome";

export function App() {
  return (
    <StudioProvider>
      <Shell />
      <Toaster />
      <ConfirmHost />
    </StudioProvider>
  );
}

const PROJECT_TABS: { id: ProjectTab; label: string; icon: string }[] = [
  { id: "processes", label: "Processes", icon: "layers" },
  { id: "publishing", label: "Portal & publishing", icon: "globe" },
  { id: "analytics", label: "Analytics", icon: "chart" },
  { id: "settings", label: "Settings", icon: "sliders" },
];

function Shell() {
  const { path } = useLocation();
  const { setActiveProjectId } = useStudio();
  let page: JSX.Element;
  let m: Record<string, string> | null;
  if ((m = match("/processes/:id", path))) page = <ProcessEditor key={m.id} id={m.id} />;
  else if ((m = match("/projects/:pid/:tab", path)) || (m = match("/projects/:pid", path))) {
    const tab = (PROJECT_TABS.some((t) => t.id === m!.tab) ? m.tab : "processes") as ProjectTab;
    page = <ProjectPage key={m.pid} pid={m.pid} tab={tab} />;
  } else page = <ProjectsHome />;

  useEffect(() => {
    if (path === "/") setActiveProjectId(null);
    const pm = match("/projects/:pid/:tab", path) ?? match("/projects/:pid", path);
    if (pm) setActiveProjectId(pm.pid);
  }, [path, setActiveProjectId]);

  const isEditor = path.startsWith("/processes/");
  return (
    <div className={cx("app", isEditor && "app-editor")}>
      <Sidebar path={path} />
      <main className="main">{page}</main>
      <ExtensionHelp />
    </div>
  );
}

function Sidebar({ path }: { path: string }) {
  const { projects, activeProjectId, ai, setHelpOpen } = useStudio();
  const recent = (projects ?? []).slice(0, 8);
  const active = projects?.find((p) => p.id === activeProjectId);
  const list = active && !recent.some((p) => p.id === active.id) ? [active, ...recent.slice(0, 7)] : recent;
  const pm = match("/projects/:pid/:tab", path);
  const currentTab = pm?.tab ?? (match("/projects/:pid", path) ? "processes" : path.startsWith("/processes/") ? "processes" : "");
  return (
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="Steplight home">
        <Logo size={28} />
        <span className="brand-text">
          <span className="brand-name">Steplight</span>
          <span className="brand-sub">Studio</span>
        </span>
      </Link>

      <nav className="side-nav" aria-label="Main">
        <Link to="/" className={cx("side-link", path === "/" && "is-active")}>
          <Icon name="grid" size={16} />
          <span className="side-label">All projects</span>
          {projects && <span className="side-count">{projects.length}</span>}
        </Link>
      </nav>

      <div className="side-section">
        <div className="side-section-title">Projects</div>
        {projects === null && (
          <div className="side-skeleton">
            <span className="skeleton" style={{ height: 12, width: "70%" }} />
            <span className="skeleton" style={{ height: 12, width: "55%" }} />
          </div>
        )}
        {projects && projects.length === 0 && <div className="side-empty">No projects yet</div>}
        {list.map((p) => {
          const isActive = p.id === activeProjectId;
          return (
            <div key={p.id} className={cx("side-project", isActive && "is-open")}>
              <Link to={`/projects/${p.id}`} className={cx("side-link", isActive && !currentTab && "is-active")} title={p.name}>
                <span className="side-avatar" style={{ background: `linear-gradient(135deg, ${p.branding?.primaryColor ?? "#2f6fed"}, ${p.branding?.accentColor ?? "#14b8a6"})` }}>
                  {p.branding?.logoDataUrl ? <img src={p.branding.logoDataUrl} alt="" /> : initials(p.branding?.companyName || p.name)}
                </span>
                <span className="side-label">{p.name}</span>
              </Link>
              {isActive && (
                <div className="side-sub">
                  {PROJECT_TABS.map((t) => (
                    <Link key={t.id} to={`/projects/${p.id}${t.id === "processes" ? "" : `/${t.id}`}`} className={cx("side-link side-link-sub", currentTab === t.id && "is-active")}>
                      <Icon name={t.icon} size={15} />
                      <span className="side-label">{t.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="side-foot">
        <button className="side-link" onClick={() => setHelpOpen(true)}>
          <Icon name="puzzle" size={16} />
          <span className="side-label">Browser extension</span>
        </button>
        <a className="side-link" href="/demo-erp/" target="_blank" rel="noreferrer">
          <Icon name="monitor" size={16} />
          <span className="side-label">Demo app</span>
          <Icon name="external" size={13} className="side-ext" />
        </a>
        <div className="side-ai" title={ai?.model ? `Model: ${ai.model}` : "Set ANTHROPIC_API_KEY on the server to enable Claude"}>
          <span className={cx("status-dot", ai?.provider === "claude" ? "is-on" : "is-off")} />
          <span className="side-label">
            AI: <strong>{ai ? (ai.provider === "claude" ? "Claude" : "Offline templates") : "…"}</strong>
          </span>
        </div>
      </div>
    </aside>
  );
}
