import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? "0.0.0.0";
const baseUrl = (process.env.STEPLIGHT_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
const dataDir = process.env.STEPLIGHT_DATA ?? "data";

const { app } = createApp({ dataDir, baseUrl });
app.listen(port, host, () => {
  console.log(`Steplight running at ${baseUrl}  (studio: ${baseUrl}/studio/, demo app: ${baseUrl}/demo-erp/)`);
});
