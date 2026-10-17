// esbuild entry for dist/lib/player.js → window.SteplightPlayer (see docs/ARCHITECTURE.md).
//   SteplightPlayer.mount(el, { process, mode: "show" | "try" | "test", ui?, autoplay?, voice?, video?, scorm?, onEvent?, primaryColor? })
//   SteplightPlayer.scorm   — the shared SCORM 1.2 session (init / set / commit / finish), used by SCORM packages.
export { mount } from "./player.js";
export type { PlayerConfig, PlayerEvent } from "./player.js";
export { scorm } from "./scorm.js";
export const version = "1.0.0";
