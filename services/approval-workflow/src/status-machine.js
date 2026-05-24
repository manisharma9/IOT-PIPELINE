"use strict";

const STATUSES = Object.freeze([
  "proposed",
  "reviewed",
  "approved",
  "rejected",
  "ready_to_dispatch"
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  proposed: ["reviewed", "rejected"],
  reviewed: ["approved", "rejected"],
  approved: ["ready_to_dispatch"],
  rejected: [],
  ready_to_dispatch: []
});

const ACTION_TO_STATUS = Object.freeze({
  review: "reviewed",
  approve: "approved",
  reject: "rejected",
  mark_ready: "ready_to_dispatch"
});

function isKnownStatus(status) {
  return STATUSES.includes(status);
}

function getTargetStatusForAction(action) {
  return ACTION_TO_STATUS[action] || null;
}

function canTransition(previousStatus, newStatus) {
  return Boolean(
    isKnownStatus(previousStatus) &&
      isKnownStatus(newStatus) &&
      ALLOWED_TRANSITIONS[previousStatus].includes(newStatus)
  );
}

function validateTransition(previousStatus, newStatus) {
  if (!isKnownStatus(previousStatus)) {
    return {
      valid: false,
      error: "invalid_status_transition",
      message: `Unknown current status: ${previousStatus}.`
    };
  }

  if (!isKnownStatus(newStatus)) {
    return {
      valid: false,
      error: "invalid_status_transition",
      message: `Unknown target status: ${newStatus}.`
    };
  }

  if (!canTransition(previousStatus, newStatus)) {
    return {
      valid: false,
      error: "invalid_status_transition",
      message: `Cannot transition dispatch command from ${previousStatus} to ${newStatus}.`
    };
  }

  return {
    valid: true,
    previous_status: previousStatus,
    new_status: newStatus
  };
}

module.exports = {
  ACTION_TO_STATUS,
  ALLOWED_TRANSITIONS,
  STATUSES,
  canTransition,
  getTargetStatusForAction,
  isKnownStatus,
  validateTransition
};
