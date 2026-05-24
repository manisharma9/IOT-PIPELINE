"use strict";

const crypto = require("crypto");

function pseudonymizeIdentifier(value, prefix, salt) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const digest = crypto
    .createHash("sha256")
    .update(`${salt || ""}:${String(value)}`)
    .digest("hex")
    .slice(0, 12);

  return `${prefix}_${digest}`;
}

function pseudonymizeHouseholdId(value, salt) {
  return pseudonymizeIdentifier(value, "household", salt);
}

function pseudonymizeDeviceId(value, salt) {
  return pseudonymizeIdentifier(value, "device", salt);
}

module.exports = {
  pseudonymizeDeviceId,
  pseudonymizeHouseholdId,
  pseudonymizeIdentifier
};
