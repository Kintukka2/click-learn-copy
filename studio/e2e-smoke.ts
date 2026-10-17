// Studio smoke test: drives the main authoring flow in Chromium against a running Steplight server.
//   STUDIO_URL=http://localhost:4204/studio/ npx tsx studio/e2e-smoke.ts
// Optional: SMOKE_SHOTS=<dir> saves screenshots of each screen, HEADED=1 shows the browser.
// Exits non-zero when a step of the flow fails or the page throws an uncaught error.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const STUDIO_URL = (process.env.STUDIO_URL ?? "http://localhost:4204/studio/").replace(/\/?$/, "/");
const ORIGIN = new URL(STUDIO_URL).origin;
const SHOTS = process.env.SMOKE_SHOTS;
const FIXTURE_MEDIA = path.resolve("tests/fixtures/out/media");
const FIXTURE_PROCESS = path.resolve("tests/fixtures/out/process.json");

let stepNo = 0;
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  stepNo++;
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`  ok ${String(stepNo).padStart(2)}  ${name} (${Date.now() - t0} ms)`);
    return r;
  } catch (e) {
    console.error(`  FAIL ${stepNo}  ${name}: ${(e as Error).message}`);
    throw e;
  }
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function api<T>(method: string, p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${ORIGIN}/api${p}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Seed recorded steps through the real recording API (fixture screenshots when available). */
async function seedSteps(page: Page, processId: string) {
  type FxStep = { action: string; target?: unknown; value?: string; optionValue?: string; sensitive?: boolean; url: string; screenshot?: string; viewport?: { width: number; height: number } };
  let steps: FxStep[] = [];
  if (fs.existsSync(FIXTURE_PROCESS)) steps = (JSON.parse(fs.readFileSync(FIXTURE_PROCESS, "utf8")) as { steps: FxStep[] }).steps;
  if (!steps.length) {
    steps = [
      { action: "click", target: { tag: "button", role: "button", name: "New", selectors: [{ kind: "role", value: "button|New" }], bbox: { x: 40, y: 40, width: 120, height: 36 } }, url: `${ORIGIN}/demo-erp/#/customers` },
      { action: "type", target: { tag: "input", role: "textbox", name: "Customer name", label: "Customer name", selectors: [{ kind: "label", value: "Customer name" }], bbox: { x: 40, y: 120, width: 400, height: 36 } }, value: "Contoso Ltd", url: `${ORIGIN}/demo-erp/#/customers/new` },
      { action: "click", target: { tag: "button", role: "button", name: "Save", selectors: [{ kind: "role", value: "button|Save" }], bbox: { x: 40, y: 200, width: 90, height: 36 } }, url: `${ORIGIN}/demo-erp/#/customers/new` },
    ];
  }
  const fallbackShot = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
  const session = await api<{ token: string }>("POST", "/recordings", { processId, replace: true });
  let t = Date.now();
  for (const s of steps) {
    const file = s.screenshot && path.join(FIXTURE_MEDIA, s.screenshot);
    const screenshotDataUrl = file && fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString("base64")}` : fallbackShot;
    const event = { action: s.action, target: s.target, value: s.value, optionValue: s.optionValue, sensitive: s.sensitive, url: s.url, viewport: s.viewport ?? { width: 1280, height: 800 }, timestamp: (t += 1500) };
    await api("POST", `/recordings/${session.token}/events`, { event, screenshotDataUrl });
  }
  await api("POST", `/recordings/${session.token}/stop`);
  return steps.length;
}

async function waitToast(page: Page, timeout = 120_000): Promise<{ kind: string; text: string }> {
  const t = page.locator(".toast").last();
  await t.waitFor({ timeout });
  const cls = (await t.getAttribute("class")) ?? "";
  return { kind: cls.includes("toast-error") ? "error" : cls.includes("toast-success") ? "success" : "info", text: (await t.innerText()).replace(/\s+/g, " ") };
}

async function main() {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const projectName = `Smoke test ${stamp}`;
  let projectId = "";

  try {
    console.log(`Steplight Studio smoke test against ${STUDIO_URL}`);
    await step("Projects home loads", async () => {
      await page.goto(STUDIO_URL);
      await page.getByRole("heading", { name: "Projects", level: 1 }).waitFor();
      await page.locator(".skeleton").first().waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
      await shot(page, "01-projects-home");
    });

    await step("Create a project", async () => {
      await page.getByTestId("new-project").first().click();
      await page.getByLabel("Name").fill(projectName);
      await page.getByLabel("Description").fill("Created by the Studio smoke test.");
      await page.locator(".lang-option", { hasText: "Danish" }).click();
      await page.locator(".lang-option", { hasText: "German" }).click();
      await page.getByTestId("create-project").click();
      await page.getByRole("heading", { name: projectName, level: 1 }).waitFor();
      projectId = page.url().split("/projects/")[1]?.split(/[/?]/)[0] ?? "";
      if (!projectId) throw new Error(`no project id in ${page.url()}`);
    });

    const processId = await step("Create a process", async () => {
      await page.getByTestId("new-process").click();
      await page.getByLabel("Title").fill("Create a new customer");
      await page.getByLabel("Chapter").fill("Sales");
      await page.getByLabel("Application").fill("Northwind ERP");
      await page.getByLabel("Start URL").fill("/demo-erp/#/customers");
      await page.getByTestId("create-process").click();
      await page.waitForURL(/\/processes\//);
      await page.getByTestId("process-title").waitFor();
      return page.url().split("/processes/")[1].split(/[/?]/)[0];
    });

    await step("Seed recorded steps via the recording API", async () => {
      const n = await seedSteps(page, processId);
      await page.reload();
      await page.getByTestId("step-item").first().waitFor();
      const count = await page.getByTestId("step-item").count();
      if (count !== n) throw new Error(`expected ${n} steps, found ${count}`);
    });

    await step("Select a step and edit its instruction", async () => {
      await page.getByTestId("step-item").nth(1).click();
      await page.getByTestId("inspector").getByText("Step 2", { exact: true }).waitFor();
      await page.keyboard.press("ArrowDown");
      await page.getByTestId("inspector").getByText("Step 3", { exact: true }).waitFor();
      await page.keyboard.press("ArrowUp");
      await page.getByTestId("inspector").getByText("Step 2", { exact: true }).waitFor();
      const title = page.getByTestId("title-input");
      await title.fill("Pick **Denmark** in the Country list.");
      await title.press("Tab");
      await page.getByTestId("step-item").nth(1).getByText("Denmark").waitFor();
      await page.getByTestId("reset-title").waitFor();
      const saved = await api<{ steps: { title: string; titleEdited?: boolean }[] }>("GET", `/processes/${processId}`);
      if (saved.steps[1].title !== "Pick **Denmark** in the Country list." || !saved.steps[1].titleEdited) throw new Error("title was not saved");
      await shot(page, "03-process-editor");
    });

    await step("Drag the highlight box", async () => {
      const box = page.getByTestId("hl-box");
      if (!(await box.count())) return;
      const before = await api<{ steps: { target?: { bbox: { x: number } } }[] }>("GET", `/processes/${processId}`);
      await box.scrollIntoViewIfNeeded();
      const b = (await box.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10, { steps: 5 });
      await page.mouse.up();
      let x = before.steps[1].target?.bbox.x;
      for (let i = 0; i < 20 && x === before.steps[1].target?.bbox.x; i++) {
        await page.waitForTimeout(250);
        x = (await api<{ steps: { target?: { bbox: { x: number } } }[] }>("GET", `/processes/${processId}`)).steps[1].target?.bbox.x;
      }
      if (x === before.steps[1].target?.bbox.x) throw new Error(`bbox not updated (x=${x})`);
    });

    await step("Switch content language to Danish and back", async () => {
      await page.getByTestId("lang-switch").click();
      await page.getByRole("menuitem", { name: /Dansk/ }).click();
      await page.waitForURL(/lang=da/);
      await page.getByTestId("inspector").getByText("Danish text").waitFor();
      await shot(page, "04-editor-danish");
      await page.getByTestId("lang-switch").click();
      await page.getByRole("menuitem", { name: /English/ }).click();
      await page.waitForURL((u) => !u.search.includes("lang="));
    });

    await step("Open the Show Me / Try Me / Test Me preview", async () => {
      await page.getByTestId("preview").click();
      const dialog = page.locator(".preview-dialog");
      await dialog.waitFor();
      await Promise.race([
        page.locator("[data-testid=player-host] > *").first().waitFor({ timeout: 15_000 }),
        dialog.getByText("Preview unavailable").waitFor({ timeout: 15_000 }),
      ]);
      await page.waitForTimeout(800);
      await shot(page, "05-preview-show");
      await page.getByTestId("mode-try").click();
      await page.waitForTimeout(500);
      await page.getByTestId("mode-test").click();
      await page.waitForTimeout(500);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    });

    await step("Export an HTML guide", async () => {
      await page.getByTestId("export").click();
      await page.getByRole("menuitem", { name: /HTML guide/ }).click();
      const t = await waitToast(page, 120_000);
      console.log(`       → ${t.kind}: ${t.text}`);
      await page.locator(".toast-close").last().click().catch(() => undefined);
    });

    await step("Publish the portal", async () => {
      await page.goto(`${STUDIO_URL}projects/${projectId}/publishing`);
      await page.getByTestId("publish").click();
      const t = await waitToast(page, 180_000);
      console.log(`       → ${t.kind}: ${t.text}`);
      if (t.kind === "success") await page.getByTestId("portal-url").waitFor();
      await page.waitForTimeout(1200);
      await shot(page, "06-publishing");
    });

    await step("Project processes, analytics and settings tabs render", async () => {
      await page.goto(`${STUDIO_URL}projects/${projectId}`);
      await page.getByTestId("process-row").first().waitFor();
      await shot(page, "02-project-page");
      await page.getByRole("tab", { name: /Analytics/ }).click();
      await page.getByTestId("kpi").first().waitFor();
      await shot(page, "07-analytics");
      await page.getByRole("tab", { name: /Settings/ }).click();
      await page.getByLabel("Project name").waitFor();
    });

    if (pageErrors.length) throw new Error(`uncaught page errors: ${pageErrors.join(" | ")}`);
    console.log("PASS: studio smoke test");
  } finally {
    if (projectId && !process.env.KEEP) await api("DELETE", `/projects/${projectId}`).catch(() => undefined);
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`FAIL: ${(e as Error).message}`);
  process.exit(1);
});
