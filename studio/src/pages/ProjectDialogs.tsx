import { useEffect, useState } from "react";
import type { Project } from "../../../src/core/model";
import { Icon } from "../components/Icon";
import { Button, Dialog, Field, Spinner, toast, useElapsed } from "../components/ui";
import { api } from "../lib/api";
import { cx, SUPPORTED_LANGS } from "../lib/util";

/** Multi-select of SUPPORTED_LANGS. The first selected language is the source language. */
export function LanguagePicker({ value, onChange, lockSource }: { value: string[]; onChange: (v: string[]) => void; lockSource?: boolean }) {
  const toggle = (code: string) => {
    if (value.includes(code)) {
      if (lockSource && value[0] === code) return;
      if (value.length === 1) return;
      onChange(value.filter((c) => c !== code));
    } else onChange([...value, code]);
  };
  return (
    <div className="lang-picker" role="group" aria-label="Languages">
      {SUPPORTED_LANGS.map((l) => {
        const on = value.includes(l.code);
        const isSource = value[0] === l.code;
        return (
          <button
            type="button"
            key={l.code}
            className={cx("lang-option", on && "is-on", isSource && "is-source")}
            aria-pressed={on}
            onClick={() => toggle(l.code)}
            title={isSource ? "Source language (recording language)" : undefined}
          >
            <span className="lang-check">{on && <Icon name="check" size={12} strokeWidth={2.6} />}</span>
            <span className="lang-code">{l.code.toUpperCase()}</span>
            <span className="lang-name">{l.name}</span>
            {isSource && <span className="lang-source">Source</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ColorField({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="color-field">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#2f6fed"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} />
        <input id={id} className="input mono" value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
    </Field>
  );
}

export function NewProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [color, setColor] = useState("#2f6fed");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setLanguages(["en"]);
      setColor("#2f6fed");
    }
  }, [open]);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject({ name: name.trim(), description: description.trim(), languages, branding: { companyName: name.trim(), primaryColor: color, accentColor: "#14b8a6" } });
      toast.success("Project created", p.name);
      onClose();
      onCreated(p);
    } catch (e) {
      toast.error("Could not create project", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="A project groups processes into one learning portal."
      icon="folder"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()} data-testid="create-project">
            Create project
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
        <Field label="Name" htmlFor="np-name">
          <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance onboarding" autoComplete="off" />
        </Field>
        <Field label="Description" htmlFor="np-desc" hint="Shown on the portal home page.">
          <textarea id="np-desc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will learners find here?" />
        </Field>
        <Field label="Languages" hint="The first language you select is the source language you record in.">
          <LanguagePicker value={languages} onChange={setLanguages} />
        </Field>
        <ColorField label="Brand colour" id="np-color" value={color} onChange={setColor} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

const SAMPLE_STAGES = [
  { at: 0, label: "Creating project and processes" },
  { at: 3, label: "Launching headless Chromium" },
  { at: 7, label: "Recording demo scenarios in Northwind ERP" },
  { at: 25, label: "Capturing screenshots and writing instructions" },
  { at: 55, label: "Finishing up" },
];

export function SampleProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en", "da", "de"]);
  const elapsed = useElapsed(state === "running");
  useEffect(() => {
    if (open) {
      setState("idle");
      setError("");
    }
  }, [open]);
  const run = async () => {
    setState("running");
    try {
      const p = await api.demoProject({ languages });
      toast.success("Sample project ready", `${p.processIds.length} processes recorded`);
      onClose();
      onCreated(p);
    } catch (e) {
      setError((e as Error).message);
      setState("error");
      toast.error("Sample project failed", e);
    }
  };
  const stageIdx = SAMPLE_STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={state !== "running"}
      title="Create sample project"
      description="Steplight drives the bundled Northwind ERP demo app and records a set of real business processes."
      icon="sparkles"
      width={540}
      footer={
        state === "running" ? (
          <span className="muted">This usually takes 30–90 seconds. Keep this tab open.</span>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={state === "error" ? "refresh" : "sparkles"} onClick={run} data-testid="run-sample">
              {state === "error" ? "Try again" : "Create sample project"}
            </Button>
          </>
        )
      }
    >
      {state === "idle" && (
        <div className="form-stack">
          <div className="sample-includes">
            <div>
              <Icon name="layers" size={16} />
              Recorded processes with screenshots
            </div>
            <div>
              <Icon name="languages" size={16} />
              Localized instructions
            </div>
            <div>
              <Icon name="globe" size={16} />
              Ready to publish as a portal
            </div>
          </div>
          <Field label="Languages">
            <LanguagePicker value={languages} onChange={setLanguages} lockSource />
          </Field>
        </div>
      )}
      {state === "running" && (
        <div className="progress-panel" data-testid="sample-progress">
          <div className="progress-bar indeterminate">
            <span />
          </div>
          <ul className="stage-list">
            {SAMPLE_STAGES.map((s, i) => (
              <li key={s.label} className={cx(i < stageIdx && "is-done", i === stageIdx && "is-current")}>
                <span className="stage-icon">{i < stageIdx ? <Icon name="check" size={12} strokeWidth={2.6} /> : i === stageIdx ? <Spinner size={12} /> : null}</span>
                {s.label}
              </li>
            ))}
          </ul>
          <div className="elapsed mono">{elapsed}s elapsed</div>
        </div>
      )}
      {state === "error" && (
        <div className="callout callout-danger">
          <Icon name="alert" size={16} />
          <div>
            <strong>The sample could not be created.</strong>
            <div className="mono small">{error}</div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
