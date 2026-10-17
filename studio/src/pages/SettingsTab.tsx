import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, confirmDialog, Field, toast } from "../components/ui";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { useStudio } from "../lib/store";
import { initials, readFileAsDataUrl } from "../lib/util";
import { ColorField, LanguagePicker } from "./ProjectDialogs";

export function SettingsTab({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const { refreshProjects } = useStudio();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [languages, setLanguages] = useState(project.languages);
  const [company, setCompany] = useState(project.branding.companyName ?? "");
  const [primary, setPrimary] = useState(project.branding.primaryColor ?? "#2f6fed");
  const [accent, setAccent] = useState(project.branding.accentColor ?? "#14b8a6");
  const [logo, setLogo] = useState<string | undefined>(project.branding.logoDataUrl || undefined);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setLanguages(project.languages);
    setCompany(project.branding.companyName ?? "");
    setPrimary(project.branding.primaryColor ?? "#2f6fed");
    setAccent(project.branding.accentColor ?? "#14b8a6");
    setLogo(project.branding.logoDataUrl || undefined);
  }, [project]);

  const dirty =
    name !== project.name ||
    description !== (project.description ?? "") ||
    languages.join() !== project.languages.join() ||
    company !== (project.branding.companyName ?? "") ||
    primary !== project.branding.primaryColor ||
    accent !== (project.branding.accentColor ?? "#14b8a6") ||
    (logo || "") !== (project.branding.logoDataUrl || "");

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      const p = await api.updateProject(project.id, {
        name: name.trim(),
        description,
        languages,
        branding: { companyName: company, primaryColor: primary, accentColor: accent, logoDataUrl: logo ?? "" },
      });
      onSaved(p);
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Could not save settings", e);
    } finally {
      setBusy(false);
    }
  };
  const onLogo = async (f?: File) => {
    if (!f) return;
    if (f.size > 1024 * 1024) return toast.error("Logo too large", "Use an image under 1 MB.");
    setLogo(await readFileAsDataUrl(f));
  };
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete “${project.name}”?`, message: "This permanently removes every process, screenshot, translation and the published portal. This cannot be undone.", confirmLabel: "Delete project", danger: true }))) return;
    try {
      await api.deleteProject(project.id);
      toast.success("Project deleted");
      await refreshProjects();
      navigate("/");
    } catch (e) {
      toast.error("Could not delete project", e);
    }
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <div className="settings-label">
          <h3>General</h3>
          <p>Name and description appear on the portal and in exported documents.</p>
        </div>
        <div className="card settings-card form-stack">
          <Field label="Project name" htmlFor="st-name">
            <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="st-desc">
            <textarea id="st-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <h3>Languages</h3>
          <p>
            Processes are recorded in the source language (<strong>{languages[0]?.toUpperCase()}</strong>). Other languages are produced with Translate.
          </p>
        </div>
        <div className="card settings-card">
          <LanguagePicker value={languages} onChange={setLanguages} lockSource />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-label">
          <h3>Branding</h3>
          <p>Applied to the portal, players, documents and in-app guidance.</p>
        </div>
        <div className="card settings-card">
          <div className="branding-grid">
            <div className="form-stack">
              <Field label="Company name" htmlFor="st-company">
                <input id="st-company" className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <div className="form-grid-2">
                <ColorField id="st-primary" label="Primary colour" value={primary} onChange={setPrimary} />
                <ColorField id="st-accent" label="Accent colour" value={accent} onChange={setAccent} />
              </div>
              <Field label="Logo" hint="PNG or SVG, square works best, under 1 MB.">
                <div className="logo-field">
                  <span className="logo-preview">{logo ? <img src={logo} alt="Logo preview" /> : <Icon name="image" size={18} />}</span>
                  <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                    Upload logo
                  </Button>
                  {logo && (
                    <Button size="sm" variant="ghost" onClick={() => setLogo(undefined)}>
                      Remove
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onLogo(e.target.files?.[0])} />
                </div>
              </Field>
            </div>
            <div className="brand-preview" aria-label="Branding preview">
              <div className="brand-preview-bar" style={{ background: primary }}>
                <span className="brand-preview-logo">{logo ? <img src={logo} alt="" /> : initials(company || name)}</span>
                <span>{company || name}</span>
              </div>
              <div className="brand-preview-body">
                <div className="bp-line w60" />
                <div className="bp-line w90" />
                <div className="bp-line w75" />
                <div className="bp-actions">
                  <span className="bp-btn" style={{ background: primary }}>
                    Show me
                  </span>
                  <span className="bp-btn outline" style={{ color: accent, borderColor: accent }}>
                    Try me
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={dirty ? "settings-save is-dirty" : "settings-save"}>
        <span className="muted small">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
        <Button variant="primary" icon="check" onClick={save} loading={busy} disabled={!dirty} data-testid="save-settings">
          Save changes
        </Button>
      </div>

      <section className="settings-section">
        <div className="settings-label">
          <h3>Danger zone</h3>
          <p>Deleting a project cannot be undone.</p>
        </div>
        <div className="card settings-card danger-card">
          <div>
            <strong>Delete this project</strong>
            <p className="muted small">Removes all processes, media and the published portal.</p>
          </div>
          <Button variant="danger" icon="trash" onClick={del}>
            Delete project
          </Button>
        </div>
      </section>
    </div>
  );
}
