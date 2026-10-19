// Steplight Recorder popup: guides recorded on the current page ("Guide me"), server setting,
// project/process choice (or a new process), Start/Stop recording with a live step counter.
/// <reference path="./lib/chrome.d.ts" />
import { SAME_PAGE, startGuide, type LookupRow } from "./lib/guide.js";
import { $, api, esc, getAccessKey, getServerUrl, send, setAccessKey, setServerUrl, type RecState } from "./lib/shared.js";

interface ProjectRow { id: string; name: string; processCount: number; languages: string[] }
interface ProcessRow { id: string; title: string; chapter?: string; steps: unknown[] }

let server = "";
const NEW = "__new__";

/** "idle" is the recorder form, inside the collapsible Record section; a running recording and the
 * offline notice are shown at the top instead. */
function show(id: "idle" | "recording" | "offline") {
  $("#record").hidden = id !== "idle";
  $("#recording").hidden = id !== "recording";
  $("#offline").hidden = id !== "offline";
}

function setStatus(on: boolean | null) {
  const el = $("#status");
  el.className = "status" + (on === null ? "" : on ? " on" : " off");
  el.querySelector("span")!.textContent = on === null ? "…" : on ? "Connected" : "Offline";
}

function error(sel: string, msg: string) {
  const e = $(sel);
  e.textContent = msg;
  e.hidden = !msg;
}

/** The tab to record: ?tab=<id> (automation) or the active tab of the last focused window. */
async function targetTab(): Promise<{ id: number; windowId: number; url?: string }> {
  const fromQuery = Number(new URLSearchParams(location.search).get("tab"));
  if (fromQuery) return chrome.tabs.get(fromQuery);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function loadProcesses(projectId: string) {
  const sel = $("#process") as HTMLSelectElement;
  const procs = await api<ProcessRow[]>(server, `/projects/${projectId}/processes`);
  sel.innerHTML =
    `<option value="${NEW}">+ New process…</option>` +
    procs.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}${p.chapter ? " · " + esc(p.chapter) : ""} (${p.steps.length})</option>`).join("");
  const remembered = (await chrome.storage.local.get("lastProcess")).lastProcess;
  if (remembered && procs.some((p) => p.id === remembered)) sel.value = remembered;
  onProcessChange();
}

function onProcessChange() {
  const isNew = ($("#process") as HTMLSelectElement).value === NEW;
  $("#new-wrap").hidden = !isNew;
  $("#replace-wrap").hidden = isNew;
}

async function renderIdle() {
  show("idle");
  const projects = await api<ProjectRow[]>(server, "/projects");
  const sel = $("#project") as HTMLSelectElement;
  if (!projects.length) {
    sel.innerHTML = `<option value="">No projects yet</option>`;
    ($("#start") as HTMLButtonElement).disabled = true;
    error("#error", "Create a project in Steplight Studio first.");
    return;
  }
  sel.innerHTML = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.processCount})</option>`).join("");
  const remembered = (await chrome.storage.local.get("lastProject")).lastProject;
  if (remembered && projects.some((p) => p.id === remembered)) sel.value = remembered;
  await loadProcesses(sel.value);
}

/** Guides recorded on this page, with Guide me, above the recorder (the badge counts the same). */
async function renderGuides() {
  const box = $("#guides");
  box.hidden = true;
  const tab = await targetTab();
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  const rows = (await api<LookupRow[]>(server, `/lookup?url=${encodeURIComponent(tab.url)}`).catch(() => [] as LookupRow[])).filter((r) => r.relevance >= SAME_PAGE);
  if (!rows.length) return;
  $("#guides-head").textContent = rows.length === 1 ? "1 guide for this page" : `${rows.length} guides for this page`;
  $("#guides-list").innerHTML = rows
    .slice(0, 3)
    .map((r) => `<div class="card"><div><h2 title="${esc(r.title)}">${esc(r.title)}</h2><div class="meta">${r.steps} steps · ${esc(r.chapter || r.projectName)}</div></div><button class="btn primary" data-guide="${esc(r.id)}">Guide me</button></div>`)
    .join("");
  if (rows.length > 3) $("#guides-list").insertAdjacentHTML("beforeend", `<div class="hint" style="margin:-4px 0 10px">${rows.length - 3} more in the help panel</div>`);
  box.hidden = false;
}

