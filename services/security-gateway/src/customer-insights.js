"use strict";

const { randomUUID } = require("node:crypto");
const {
  getCustomerAnalytics,
  getCustomerCommunity,
  getCustomerFlexibility,
  getCustomerSummary
} = require("./customer-read-model");
const { buildInsightFacts, round } = require("./customer-metrics");

const INSIGHT_KEYS = Object.freeze([
  "peak_period",
  "peak_device_type",
  "flexible_load",
  "latest_event",
  "community_percentile"
]);
const failedUntil = new Map();

function compactFacts(facts) {
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null)
  );
}

function parseInsightSelection(text, allowedKeys = INSIGHT_KEYS) {
  const parsed = JSON.parse(String(text || "").trim());
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.insights) ||
    Object.keys(parsed).some((key) => key !== "insights")
  ) {
    throw new Error("invalid_insight_output");
  }

  const seen = new Set();
  return parsed.insights.slice(0, 3).map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Object.keys(item).some((key) => !["insight_key", "confidence"].includes(key)) ||
      !allowedKeys.includes(item.insight_key) ||
      seen.has(item.insight_key) ||
      !Number.isFinite(Number(item.confidence)) ||
      Number(item.confidence) < 0.65 ||
      Number(item.confidence) > 1
    ) {
      throw new Error("invalid_insight_selection");
    }
    seen.add(item.insight_key);
    return {
      insight_key: item.insight_key,
      confidence: Number(item.confidence)
    };
  });
}

function insightText(key, fact) {
  if (key === "peak_period") {
    const time = new Intl.DateTimeFormat("en-IE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
      timeZoneName: "short"
    }).format(new Date(fact.timestamp));
    return {
      category: "usage_pattern",
      title: "Highest observed demand",
      text: `The highest observed demand in this period was ${round(fact.total_power_kw)} kW around ${time}.`
    };
  }
  if (key === "peak_device_type") {
    const label =
      fact.device_type === "ev_charger" ? "EV charger" :
      fact.device_type === "heat_pump" ? "heat pump" :
      "smart plug";
    return {
      category: "device_contribution",
      title: "Largest peak contributor",
      text: `The ${label} was the largest device-type contributor at the observed peak, using ${round(fact.power_kw)} kW.`
    };
  }
  if (key === "flexible_load") {
    return {
      category: "flexibility_opportunity",
      title: "Flexible load opportunity",
      text: `Approximately ${round(fact.flexible_load_kw)} kW of current simulated load may be eligible for a flexibility event.`
    };
  }
  if (key === "latest_event") {
    return {
      category: "event_participation",
      title: "Latest flexibility event",
      text: `The latest event requested ${round(fact.target_kw)} kW and is currently ${String(fact.status).replaceAll("_", " ")}. All device actions remain simulated.`
    };
  }
  if (key === "community_percentile") {
    return {
      category: "community_comparison",
      title: "Anonymized community comparison",
      text: `The selected household's current demand is at approximately the ${round(fact.percentile, 0)}th percentile within the anonymized comparison group.`
    };
  }
  throw new Error("unsupported_insight_key");
}

function validateAndRenderSelections(selections, facts) {
  return selections.map((selection) => {
    const fact = facts[selection.insight_key];
    if (!fact) {
      throw new Error("insight_fact_missing");
    }
    return {
      key: selection.insight_key,
      confidence: selection.confidence,
      fact,
      ...insightText(selection.insight_key, fact)
    };
  });
}

function customerInsightRow(row) {
  return {
    insight_id: row.insight_id,
    category: row.insight_category,
    title: row.supporting_metric_references?.title || "AI-powered energy insight",
    text: row.insight_text,
    supporting_metrics: row.supporting_metric_references?.fact || null,
    period_start: row.period_start,
    period_end: row.period_end,
    generated_at: row.generated_at,
    expires_at: row.expiry_timestamp,
    confidence: Number(row.confidence),
    validation_status: row.validation_status,
    label: "AI-powered energy insight"
  };
}

async function getCachedInsights(pool, householdId) {
  const result = await pool.query(
    `
      SELECT
        insight_id, insight_category, insight_text,
        supporting_metric_references, period_start, period_end,
        generated_at, expiry_timestamp, confidence, validation_status
      FROM household_generated_insights
      WHERE household_id = $1
        AND expiry_timestamp > now()
        AND validation_status = 'validated'
      ORDER BY generated_at DESC
      LIMIT 6
    `,
    [householdId]
  );
  return result.rows.map(customerInsightRow);
}

