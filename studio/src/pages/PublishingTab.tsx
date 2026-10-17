import { useState } from "react";
import type { Process, Project } from "../../../src/core/model";
import { CodeLine } from "../components/ExtensionHelp";
import { Icon } from "../components/Icon";
import { Button, Chip, toast, useElapsed } from "../components/ui";
import { api, download } from "../lib/api";
import { formatBytes, formatDate, timeAgo } from "../lib/util";

export function PublishingTab({ project, processes, onPublished }: { project: Project; processes: Process[]; onPublished: (p: Project) => void }) {
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(project.publishedAt ? `${window.location.origin}/portal/${project.id}/` : null);
  const [frameKey, setFrameKey] = useState(0);
  const elapsed = useElapsed(busy);
  const steps = processes.reduce((n, p) => n + p.steps.length, 0);
  const translated = processes.reduce((n, p) => n + Object.keys(p.localizations ?? {}).length, 0);

  const publish = async () => {
    setBusy(true);
    try {
      const r = await api.publish(project.id);
      setUrl(r.url);
      setFrameKey((k) => k + 1);
      onPublished(await api.project(project.id));
      toast.success("Portal published", r.url, { label: "Open", onClick: () => window.open(r.url, "_blank") });
    } catch (e) {
      toast.error("Publish failed", e);
    } finally {
      setBusy(false);
    }
  };
  const zip = async () => {
    setZipBusy(true);
    try {
      const f = await download(`/api/projects/${project.id}/portal.zip`, `portal-${project.id}.zip`);
      toast.success("Download ready", `${f.name} · ${formatBytes(f.size)}`);
    } catch (e) {
      toast.error("Could not download the portal", e);
    } finally {
      setZipBusy(false);
    }
  };
  const portalPath = `/portal/${project.id}/`;
  const origin = window.location.origin;

  return (
    <div className="publish-layout">
      <div className="publish-main">
        <section className="card publish-hero">
          <div className="publish-hero-icon">
            <Icon name="globe" size={22} />
          </div>
          <div className="publish-hero-text">
            <div className="publish-hero-title">
              <h2>Learning portal</h2>
              {project.publishedAt ? (
                <Chip tone="success" dot>
                  Live
                </Chip>
              ) : (
                <Chip>Not published</Chip>
              )}
            </div>
            <p>
              A branded, searchable site with every process as a written guide, Show Me / Try Me / Test Me, downloads and in-app guidance, in {project.languages.length} language
              {project.languages.length === 1 ? "" : "s"}.
            </p>
            {project.publishedAt && (
              <p className="muted small">
                Last published {timeAgo(project.publishedAt)} · {formatDate(project.publishedAt)}
              </p>
            )}
          </div>
          <div className="publish-hero-actions">
            <Button variant="primary" icon="rocket" onClick={publish} loading={busy} data-testid="publish">
              {busy ? `Publishing… ${elapsed}s` : project.publishedAt ? "Republish" : "Publish portal"}
            </Button>
          </div>
        </section>

        {url ? (
          <section className="card portal-preview">
            <div className="browser-bar">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <a className="browser-url" href={portalPath} target="_blank" rel="noreferrer" data-testid="portal-url">
                <Icon name="lock" size={12} />
                {url}
              </a>
              <Button size="sm" variant="ghost" icon="external" onClick={() => window.open(portalPath, "_blank")}>
                Open
              </Button>
              <Button size="sm" variant="ghost" icon="download" onClick={zip} loading={zipBusy}>
                portal.zip
              </Button>
            </div>
            <iframe key={frameKey} title="Portal preview" src={portalPath} className="portal-frame" />
          </section>
        ) : (
          <section className="card portal-placeholder">
            <div className="placeholder-art">
              <span />
              <span />
              <span />
            </div>
            <h3>Your portal is not published yet</h3>
            <p className="muted">Publishing builds a static site you can host anywhere or use straight from this server.</p>
          </section>
        )}
      </div>

      <aside className="publish-side">
        <section className="card side-card">
          <h3>What gets published</h3>
          <dl className="stat-list">
            <div>
              <dt>Processes</dt>
              <dd>{processes.length}</dd>
            </div>
            <div>
              <dt>Steps</dt>
              <dd>{steps}</dd>
            </div>
            <div>
              <dt>Languages</dt>
              <dd>{project.languages.map((l) => l.toUpperCase()).join(" · ")}</dd>
            </div>
            <div>
              <dt>Translations</dt>
              <dd>{translated}</dd>
            </div>
          </dl>
        </section>
        <section className="card side-card">
          <h3>Host it yourself</h3>
          <p className="muted small">Download the static site and upload it to any web server, SharePoint or an intranet.</p>
          <Button icon="download" onClick={zip} loading={zipBusy} disabled={!project.publishedAt} data-testid="portal-zip">
            Download portal.zip
          </Button>
        </section>
        <section className="card side-card">
          <h3>In-app guidance</h3>
          <p className="muted small">Add Assist to your application so learners get step-by-step help right on the live screen.</p>
          <CodeLine text={`<script src="${origin}/lib/assist.js"></script>`} />
        </section>
      </aside>
    </div>
  );
}
