"use strict";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateReadyEvent(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return {
      valid: false,
      errors: ["ready event must be a JSON object."]
    };
  }

  if (!event.dispatch_command_id && !event.id && !isNonEmptyString(event.proposal_id)) {
    errors.push("dispatch_command_id or proposal_id is required.");
  }

  if (!isNonEmptyString(event.community_id)) {
    errors.push("community_id is required.");
  }

  if (!isNonEmptyString(event.proposed_action)) {
    errors.push("proposed_action is required.");
  }

  if (!isNonEmptyString(event.requested_action)) {
    errors.push("requested_action is required.");
  }

  if (event.status !== "ready_to_dispatch") {
    errors.push("status must be ready_to_dispatch.");
  }

  if (event.no_execution !== true) {
    errors.push("no_execution must be true.");
  }

  if (event.execution_blocked !== true) {
    errors.push("execution_blocked must be true.");
  }

  return {
    valid: errors.length === 0,
    errors,
    value: event
  };
}

module.exports = {
  validateReadyEvent
};
