// Steplight Recorder: content script. Bundles the capture library (src/capture) and, while the
// background says this tab is being recorded, streams CaptureEvents to it. Shows a small
// "Recording" indicator in the page (marked data-steplight-ignore so it is never recorded).
/// <reference path="./lib/chrome.d.ts" />
import { start, stop, isRecording } from "../src/capture/capture.js";

declare global {
  interface Window {
    __steplightContent?: boolean;
  }
}

const PILL_ID = "steplight-recording-indicator";

function pillHtml(count: number) {
  const steps = count === 1 ? "1 step" : `${count} steps`;
  return (
    '<span style="width:9px;height:9px;border-radius:50%;background:#f04438;box-shadow:0 0 0 3px rgba(240,68,56,.25);animation:slpulse 1.4s infinite"></span>' +
    `<span style="font-weight:600">Recording</span><span style="opacity:.75" data-count>${steps}</span>` +
    '<button type="button" data-stop style="all:unset;cursor:pointer;margin-left:6px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.14);font-weight:600">Stop</button>'
  );
}

function showPill(count: number) {
  const mount = () => {
    let el = document.getElementById(PILL_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = PILL_ID;
      el.setAttribute("data-steplight-ignore", "");
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;" +
        "padding:7px 8px 7px 14px;border-radius:999px;background:#101828;color:#fff;font:13px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
      const style = document.createElement("style");
      style.textContent = "@keyframes slpulse{0%,100%{opacity:1}50%{opacity:.35}}";
      el.appendChild(style);
      const inner = document.createElement("span");
      inner.style.cssText = "display:flex;align-items:center;gap:8px";
      el.appendChild(inner);
      el.addEventListener("click", (e) => {
        if ((e.target as Element).closest("[data-stop]")) void chrome.runtime.sendMessage({ type: "steplight:stop" });
      });
      document.documentElement.appendChild(el);
    }
    (el.lastElementChild as HTMLElement).innerHTML = pillHtml(count);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}

function updatePill(count: number) {
  const c = document.querySelector(`#${PILL_ID} [data-count]`);
  if (c) c.textContent = count === 1 ? "1 step" : `${count} steps`;
}

function hidePill() {
  document.getElementById(PILL_ID)?.remove();
}

function begin(count: number) {
  if (!isRecording()) {
    start(
      (ev) => {
        chrome.runtime.sendMessage({ type: "steplight:event", event: ev }).catch(() => undefined);
      },
      {
        onFieldFocus: (target) => {
          chrome.runtime.sendMessage({ type: "steplight:focus", target }).catch(() => undefined);
        },
      },
    );
  }
  showPill(count);
}

function end() {
  stop();
  hidePill();
}

if (!window.__steplightContent && window.top === window) {
  window.__steplightContent = true;
  chrome.runtime.onMessage.addListener((msg: { type: string; stepCount?: number; recording?: boolean }) => {
    if (msg.type === "steplight:start") begin(msg.stepCount ?? 0);
    else if (msg.type === "steplight:stop") end();
    else if (msg.type === "steplight:count") {
      if (msg.recording === false) end();
      else updatePill(msg.stepCount ?? 0);
    }
  });
  // after a navigation the new page asks whether this tab is still being recorded
  chrome.runtime
    .sendMessage({ type: "steplight:hello" })
    .then((r: { recording?: boolean; stepCount?: number } | undefined) => {
      if (r?.recording) begin(r.stepCount ?? 0);
    })
    .catch(() => undefined);
}

export {};
