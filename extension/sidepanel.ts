// Steplight side panel ("User eXperience Panel"): lists the processes relevant to the page in the
// active tab (/api/lookup?url=) and starts in-app guidance ("Guide me") by injecting the Assist
// library (served by the Steplight server at /lib/assist.js) into the tab.
/// <reference path="./lib/chrome.d.ts" />
import { SAME_PAGE, startGuide, type LookupRow } from "./lib/guide.js";
import { $, api, esc, getServerUrl } from "./lib/shared.js";

let server = "";
let currentTab: { id: number; url?: string; windowId: number } | null = null;
let rows: LookupRow[] = [];

function error(msg: string) {
  const e = $("#error");
  e.textContent = msg;
  e.hidden = !msg;
}

async function activeTab() {
  const pinned = Number(new URLSearchParams(location.search).get("tab")); // automation: ?tab=<id>
  if (pinned) return (await chrome.tabs.get(pinned).catch(() => undefined)) as { id: number; url?: string; windowId: number } | undefined;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab as { id: number; url?: string; windowId: number } | undefined;
}

function render() {
  const list = $("#list");
  if (!rows.length) {
    list.innerHTML = '<div class="empty">No guides for this page yet.</div>';
    return;
  }
  list.innerHTML = rows
    .map(
      (r, i) =>
        `<div class="card${r.relevance >= SAME_PAGE && i === 0 ? " best" : ""}">` +
        `<div class="chapter">${esc(r.chapter || r.projectName)}</div>` +
        `<h2>${esc(r.title)}</h2>` +
        `<div class="meta">${r.steps} steps · ${esc(r.projectName)}</div>` +
        `<div class="actions"><button class="btn primary" data-guide="${esc(r.id)}">Guide me</button>` +
        `<button class="btn" data-open="${esc(r.projectId)}">Open portal</button></div></div>`,
    )
    .join("");
}

async function refresh() {
  error("");
  currentTab = (await activeTab()) ?? null;
  const url = currentTab?.url ?? "";
  $("#url").textContent = url || "(no page)";
  if (!url || !/^https?:/.test(url)) {
    rows = [];
    render();
    return;
  }
  try {
    rows = await api<LookupRow[]>(server, `/lookup?url=${encodeURIComponent(url)}`);
    render();
  } catch (err) {
    rows = [];
    $("#list").innerHTML = `<div class="empty">Cannot reach the Steplight server at ${esc(server)}.</div>`;
    error((err as Error).message);
  }
}

async function guide(processId: string) {
  error("");
  if (!currentTab) return;
  const lang = ($("#lang") as HTMLSelectElement).value || "en";
  try {
    error(await startGuide(server, currentTab.id, processId, lang));
  } catch (err) {
    error((err as Error).message);
  }
}

async function init() {
  server = await getServerUrl();
  const langSel = $("#lang") as HTMLSelectElement;
  const saved = (await chrome.storage.local.get("guideLang")).guideLang ?? (navigator.language || "en").slice(0, 2);
  try {
    const langs = await api<{ code: string; native: string }[]>(server, "/languages");
    langSel.innerHTML = langs.map((l) => `<option value="${esc(l.code)}">${esc(l.native)}</option>`).join("");
  } catch {
    langSel.innerHTML = '<option value="en">English</option>';
  }
  langSel.value = saved;
  if (!langSel.value) langSel.value = "en";
  langSel.addEventListener("change", () => void chrome.storage.local.set({ guideLang: langSel.value }));
  await refresh();
}

$("#list").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const g = t.closest("[data-guide]");
  if (g) return void guide(g.getAttribute("data-guide")!);
  const o = t.closest("[data-open]");
  if (o) void chrome.tabs.create({ url: `${server}/portal/${o.getAttribute("data-open")}/` });
});

chrome.tabs.onActivated.addListener(() => void refresh());
chrome.tabs.onUpdated.addListener((_id: number, info: { url?: string; status?: string }) => {
  if (info.url || info.status === "complete") void refresh();
});
chrome.storage.onChanged.addListener((changes: Record<string, unknown>) => {
  if (changes.serverUrl) void init();
});

void init();
