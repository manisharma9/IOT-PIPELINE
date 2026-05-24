"use strict";

const VALID_ACTIONS = new Set(["review", "approve", "reject", "mark_ready"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateApprovalRequest(action, body) {
  const errors = [];

  if (!VALID_ACTIONS.has(action)) {
    errors.push("action is not supported.");
  }

  if (!isPlainObject(body)) {
    return {
      valid: false,
      errors: ["request body must be a JSON object."]
    };
  }

  if (!isNonEmptyString(body.reviewer_id)) {
    errors.push("reviewer_id is required.");
  }

  if (!isNonEmptyString(body.reviewer_role)) {
    errors.push("reviewer_role is required.");
  }

  const comment = cleanString(body.comment);
  const reason = cleanString(body.reason);

  if (action === "reject" && !comment && !reason) {
    errors.push("reject request requires reason or comment.");
  }

  return {
    valid: errors.length === 0,
    errors,
    value: {
      reviewer_id: cleanString(body.reviewer_id),
      reviewer_role: cleanString(body.reviewer_role),
      comment,
      reason
    }
  };
}

module.exports = {
  VALID_ACTIONS,
  validateApprovalRequest
};
