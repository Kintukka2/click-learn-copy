// Generates the sample process fixture (tests/fixtures/out) once if it is missing, so a fresh clone
// can run `npm test` directly.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function setup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (fs.existsSync(path.join(root, "tests/fixtures/out/process.json"))) return;
  execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/make-fixture.ts"], { cwd: root, stdio: "inherit" });
}
