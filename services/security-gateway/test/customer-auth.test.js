"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CustomerAccessError,
  listAuthorizedHouseholds,
  resolveHouseholdScope,
  stableHouseholdPseudonym
} = require("../src/customer-auth");

test("household pseudonyms are stable and do not reveal the source identifier", () => {
  const first = stableHouseholdPseudonym("household-private-01", "test-salt");
  const second = stableHouseholdPseudonym("household-private-01", "test-salt");

  assert.equal(first, second);
  assert.match(first, /^household_[a-f0-9]{10}$/);
  assert.equal(first.includes("private"), false);
});

test("household scope rejects cross-household access before querying data", async () => {
  const pool = {
    query: async () => {
      throw new Error("database should not be queried");
    }
  };

  await assert.rejects(
    resolveHouseholdScope(pool, {
      role: "household_user",
      householdId: "household-a",
      communityId: "community-one"
    }, "household-b", "salt"),
    (error) => (
      error instanceof CustomerAccessError &&
      error.code === "household_access_denied" &&
      error.statusCode === 403
    )
  );
});

test("operator selector exposes pseudonyms rather than household identifiers", async () => {
  const pool = {
    query: async () => ({
      rows: [{
        household_id: "household-private-01",
        last_seen: "2026-07-24T10:00:00.000Z",
        device_count: 3
      }]
    })
  };
  const households = await listAuthorizedHouseholds(pool, {
    role: "enershare_operator",
    communityId: "community-one"
  }, "test-salt");

  assert.equal(households.length, 1);
  assert.notEqual(households[0].selector_id, "household-private-01");
  assert.equal(households[0].display_name, households[0].pseudonym);
  assert.equal(JSON.stringify(households).includes("private"), false);
});

test("operator pseudonym resolves only inside the authorized community", async () => {
  const pseudonym = stableHouseholdPseudonym("household-a", "test-salt");
  let queryCount = 0;
  const pool = {
    query: async () => {
      queryCount += 1;
      if (queryCount === 1) {
        return { rows: [{ household_id: "household-a" }] };
      }
      return { rows: [{ allowed: true }] };
    }
  };
  const resolved = await resolveHouseholdScope(pool, {
    role: "enershare_operator",
    communityId: "community-one"
  }, pseudonym, "test-salt");

  assert.equal(resolved, "household-a");
  assert.equal(queryCount, 2);
});