async function guide(btn: HTMLButtonElement) {
  error("#guides-error", "");
  btn.disabled = true;
  try {
    const tab = await targetTab();
    const lang = String((await chrome.storage.local.get("guideLang")).guideLang || "en");
    const msg = await startGuide(server, tab.id, btn.dataset.guide!, lang);
    if (msg) throw new Error(msg);
    window.close();
  } catch (err) {
    error("#guides-error", (err as Error).message);
    btn.disabled = false;
  }
}

function renderRecording(st: RecState, err?: string) {
  show("recording");
  $("#guides").hidden = true;
  $("#rec-title").textContent = st.processTitle;
  $("#rec-count").textContent = String(st.stepCount);
  error("#rec-error", err ?? "");
}

async function start() {
  error("#error", "");
  const btn = $("#start") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const projectId = ($("#project") as HTMLSelectElement).value;
    let processId = ($("#process") as HTMLSelectElement).value;
    let title = ($("#process") as HTMLSelectElement).selectedOptions[0]?.textContent ?? "";
    const tab = await targetTab();
    if (processId === NEW) {
      title = ($("#new-title") as HTMLInputElement).value.trim() || "New process";
      const chapter = ($("#new-chapter") as HTMLInputElement).value.trim() || undefined;
      const created = await api<{ id: string; title: string }>(server, `/projects/${projectId}/processes`, {
        method: "POST",
        body: JSON.stringify({ title, chapter, startUrl: tab.url }),
      });
      processId = created.id;
    }
    await chrome.storage.local.set({ lastProject: projectId, lastProcess: processId });
    const r = await send<{ state?: RecState; error?: string }>({
      type: "steplight:start",
      serverUrl: server,
      processId,
      processTitle: title.replace(/\s*\(\d+\)$/, ""),
      projectId,
      tabId: tab.id,
      replace: ($("#replace") as HTMLInputElement).checked,
    });
    if (r?.error || !r?.state) throw new Error(r?.error ?? "could not start");
    renderRecording(r.state);
  } catch (err) {
    error("#error", (err as Error).message);
  } finally {
    btn.disabled = false;
  }
}

async function stopRec() {
  ($("#stop") as HTMLButtonElement).disabled = true;
  await send({ type: "steplight:stop" });
  ($("#stop") as HTMLButtonElement).disabled = false;
  await init();
}

async function init() {
  server = await getServerUrl();
  ($("#record") as HTMLDetailsElement).open = !!(await chrome.storage.local.get("recordOpen")).recordOpen;
  ($("#server") as HTMLInputElement).value = server;
  ($("#access-key") as HTMLInputElement).value = await getAccessKey();
  ($("#open-studio") as HTMLAnchorElement).href = server + "/studio/";
  setStatus(null);
  try {
    await api(server, "/health");
    setStatus(true);
  } catch {
    setStatus(false);
    show("offline");
    ($("#settings") as HTMLDetailsElement).open = true;
    return;
  }
  const r = await send<{ state: RecState | null; error?: string }>({ type: "steplight:state" });
  if (r?.state) renderRecording(r.state, r.error);
  else {
    void renderGuides();
    await renderIdle().catch((err) => {
      error("#error", (err as Error).message);
      if (/access key/i.test((err as Error).message)) ($("#settings") as HTMLDetailsElement).open = true;
    });
  }
}

$("#guides-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-guide]");
  if (b) void guide(b);
});
$("#record").addEventListener("toggle", () => void chrome.storage.local.set({ recordOpen: ($("#record") as HTMLDetailsElement).open }));
$("#project").addEventListener("change", (e) => void loadProcesses((e.target as HTMLSelectElement).value));
$("#process").addEventListener("change", onProcessChange);
$("#start").addEventListener("click", () => void start());
$("#stop").addEventListener("click", () => void stopRec());
$("#save-server").addEventListener("click", async () => {
  await setServerUrl(($("#server") as HTMLInputElement).value);
  await setAccessKey(($("#access-key") as HTMLInputElement).value);
  await init();
});
$("#open-panel").addEventListener("click", async () => {
  const tab = await targetTab();
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    error("#error", (err as Error).message);
  }
});
chrome.runtime.onMessage.addListener((msg: { type: string; stepCount: number; recording: boolean; error?: string }) => {
  if (msg.type !== "steplight:count") return;
  if (!msg.recording) return void init();
  $("#rec-count").textContent = String(msg.stepCount);
  error("#rec-error", msg.error ?? "");
});

void init();
