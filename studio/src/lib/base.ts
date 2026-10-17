// Where Steplight is mounted, e.g. "" or "/steplight". The server injects window.STEPLIGHT_BASE into index.html.
export const ROOT: string = (((window as unknown as { STEPLIGHT_BASE?: string }).STEPLIGHT_BASE ?? "") as string).replace(/\/+$/, "");

/** Prefix a root-relative server path ("/api/…", "/lib/…") with the base path. */
export const withRoot = (p: string): string => (p.startsWith("/") ? ROOT + p : p);
