import { normalizeBasePath } from "../core/url.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? "0.0.0.0";
// Public URL, including a path prefix when served under one (e.g. https://examplewebsite.app/steplight)
const baseUrl = (process.env.STEPLIGHT_BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
const basePath = normalizeBasePath(process.env.STEPLIGHT_BASE_PATH ?? new URL(baseUrl).pathname);
const dataDir = process.env.STEPLIGHT_DATA ?? "data";
const accessKey = process.env.STEPLIGHT_ACCESS_KEY || undefined;
// shown in the extension's privacy policy at <base>/privacy
const publisher = process.env.STEPLIGHT_PUBLISHER || undefined;
const contactEmail = process.env.STEPLIGHT_CONTACT_EMAIL || undefined;
// the server's own headless browser (recording, replay) talks to it directly, not through the internet
const internalUrl = (process.env.STEPLIGHT_INTERNAL_URL ?? `http://127.0.0.1:${port}${basePath}`).replace(/\/+$/, "");

const { app } = createApp({ dataDir, baseUrl, basePath, internalUrl, accessKey, publisher, contactEmail });
app.listen(port, host, () => {
  console.log(`Steplight running at ${baseUrl}  (studio: ${baseUrl}/studio/, demo app: ${baseUrl}/demo-erp/)`);
  if (accessKey) console.log("Access key required for the Studio and authoring API.");
  else if (!/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(baseUrl)) console.warn("Warning: public URL without STEPLIGHT_ACCESS_KEY — anyone can edit projects.");
});
