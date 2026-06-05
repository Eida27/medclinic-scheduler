import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("doctor API routes expose doctors and recompute endpoint", () => {
  const doctorsRoute = readFileSync(
    join(root, "src", "app", "api", "doctors", "route.ts"),
    "utf8",
  );
  const unavailabilityRoute = readFileSync(
    join(root, "src", "app", "api", "doctor-unavailability", "route.ts"),
    "utf8",
  );

  assert.match(doctorsRoute, /getDoctors/);
  assert.match(doctorsRoute, /export async function GET/);
  assert.match(
    unavailabilityRoute,
    /recordDoctorUnavailabilityAndRecompute/,
  );
  assert.match(unavailabilityRoute, /export async function POST/);
});
