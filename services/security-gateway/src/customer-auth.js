"use strict";

const { createHash } = require("node:crypto");

const CUSTOMER_ROLES = Object.freeze([
  "household_user",
  "enershare_operator",
  "technical_admin"
]);

class CustomerAccessError extends Error {
  constructor(code, statusCode = 403) {
    super(code);
    this.name = "CustomerAccessError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanHeader(value) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

function readCustomerContext(request) {
  const role = cleanHeader(request.get("x-customer-role"));
  const username = cleanHeader(request.get("x-customer-username"));
  const householdId = cleanHeader(request.get("x-customer-household-id"));
  const communityId = cleanHeader(request.get("x-customer-community-id"));

  if (!role || !CUSTOMER_ROLES.includes(role)) {
    throw new CustomerAccessError("customer_role_required", 401);
  }
  if (!username) {
    throw new CustomerAccessError("customer_identity_required", 401);
  }
  if (role === "household_user" && !householdId) {
    throw new CustomerAccessError("household_scope_required", 403);
  }
  if (!communityId) {
    throw new CustomerAccessError("community_scope_required", 403);
  }

  return {
    role,
    username,
    householdId,
    communityId
  };
}

function stableHouseholdPseudonym(householdId, salt) {
  const digest = createHash("sha256")
    .update(`${String(salt || "local-dashboard-salt")}:${householdId}`)
    .digest("hex")
    .slice(0, 10);
  return `household_${digest}`;
}

async function householdExistsInCommunity(pool, householdId, communityId) {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM normalized_telemetry
        WHERE household_id = $1 AND community_id = $2
        UNION ALL
        SELECT 1
        FROM simulated_device_registry
        WHERE household_id = $1 AND community_id = $2
      ) AS allowed
    `,
    [householdId, communityId]
  );
  return result.rows[0]?.allowed === true;
}

async function resolveHouseholdScope(pool, context, requestedHouseholdId, salt) {
  const requested = cleanHeader(requestedHouseholdId);

  if (context.role === "household_user") {
    if (requested && requested !== context.householdId) {
      throw new CustomerAccessError("household_access_denied", 403);
    }
    return context.householdId;
  }

  if (requested) {
    let resolved = requested;
    if (requested.startsWith("household_")) {
      const candidates = await pool.query(
        `
          SELECT household_id
          FROM (
            SELECT DISTINCT household_id
            FROM normalized_telemetry
            WHERE community_id = $1
            UNION
            SELECT DISTINCT household_id
            FROM simulated_device_registry
            WHERE community_id = $1
          ) authorized
          LIMIT 250
        `,
        [context.communityId]
      );
      resolved = candidates.rows.find((row) => (
        stableHouseholdPseudonym(row.household_id, salt) === requested
      ))?.household_id;
    } else if (context.role !== "technical_admin") {
      throw new CustomerAccessError("household_access_denied", 403);
    }
    if (!resolved || !(await householdExistsInCommunity(pool, resolved, context.communityId))) {
      throw new CustomerAccessError("household_access_denied", 403);
    }
    return resolved;
  }

  const result = await pool.query(
    `
      SELECT household_id
      FROM (
        SELECT household_id, max(event_time) AS last_seen
        FROM normalized_telemetry
        WHERE community_id = $1
        GROUP BY household_id
        UNION ALL
        SELECT household_id, NULL::timestamptz AS last_seen
        FROM simulated_device_registry
        WHERE community_id = $1
        GROUP BY household_id
      ) available
      GROUP BY household_id
      ORDER BY max(last_seen) DESC NULLS LAST, household_id
      LIMIT 1
    `,
    [context.communityId]
  );
  return result.rows[0]?.household_id || null;
}

async function listAuthorizedHouseholds(pool, context, salt) {
  if (context.role === "household_user") {
    return [{
      selector_id: context.householdId,
      display_name: "Your household",
      pseudonym: stableHouseholdPseudonym(context.householdId, salt),
      selected_by_default: true
    }];
  }

  const result = await pool.query(
    `
      WITH available AS (
        SELECT household_id, device_id, event_time AS last_seen
        FROM normalized_telemetry
        WHERE community_id = $1
        UNION ALL
        SELECT household_id, device_id, NULL::timestamptz AS last_seen
        FROM simulated_device_registry
        WHERE community_id = $1
      )
      SELECT
        household_id,
        max(last_seen) AS last_seen,
        count(DISTINCT device_id)::integer AS device_count
      FROM available
      GROUP BY household_id
      ORDER BY max(last_seen) DESC NULLS LAST, household_id
      LIMIT 250
    `,
    [context.communityId]
  );

  return result.rows.map((row, index) => ({
    selector_id: stableHouseholdPseudonym(row.household_id, salt),
    display_name: stableHouseholdPseudonym(row.household_id, salt),
    pseudonym: stableHouseholdPseudonym(row.household_id, salt),
    last_seen: row.last_seen,
    device_count: Number(row.device_count || 0),
    selected_by_default: index === 0
  }));
}

module.exports = {
  CUSTOMER_ROLES,
  CustomerAccessError,
  householdExistsInCommunity,
  listAuthorizedHouseholds,
  readCustomerContext,
  resolveHouseholdScope,
  stableHouseholdPseudonym
};
