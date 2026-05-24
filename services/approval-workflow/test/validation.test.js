"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateApprovalRequest } = require("../src/validation");

test("missing reviewer_id rejected", () => {
  const result = validateApprovalRequest("review", {
    reviewer_role: "mentor",
    comment: "Looks good."
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.includes("reviewer_id")), true);
});

test("missing reject comment rejected", () => {
  const result = validateApprovalRequest("reject", {
    reviewer_id: "paolo",
    reviewer_role: "mentor"
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.includes("reason or comment")), true);
});

test("valid mark-ready request accepted", () => {
  const result = validateApprovalRequest("mark_ready", {
    reviewer_id: "paolo",
    reviewer_role: "mentor",
    comment: "Ready for dispatch preparation only."
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.reviewer_id, "paolo");
});
