// Opt-in diagnostics (STEPLIGHT_HEAP_TRACE=1, set in CI): each test's start and end, and the worker's
// heap while it grows past 200 MB, written straight to stderr so the last lines survive a worker that
// runs out of memory (its reporter output is lost with it).
import fs from "node:fs";
import { afterEach, beforeEach } from "vitest";

if (process.env.STEPLIGHT_HEAP_TRACE) {
  const mb = () => Math.round(process.memoryUsage().heapUsed / 2 ** 20);
  const say = (msg: string) => fs.writeSync(2, `[heap ${mb()} MB] ${msg}\n`);
  let current = "";
  setInterval(() => {
    if (mb() > 200) say(`during ${current}`);
  }, 2000).unref();
  beforeEach((ctx) => {
    current = `${ctx.task.file?.name ?? ""} > ${ctx.task.name}`;
    say(`start ${current}`);
  });
  afterEach(() => say(`end   ${current}`));
}
