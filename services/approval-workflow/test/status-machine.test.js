"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateTransition } = require("../src/status-machine");

test("proposed to reviewed allowed", () => {
  assert.equal(validateTransition("proposed", "reviewed").valid, true);
});

test("reviewed to approved allowed", () => {
  assert.equal(validateTransition("reviewed", "approved").valid, true);
});

test("proposed to rejected allowed", () => {
  assert.equal(validateTransition("proposed", "rejected").valid, true);
});

test("reviewed to rejected allowed", () => {
  assert.equal(validateTransition("reviewed", "rejected").valid, true);
});

test("approved to ready_to_dispatch allowed", () => {
  assert.equal(validateTransition("approved", "ready_to_dispatch").valid, true);
});

test("proposed directly to approved rejected", () => {
  const result = validateTransition("proposed", "approved");

  assert.equal(result.valid, false);
  assert.equal(result.error, "invalid_status_transition");
});

test("proposed directly to ready_to_dispatch rejected", () => {
  const result = validateTransition("proposed", "ready_to_dispatch");

  assert.equal(result.valid, false);
  assert.equal(result.error, "invalid_status_transition");
});

test("rejected to approved rejected", () => {
  const result = validateTransition("rejected", "approved");

  assert.equal(result.valid, false);
  assert.equal(result.error, "invalid_status_transition");
});

test("ready_to_dispatch to approved rejected", () => {
  const result = validateTransition("ready_to_dispatch", "approved");

  assert.equal(result.valid, false);
  assert.equal(result.error, "invalid_status_transition");
});
