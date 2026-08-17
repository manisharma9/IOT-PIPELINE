"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getCustomerCommunity } = require("../src/customer-read-model");

test("community live-demand aggregates exclude stale device readings", async () => {
  const queries = [];
  const responses = [
    [{
      household_count: 1,
      active_households: 0,
      total_demand_kw: 0,
      flexible_load_kw: 0,
      average_household_load_kw: null
    }],
    [],
    [{ comparison_households: 1, selected_percentile: null }],
    [{ active_events: 0, active_target_kw: 0 }],
    [{
      household_count: 100,
      asset_count: 1000,
      online_assets: 0,
      active_assets: 0,
      flexible_assets: 800,
      total_demand_kw: 0,
      available_flexibility_kw: 0
    }],
    [],
    [],
    [{ normalized_assets: 1000, terminal_slm_assets: 1000, mapped_assets: 961, safely_unmapped_assets: 39 }]
  ];
  const pool = {
    async query(sql) {
      queries.push(sql);
      return { rows: responses[queries.length - 1] };
    }
  };

  const result = await getCustomerCommunity(
    pool,
    { role: "enershare_operator", communityId: "community-dublin-north" },
    "household-001",
    {
      customerPseudonymizationSalt: "test-salt",
      customerScaleCohortPrefix: "scale1000-"
    }
  );

  const summaryQuery = queries[0].replace(/\s+/g, " ");
  assert.match(
    summaryQuery,
    /sum\(coalesce\(current_power_kw, 0\)\) FILTER \( WHERE last_seen >= now\(\) - interval '10 minutes'/
  );
  assert.match(
    summaryQuery,
    /avg\(demand_kw\) FILTER \( WHERE last_seen >= now\(\) - interval '10 minutes'/
  );
  assert.equal(result.active_households, 0);
  assert.equal(result.total_community_demand_kw, 0);
  assert.equal(result.average_household_load_kw, null);
});
