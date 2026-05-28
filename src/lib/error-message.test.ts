import assert from "node:assert/strict";
import test from "node:test";

import { getErrorMessage } from "./error-message";

test("getErrorMessage uses fallback for empty Error messages", () => {
  assert.equal(getErrorMessage(new Error(""), "Fallback message"), "Fallback message");
});

test("getErrorMessage uses the real Error message when present", () => {
  assert.equal(
    getErrorMessage(new Error("Connection failed"), "Fallback message"),
    "Connection failed",
  );
});
