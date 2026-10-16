// CONTRACT (implemented by the capture/replay workstream): scripted demo recordings against the
// bundled Northwind ERP demo app, so the whole pipeline can run headlessly without a human.
export interface ScriptedAction {
  action: "click" | "type" | "select" | "check" | "press";
  /** Playwright locator description, e.g. { role: "button", name: "Save" } or { label: "Customer name" } or { css: "#x" }. */
  locator: { role?: string; name?: string; label?: string; css?: string; text?: string; testid?: string };
  value?: string;
}

export interface DemoScenario {
  id: string;
  title: string;
  chapter: string;
  description: string;
  /** Path relative to the server root, e.g. "/demo-erp/#/customers". */
  startPath: string;
  actions: ScriptedAction[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [];