async function callInsightModel(config, facts, inferenceFetch = fetch) {
  const availableKeys = INSIGHT_KEYS.filter((key) => facts[key]);
  const exampleKey = availableKeys[0];
  const prompt = [
    "Select up to three useful household energy insights from the supplied aggregate facts.",
    `Allowed insight_key values: ${availableKeys.join(", ")}.`,
    "Return JSON only with this shape:",
    JSON.stringify({
      insights: [{
        insight_key: exampleKey,
        confidence: 0.8
      }]
    }),
    "Do not add text, numbers, device IDs, household IDs, commands, or fields.",
    `Aggregate facts: ${JSON.stringify(facts)}`
  ].join("\n");
  const response = await inferenceFetch(
    `${config.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.slmModel,
        prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
          num_predict: 180
        }
      }),
      signal: AbortSignal.timeout(config.customerInsightTimeoutMs)
    }
  );
  if (!response.ok) {
    throw new Error("insight_model_unavailable");
  }
  const body = await response.json();
  return parseInsightSelection(body.response, availableKeys);
}

async function collectInsightFacts(pool, context, householdId, config) {
  const [summary, analytics, community, flexibility] = await Promise.all([
    getCustomerSummary(pool, context, householdId, config),
    getCustomerAnalytics(pool, context, householdId, { range: "24h" }),
    getCustomerCommunity(pool, context, householdId, config),
    getCustomerFlexibility(pool, context, householdId)
  ]);
  return compactFacts(buildInsightFacts({
    summary,
    analytics,
    community,
    flexibility
  }));
}

async function persistInsights(pool, context, householdId, rendered, config, trigger) {
  const generatedAt = new Date();
  const expiry = new Date(generatedAt.getTime() + config.customerInsightRefreshMinutes * 60000);
  const periodStart = new Date(generatedAt.getTime() - 24 * 3600000);
  const rows = [];
  for (const insight of rendered) {
    const insightId = `insight-${randomUUID()}`;
    const result = await pool.query(
      `
        INSERT INTO household_generated_insights (
          insight_id, household_id, community_id, insight_category,
          insight_text, supporting_metric_references, period_start,
          period_end, generated_at, expiry_timestamp, confidence,
          validation_status, model_identifier, generation_trigger
        )
        VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
          $11, 'validated', $12, $13
        )
        RETURNING
          insight_id, insight_category, insight_text,
          supporting_metric_references, period_start, period_end,
          generated_at, expiry_timestamp, confidence, validation_status
      `,
      [
        insightId,
        householdId,
        context.communityId,
        insight.category,
        insight.text,
        JSON.stringify({
          insight_key: insight.key,
          title: insight.title,
          fact: insight.fact
        }),
        periodStart.toISOString(),
        generatedAt.toISOString(),
        generatedAt.toISOString(),
        expiry.toISOString(),
        insight.confidence,
        config.slmModel,
        trigger
      ]
    );
    rows.push(customerInsightRow(result.rows[0]));
  }
  return rows;
}

async function generateCustomerInsights({
  pool,
  context,
  householdId,
  config,
  inferenceFetch = fetch,
  trigger = "hourly_cache"
}) {
  const facts = await collectInsightFacts(pool, context, householdId, config);
  if (!Object.keys(facts).length) {
    return {
      status: "not_enough_data",
      insights: []
    };
  }
  const selections = await callInsightModel(config, facts, inferenceFetch);
  const rendered = validateAndRenderSelections(selections, facts);
  const insights = await persistInsights(
    pool,
    context,
    householdId,
    rendered,
    config,
    trigger
  );
  failedUntil.delete(householdId);
  return {
    status: insights.length ? "generated" : "not_enough_data",
    insights
  };
}

async function getOrGenerateCustomerInsights(options) {
  const cached = await getCachedInsights(options.pool, options.householdId);
  if (cached.length && !options.force) {
    return {
      status: "cached",
      insights: cached
    };
  }
  if (
    !options.force &&
    Number(failedUntil.get(options.householdId) || 0) > Date.now()
  ) {
    return {
      status: "temporarily_unavailable",
      insights: []
    };
  }

  try {
    return await generateCustomerInsights(options);
  } catch (error) {
    failedUntil.set(options.householdId, Date.now() + 5 * 60000);
    return {
      status: "temporarily_unavailable",
      insights: [],
      reason: error.message
    };
  }
}

function startCustomerInsightScheduler({ pool, config, inferenceFetch = fetch }) {
  const intervalMs = Math.max(15, config.customerInsightRefreshMinutes) * 60000;
  const timer = setInterval(async () => {
    try {
      const result = await pool.query(
        `
          SELECT DISTINCT ON (household_id)
            household_id, community_id
          FROM household_generated_insights
          WHERE expiry_timestamp <= now() + interval '15 minutes'
          ORDER BY household_id, generated_at DESC
          LIMIT 50
        `
      );
      for (const row of result.rows) {
        await getOrGenerateCustomerInsights({
          pool,
          context: {
            role: "technical_admin",
            username: "customer-insight-scheduler",
            householdId: null,
            communityId: row.community_id
          },
          householdId: row.household_id,
          config,
          inferenceFetch,
          force: true,
          trigger: "hourly_schedule"
        });
      }
    } catch (error) {
      console.error("Customer insight scheduler failed safely:", error.message);
    }
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = {
  INSIGHT_KEYS,
  callInsightModel,
  collectInsightFacts,
  customerInsightRow,
  generateCustomerInsights,
  getCachedInsights,
  getOrGenerateCustomerInsights,
  insightText,
  parseInsightSelection,
  startCustomerInsightScheduler,
  validateAndRenderSelections
};
