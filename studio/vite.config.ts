import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.STEPLIGHT_API ?? "http://localhost:4204";

export default defineConfig({
  root: here,
  base: "/studio/",
  plugins: [react()],
  build: {
    outDir: path.resolve(here, "../dist/studio"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5174,
    fs: { allow: [path.resolve(here, "..")] },
    proxy: Object.fromEntries(["/api", "/media", "/lib", "/demo-erp", "/portal"].map((p) => [p, { target: API }])),
  },
});
