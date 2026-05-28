import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("dashboard uses the CPU seal and gold-blue theme tokens", () => {
  const dashboard = readFileSync(
    join(root, "src", "components", "SchedulerDashboard.tsx"),
    "utf8",
  );
  const css = readFileSync(join(root, "src", "app", "globals.css"), "utf8");
  const sealPath = join(root, "public", "cpu-seal.png");

  assert.match(dashboard, /src="\/cpu-seal\.png"/);
  assert.match(dashboard, /className="brand-mark"/);
  assert.match(css, /--cpu-blue:\s*#25266f;/);
  assert.match(css, /--cpu-gold:\s*#ffd23f;/);
  assert.ok(existsSync(sealPath), "CPU seal asset should exist");
});
