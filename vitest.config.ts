import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/heap-trace.ts"],
    exclude: ["node_modules/**", "tmp/**", "dist/**"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // browser-driven suites each launch Chromium; keep memory predictable
    fileParallelism: false,
  },
});
