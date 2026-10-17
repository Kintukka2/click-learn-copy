// Minimal ambient typing for the chrome.* extension APIs used by the Steplight Recorder
// (the repo does not ship @types/chrome). Bundled by esbuild, which strips types.
declare const chrome: any; // eslint-disable-line @typescript-eslint/no-explicit-any
