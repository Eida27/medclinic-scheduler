import assert from "node:assert/strict";
import test from "node:test";

import { formatArrivalWindow } from "./arrival-window";

test("formatArrivalWindow renders Morning as its exact arrival range", () => {
  assert.equal(formatArrivalWindow("Morning"), "7:00 am - 11:00 am");
});

test("formatArrivalWindow renders Afternoon as its exact arrival range", () => {
  assert.equal(formatArrivalWindow("Afternoon"), "1:00 pm - 4:00 pm");
});

test("formatArrivalWindow matches canonical labels case-insensitively after trimming", () => {
  assert.equal(formatArrivalWindow("  morning  "), "7:00 am - 11:00 am");
  assert.equal(formatArrivalWindow("AFTERNOON"), "1:00 pm - 4:00 pm");
});

test("formatArrivalWindow preserves unknown custom labels after trimming", () => {
  assert.equal(formatArrivalWindow("  By appointment  "), "By appointment");
});
