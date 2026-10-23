// The Steplight browser extension, seen from the Studio: its content script relays these window
// messages to it, and it answers only Studio pages of the server it is connected to.

let seq = 0;

function ask<T>(msg: Record<string, unknown>, timeout: number): Promise<T | null> {
  return new Promise((resolve) => {
    const id = `studio-${Date.now()}-${++seq}`;
    const done = (r: T | null) => {
      window.removeEventListener("message", on);
      clearTimeout(timer);
      resolve(r);
    };
    const on = (e: MessageEvent) => {
      if (e.source === window && e.data?.source === "steplight-extension" && e.data.id === id) done(e.data as T);
    };
    const timer = setTimeout(() => done(null), timeout);
    window.addEventListener("message", on);
    window.postMessage({ ...msg, source: "steplight-studio", id }, window.location.origin);
  });
}

/** The extension's version, or null when it isn't installed, is older than 0.7 or is connected to another server. */
export async function extensionVersion(): Promise<string | null> {
  return (await ask<{ extension?: string }>({ type: "ping" }, 1000))?.extension ?? null;
}

/**
 * "Finalise the guide": the extension opens the process's start page in a new tab and shows each draft
 * step there; what the author does is recorded, with the screen and the element. Resolves once it runs.
 */
export async function finaliseGuide(processId: string): Promise<{ ok?: boolean; error?: string }> {
  return (await ask<{ ok?: boolean; error?: string }>({ type: "finalise", processId }, 60_000)) ?? { error: "The Steplight extension didn't answer." };
}
