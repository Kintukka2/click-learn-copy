import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AiStatus, type ProjectSummary } from "./api";

interface StudioState {
  projects: ProjectSummary[] | null;
  projectsError: string | null;
  refreshProjects: () => Promise<void>;
  ai: AiStatus | null;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  /** Project of the page being shown (sidebar highlighting). */
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

const Ctx = createContext<StudioState | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectsError, setErr] = useState<string | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.projects();
      list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      setProjects(list);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
      setProjects((p) => p ?? []);
    }
  }, []);
  useEffect(() => {
    void refreshProjects();
    api.aiStatus().then(setAi, () => setAi({ provider: "offline", model: null }));
  }, [refreshProjects]);
  return <Ctx.Provider value={{ projects, projectsError, refreshProjects, ai, helpOpen, setHelpOpen, activeProjectId, setActiveProjectId }}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioState {
  const c = useContext(Ctx);
  if (!c) throw new Error("StudioProvider missing");
  return c;
}
