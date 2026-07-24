"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  callInsightModel,
  getOrGenerateCustomerInsights,
  parseInsightSelection,
  validateAndRenderSelections
} = require("../src/customer-insights");

test("insight selection rejects uncontrolled customer-facing model text", () => {
  assert.throws(
    () => parseInsightSelection(JSON.stringify({
      insights: [{
        insight_key: "peak_period",
        confidence: 0.9,
        explanation: "Unverified free-form claim"
      }]
    })),
    /invalid_insight_selection/
  );
});

test("insight selection rejects unsupported numerical claims", () => {
  assert.throws(
    () => parseInsightSelection(JSON.stringify({
      insights: [{
        insight_key: "financial_savings",
        confidence: 0.95
      }]
    })),
    /invalid_insight_selection/
  );
});

test("validated insight text is rendered only from supporting metrics", () => {
  const selections = parseInsightSelection(JSON.stringify({
    insights: [{
      insight_key: "peak_period",
      confidence: 0.88
    }]
  }));
  const insights = validateAndRenderSelections(selections, {
    peak_period: {
      timestamp: "2026-07-24T10:00:00.000Z",
      total_power_kw: 4.2
    }
  });

  assert.equal(insights.length, 1);
  assert.equal(insights[0].text.includes("4.2 kW"), true);
  assert.equal(insights[0].text.includes("2026-07-24T"), false);
  assert.equal(insights[0].confidence, 0.88);
});

test("missing supporting metric rejects the generated insight", () => {
  assert.throws(
    () => validateAndRenderSelections([{
      insight_key: "peak_period",
      confidence: 0.8
    }], {}),
    /insight_fact_missing/
  );
});

test("the insight model can select only aggregate facts that are available", async () => {
  let requestBody;
  const selections = await callInsightModel(
    {
      ollamaBaseUrl: "http://ollama.local",
      slmModel: "phi3:mini",
      customerInsightTimeoutMs: 1000
    },
    {
      peak_period: {
        timestamp: "2026-07-24T10:00:00.000Z",
        total_power_kw: 4.2
      }
    },
    async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            response: JSON.stringify({
              insights: [{
                insight_key: "peak_period",
                confidence: 0.9
              }]
            })
          };
        }
      };
    }
  );

  assert.equal(selections[0].insight_key, "peak_period");
  assert.match(requestBody.prompt, /Allowed insight_key values: peak_period\./);
  assert.match(
    requestBody.prompt,
    /\{"insights":\[\{"insight_key":"peak_period","confidence":0\.8\}\]\}/
  );
  assert.doesNotMatch(requestBody.prompt, /flexible_load/);
});

test("an uncached household reaches generation without a cache-backoff error", async () => {
  const pool = {
    async query(sql) {
      if (sql.includes("FROM household_generated_insights")) {
        return { rows: [] };
      }
      throw new Error("expected_generation_query");
    }
  };

  const result = await getOrGenerateCustomerInsights({
    pool,
    householdId: "household-uncached",
    context: {},
    config: {}
  });

  assert.equal(result.status, "temporarily_unavailable");
  assert.equal(result.reason, "expected_generation_query");
});
