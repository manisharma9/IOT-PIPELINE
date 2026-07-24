"use strict";

const {
  calculateFlexibilityScore,
  customerStatus,
  normalizeAnalyticsRange,
  normalizePagination,
  operatingState,
  round,
  toNumber
} = require("./customer-metrics");
const {
  listAuthorizedHouseholds,
  stableHouseholdPseudonym
} = require("./customer-auth");

const POWER_DEVICE_TYPES = new Set(["shelly_plug", "ev_charger", "heat_pump"]);

function householdDisplay(context, householdId, salt) {
  return context.role === "household_user"
    ? "Your household"
    : stableHouseholdPseudonym(householdId, salt);
}

function safeDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function groupRows(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) || []), row]);
  }
  return grouped;
}

async function listHouseholds(pool, context, config) {
  const households = await listAuthorizedHouseholds(
    pool,
    context,
    config.customerPseudonymizationSalt
  );
  return {
    role: context.role,
    community_id: context.communityId,
    households
  };
}

async function getCustomerSummary(pool, context, householdId, config) {
  const summaryResult = await pool.query(
    `
      SELECT
        count(*)::integer AS total_devices,
        count(*) FILTER (WHERE last_seen >= now() - interval '10 minutes')::integer AS active_devices,
        coalesce(sum(current_power_kw), 0) AS live_consumption_kw,
        coalesce(sum(current_power_kw) FILTER (
          WHERE device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
            AND last_seen >= now() - interval '10 minutes'
        ), 0) AS flexible_load_available_kw,
        count(*) FILTER (
          WHERE device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
            AND last_seen >= now() - interval '10 minutes'
        )::integer AS eligible_devices,
        bool_or(device_type = 'ev_charger') AS has_ev,
        bool_or(device_type = 'heat_pump') AS has_heat_pump,
        max(last_seen) AS last_updated
      FROM customer_device_latest_state
      WHERE household_id = $1
    `,
    [householdId]
  );
  const dailyResult = await pool.query(
    `
      SELECT energy_used_kwh, data_quality
      FROM customer_household_daily_energy
      WHERE household_id = $1
        AND day_start = time_bucket(interval '1 day', now())
      LIMIT 1
    `,
    [householdId]
  );
  const eventResult = await pool.query(
    `
      SELECT
        id, event_time, start_time, end_time, target_kw, priority, status,
        requested_action, proposed_action, reason
      FROM dispatch_commands
      WHERE community_id = $2
        AND (household_id = $1 OR household_id IS NULL)
        AND end_time >= now() - interval '24 hours'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [householdId, context.communityId]
  );
  const shiftedResult = await pool.query(
    `
      SELECT
        coalesce(sum(
          greatest(coalesce(a.allocated_reduction_kw, 0), 0)
          * greatest(extract(epoch FROM (d.end_time - d.start_time)), 0)
          / 3600.0
        ), 0) AS simulated_shifted_energy_kwh
      FROM device_command_audit a
      JOIN dispatch_commands d ON a.proposal_id = d.id::text
      WHERE d.community_id = $2
        AND (d.household_id = $1 OR d.household_id IS NULL)
        AND a.no_real_execution = true
        AND a.event_time >= time_bucket(interval '1 day', now())
    `,
    [householdId, context.communityId]
  );
  const reliabilityResult = await pool.query(
    `
      SELECT
        count(DISTINCT d.id)::integer AS event_count,
        count(DISTINCT d.id) FILTER (
          WHERE x.simulation_status = 'simulated_success'
            AND x.no_real_execution = true
        )::integer AS successful_events
      FROM dispatch_commands d
      LEFT JOIN dispatch_execution_audit x ON x.dispatch_command_id = d.id
      WHERE d.community_id = $2
        AND (d.household_id = $1 OR d.household_id IS NULL)
    `,
    [householdId, context.communityId]
  );

  const summary = summaryResult.rows[0] || {};
  const event = eventResult.rows[0] || null;
  const score = calculateFlexibilityScore({
    deviceCount: summary.total_devices,
    eligibleDevices: summary.eligible_devices,
    currentPowerKw: summary.live_consumption_kw,
    flexibleLoadKw: summary.flexible_load_available_kw,
    eventCount: reliabilityResult.rows[0]?.event_count,
    successfulEvents: reliabilityResult.rows[0]?.successful_events,
    hasEv: summary.has_ev,
    hasHeatPump: summary.has_heat_pump
  });
  const lastUpdated = safeDate(summary.last_updated);
  const fresh = lastUpdated
    ? Date.now() - Date.parse(lastUpdated) <= 10 * 60 * 1000
    : false;

  return {
    household: {
      id: context.role === "household_user" ? householdId : undefined,
      display_name: householdDisplay(
        context,
        householdId,
        config.customerPseudonymizationSalt
      ),
      pseudonym: stableHouseholdPseudonym(
        householdId,
        config.customerPseudonymizationSalt
      ),
      community_id: context.communityId
    },
    connection: {
      status: fresh ? "live" : lastUpdated ? "stale" : "no_data",
      last_updated: lastUpdated
    },
    live_consumption_kw: summary.total_devices
      ? round(summary.live_consumption_kw)
      : null,
    energy_used_today_kwh: dailyResult.rows.length
      ? round(dailyResult.rows[0].energy_used_kwh)
      : null,
    energy_used_today_quality: dailyResult.rows[0]?.data_quality || "unavailable",
    active_devices: toNumber(summary.active_devices),
    total_devices: toNumber(summary.total_devices),
    flexible_load_available_kw: toNumber(summary.eligible_devices)
      ? round(summary.flexible_load_available_kw)
      : null,
    flexible_load_quality: toNumber(summary.eligible_devices) ? "estimated" : "unavailable",
    current_grid_event: event ? {
      proposal_id: String(event.id),
      status: event.status,
      display_status: customerStatus(event.status),
      requested_action: event.requested_action,
      proposed_action: event.proposed_action,
      target_kw: round(event.target_kw),
      priority: event.priority,
      start_time: safeDate(event.start_time),
      end_time: safeDate(event.end_time),
      reason: event.reason
    } : null,
    simulated_energy_shifted_today_kwh: toNumber(shiftedResult.rows[0]?.simulated_shifted_energy_kwh) > 0
      ? round(shiftedResult.rows[0].simulated_shifted_energy_kwh)
      : null,
    shifted_energy_quality: "simulated_estimate",
    flexibility_score: score,
    simulation: {
      enabled: true,
      no_real_execution: true,
      notice: "Controlled demonstration using simulated energy devices. No real household device control is enabled."
    },
    unavailable_metrics: [
      "financial_savings",
      "carbon_reduction",
      "physical_energy_shifted"
    ]
  };
}

async function getCustomerAnalytics(pool, context, householdId, options = {}) {
  const range = normalizeAnalyticsRange(options);
  const pointsResult = await pool.query(
    `
      SELECT
        time_bucket($4::interval, bucket_start) AS bucket_start,
        avg(total_power_kw) AS total_power_kw,
        avg(coalesce(smart_plug_power_kw, 0)) AS smart_plug_power_kw,
        avg(coalesce(ev_charger_power_kw, 0)) AS ev_charger_power_kw,
        avg(coalesce(heat_pump_power_kw, 0)) AS heat_pump_power_kw,
        sum(sample_count)::integer AS sample_count
      FROM customer_household_power_15m
      WHERE household_id = $1
        AND bucket_start >= $2::timestamptz
        AND bucket_start <= $3::timestamptz
      GROUP BY time_bucket($4::interval, bucket_start)
      ORDER BY bucket_start
      LIMIT 500
    `,
    [householdId, range.start, range.end, range.bucket]
  );
  const eventResult = await pool.query(
    `
      SELECT id, start_time, end_time, target_kw, status
      FROM dispatch_commands
      WHERE community_id = $2
        AND (household_id = $1 OR household_id IS NULL)
        AND start_time <= $4::timestamptz
        AND end_time >= $3::timestamptz
      ORDER BY start_time
      LIMIT 50
    `,
    [householdId, context.communityId, range.start, range.end]
  );

  const points = pointsResult.rows.map((row) => ({
    bucket_start: safeDate(row.bucket_start),
    total_power_kw: round(row.total_power_kw),
    smart_plug_power_kw: round(row.smart_plug_power_kw),
    ev_charger_power_kw: round(row.ev_charger_power_kw),
    heat_pump_power_kw: round(row.heat_pump_power_kw),
    sample_count: toNumber(row.sample_count)
  }));

  return {
    range,
    units: "kW",
    points,
    data_status: points.length ? "available" : "empty",
    data_quality: "measured_simulated_telemetry_downsampled",
    partial_data: points.some((point) => point.sample_count < 2),
    flexibility_events: eventResult.rows.map((row) => ({
      proposal_id: String(row.id),
      start_time: safeDate(row.start_time),
      end_time: safeDate(row.end_time),
      target_kw: round(row.target_kw),
      status: row.status,
      display_status: customerStatus(row.status)
    }))
  };
}

async function getCustomerDevices(pool, context, householdId, options = {}) {
  const { limit, offset } = normalizePagination(options.limit, options.offset);
  const result = await pool.query(
    `
      SELECT
        state.*,
        energy.energy_used_kwh,
        energy.data_quality AS energy_quality,
        command.action AS latest_action,
        command.status AS latest_command_status,
        command.event_time AS latest_command_time,
        command.no_real_execution,
        count(*) OVER()::integer AS total_count
      FROM customer_device_latest_state state
      LEFT JOIN customer_device_daily_energy energy
        ON energy.household_id = state.household_id
       AND energy.device_id = state.device_id
       AND energy.day_start = time_bucket(interval '1 day', now())
      LEFT JOIN LATERAL (
        SELECT action, status, event_time, no_real_execution
        FROM device_command_audit
        WHERE device_id = state.device_id
        ORDER BY created_at DESC
        LIMIT 1
      ) command ON true
      WHERE state.household_id = $1
      ORDER BY state.last_seen DESC, state.device_id
      LIMIT $2 OFFSET $3
    `,
    [householdId, limit, offset]
  );

  const now = Date.now();
  const devices = result.rows.map((row) => {
    const lastSeen = safeDate(row.last_seen);
    const online = lastSeen ? now - Date.parse(lastSeen) <= 10 * 60 * 1000 : false;
    const currentPower = row.current_power_kw === null ? null : round(row.current_power_kw);
    return {
      device_id: row.device_id,
      device_type: row.device_type,
      display_name:
        row.device_type === "shelly_plug" ? "Shelly smart plug" :
        row.device_type === "ev_charger" ? "Easee EV charger" :
        row.device_type === "heat_pump" ? "Heat pump" :
        "Connected energy device",
      simulated: true,
      online,
      last_seen: lastSeen,
      current_power_kw: currentPower,
      energy_used_today_kwh: row.energy_used_kwh === null ? null : round(row.energy_used_kwh),
      energy_quality: row.energy_quality || "unavailable",
      operating_state: operatingState(row),
      indoor_temperature_c: row.indoor_temperature_c === null ? null : round(row.indoor_temperature_c, 1),
      target_temperature_c: row.target_temperature_c === null ? null : round(row.target_temperature_c, 1),
      voltage_v: row.voltage_v === null ? null : round(row.voltage_v, 1),
      current_a: row.current_a === null ? null : round(row.current_a, 2),
      flexibility_available: online && POWER_DEVICE_TYPES.has(row.device_type) && toNumber(currentPower) > 0,
      flexibility_available_kw: online && POWER_DEVICE_TYPES.has(row.device_type)
        ? round(currentPower)
        : 0,
      latest_simulated_command: row.latest_action ? {
        action: row.latest_action,
        status: row.latest_command_status,
        time: safeDate(row.latest_command_time),
        no_real_execution: row.no_real_execution !== false
      } : null,
      event_participation: Boolean(row.latest_action)
    };
  });

  return {
    limit,
    offset,
    total: toNumber(result.rows[0]?.total_count),
    devices,
    simulation: true,
    no_real_execution: true
  };
}

async function getCustomerFlexibility(pool, context, householdId) {
  const proposalsResult = await pool.query(
    `
      SELECT
        id, event_time, created_at, signal_id, requested_action,
        proposed_action, target_kw, start_time, end_time, priority,
        status, reason
      FROM dispatch_commands
      WHERE community_id = $2
        AND (household_id = $1 OR household_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [householdId, context.communityId]
  );
  const proposalIds = proposalsResult.rows.map((row) => Number(row.id));
  const approvalsResult = proposalIds.length
    ? await pool.query(
      `
        SELECT
          dispatch_command_id, event_time, previous_status, new_status,
          action, comment
        FROM dispatch_approval_audit
        WHERE dispatch_command_id = ANY($1::bigint[])
        ORDER BY event_time
      `,
      [proposalIds]
    )
    : { rows: [] };
  const mockResult = proposalIds.length
    ? await pool.query(
      `
        SELECT
          dispatch_command_id, event_time, simulation_status,
          simulation_message, no_real_execution, execution_mode
        FROM dispatch_execution_audit
        WHERE dispatch_command_id = ANY($1::bigint[])
        ORDER BY event_time
      `,
      [proposalIds]
    )
    : { rows: [] };
  const deviceResult = proposalIds.length
    ? await pool.query(
      `
        SELECT
          proposal_id, event_time, device_id, device_type,
          allocated_reduction_kw, action, status, no_real_execution
        FROM device_command_audit
        WHERE proposal_id = ANY($1::text[])
        ORDER BY event_time
      `,
      [proposalIds.map(String)]
    )
    : { rows: [] };

  const approvalsById = groupRows(
    approvalsResult.rows,
    (row) => String(row.dispatch_command_id)
  );
  const mockById = groupRows(
    mockResult.rows,
    (row) => String(row.dispatch_command_id)
  );
  const devicesById = groupRows(deviceResult.rows, (row) => String(row.proposal_id));

  const events = proposalsResult.rows.map((proposal) => {
    const id = String(proposal.id);
    const approvals = approvalsById.get(id) || [];
    const mock = mockById.get(id) || [];
    const contributions = devicesById.get(id) || [];
    const timeline = [
      {
        time: safeDate(proposal.created_at || proposal.event_time),
        status: "proposed",
        label: customerStatus("proposed")
      },
      ...approvals.map((row) => ({
        time: safeDate(row.event_time),
        status: row.new_status,
        label: customerStatus(row.new_status),
        comment: row.comment || null
      })),
      ...mock.map((row) => ({
        time: safeDate(row.event_time),
        status: "mock_result",
        label: customerStatus("mock_result"),
        message: row.simulation_message
      }))
    ].sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
    const durationHours = Math.max(
      0,
      (Date.parse(proposal.end_time) - Date.parse(proposal.start_time)) / 3600000
    );
    const allocatedKw = contributions.reduce(
      (sum, row) => sum + toNumber(row.allocated_reduction_kw),
      0
    );

    return {
      proposal_id: id,
      signal_id: proposal.signal_id,
      requested_action: proposal.requested_action,
      proposed_action: proposal.proposed_action,
      target_kw: round(proposal.target_kw),
      start_time: safeDate(proposal.start_time),
      end_time: safeDate(proposal.end_time),
      duration_minutes: round(durationHours * 60, 0),
      priority: proposal.priority,
      status: proposal.status,
      display_status: customerStatus(proposal.status),
      reason: proposal.reason,
      suggested_device_contributions: contributions.map((row) => ({
        device_id: row.device_id,
        device_type: row.device_type,
        allocated_reduction_kw: round(row.allocated_reduction_kw),
        customer_action: customerStatus(row.status),
        no_real_execution: row.no_real_execution !== false
      })),
      mock_dispatch_status: mock.length ? customerStatus("mock_result") : "Not simulated yet",
      simulated_shifted_energy_kwh: allocatedKw > 0
        ? round(allocatedKw * durationHours)
        : null,
      shifted_energy_quality: "simulated_estimate",
      timeline
    };
  });

  const unsafe = [
    ...mockResult.rows.filter((row) => row.no_real_execution !== true),
    ...deviceResult.rows.filter((row) => row.no_real_execution !== true)
  ];
  return {
    latest_event: events[0] || null,
    events,
    flexible_load_currently_available_kw: events[0]?.suggested_device_contributions
      .reduce((sum, row) => sum + toNumber(row.allocated_reduction_kw), 0) || null,
    no_real_execution: unsafe.length === 0,
    execution_mode: "simulation_only"
  };
}

async function getCustomerCommunity(pool, context, householdId, config) {
  const summaryResult = await pool.query(
    `
      WITH household_load AS (
        SELECT
          household_id,
          sum(coalesce(current_power_kw, 0)) AS demand_kw,
          sum(coalesce(current_power_kw, 0)) FILTER (
            WHERE device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
              AND last_seen >= now() - interval '10 minutes'
          ) AS flexible_kw,
          max(last_seen) AS last_seen
        FROM customer_device_latest_state
        WHERE community_id = $1
        GROUP BY household_id
      )
      SELECT
        count(*)::integer AS household_count,
        count(*) FILTER (WHERE last_seen >= now() - interval '10 minutes')::integer AS active_households,
        coalesce(sum(demand_kw), 0) AS total_demand_kw,
        coalesce(sum(flexible_kw), 0) AS flexible_load_kw,
        avg(demand_kw) AS average_household_load_kw
      FROM household_load
    `,
    [context.communityId]
  );
  const distributionResult = await pool.query(
    `
      SELECT device_type, count(*)::integer AS count
      FROM customer_device_latest_state
      WHERE community_id = $1
      GROUP BY device_type
      ORDER BY count(*) DESC, device_type
    `,
    [context.communityId]
  );
  const percentileResult = await pool.query(
    `
      WITH household_load AS (
        SELECT household_id, sum(coalesce(current_power_kw, 0)) AS demand_kw
        FROM customer_device_latest_state
        WHERE community_id = $1
        GROUP BY household_id
      ),
      selected AS (
        SELECT demand_kw FROM household_load WHERE household_id = $2
      )
      SELECT
        count(*)::integer AS comparison_households,
        CASE
          WHEN count(*) >= 5 THEN
            100.0 * count(*) FILTER (
              WHERE demand_kw <= (SELECT demand_kw FROM selected)
            ) / count(*)
          ELSE NULL
        END AS selected_percentile
      FROM household_load
    `,
    [context.communityId, householdId]
  );
  const eventResult = await pool.query(
    `
      SELECT
        count(*) FILTER (WHERE end_time >= now())::integer AS active_events,
        coalesce(sum(target_kw) FILTER (WHERE end_time >= now()), 0) AS active_target_kw
      FROM dispatch_commands
      WHERE community_id = $1
    `,
    [context.communityId]
  );
  const summary = summaryResult.rows[0] || {};
  const percentile = percentileResult.rows[0] || {};
  const comparisonAvailable = toNumber(percentile.comparison_households) >= 5
    && percentile.selected_percentile !== null;

  return {
    community_id: context.communityId,
    selected_household: stableHouseholdPseudonym(
      householdId,
      config.customerPseudonymizationSalt
    ),
    household_count: toNumber(summary.household_count),
    active_households: toNumber(summary.active_households),
    total_community_demand_kw: round(summary.total_demand_kw),
    flexible_load_available_kw: round(summary.flexible_load_kw),
    average_household_load_kw: summary.average_household_load_kw === null
      ? null
      : round(summary.average_household_load_kw),
    active_flexibility_events: toNumber(eventResult.rows[0]?.active_events),
    active_requested_reduction_kw: round(eventResult.rows[0]?.active_target_kw),
    device_type_distribution: distributionResult.rows.map((row) => ({
      device_type: row.device_type,
      count: toNumber(row.count)
    })),
    comparison_available: comparisonAvailable,
    selected_household_percentile: comparisonAvailable
      ? round(percentile.selected_percentile, 0)
      : null,
    privacy: {
      anonymized: true,
      household_identifiers_exposed: false,
      minimum_comparison_group: 5
    }
  };
}

function reportRange(period) {
  const normalized = ["daily", "weekly", "monthly"].includes(period)
    ? period
    : "weekly";
  const days = normalized === "daily" ? 1 : normalized === "monthly" ? 31 : 7;
  return { period: normalized, days };
}

async function getCustomerReports(pool, context, householdId, options = {}) {
  const range = reportRange(options.period);
  const energyResult = await pool.query(
    `
      SELECT
        day_start,
        energy_used_kwh,
        metered_energy_kwh,
        estimated_energy_kwh,
        data_quality
      FROM customer_household_daily_energy
      WHERE household_id = $1
        AND day_start >= time_bucket(interval '1 day', now()) - ($2::integer - 1) * interval '1 day'
      ORDER BY day_start
    `,
    [householdId, range.days]
  );
  const deviceResult = await pool.query(
    `
      SELECT
        device_id,
        device_type,
        sum(energy_used_kwh) AS energy_used_kwh,
        bool_or(data_quality = 'estimated') AS contains_estimate
      FROM customer_device_daily_energy
      WHERE household_id = $1
        AND day_start >= time_bucket(interval '1 day', now()) - ($2::integer - 1) * interval '1 day'
      GROUP BY device_id, device_type
      ORDER BY energy_used_kwh DESC
      LIMIT 50
    `,
    [householdId, range.days]
  );
  const eventsResult = await pool.query(
    `
      SELECT
        id, start_time, end_time, target_kw, status, requested_action, reason
      FROM dispatch_commands
      WHERE community_id = $2
        AND (household_id = $1 OR household_id IS NULL)
        AND event_time >= now() - $3::integer * interval '1 day'
      ORDER BY event_time DESC
      LIMIT 100
    `,
    [householdId, context.communityId, range.days]
  );

  return {
    period: range.period,
    period_days: range.days,
    generated_at: new Date().toISOString(),
    energy: energyResult.rows.map((row) => ({
      day: safeDate(row.day_start),
      energy_used_kwh: round(row.energy_used_kwh),
      metered_energy_kwh: round(row.metered_energy_kwh),
      estimated_energy_kwh: round(row.estimated_energy_kwh),
      data_quality: row.data_quality
    })),
    device_breakdown: deviceResult.rows.map((row) => ({
      device_id: row.device_id,
      device_type: row.device_type,
      energy_used_kwh: round(row.energy_used_kwh),
      data_quality: row.contains_estimate ? "contains_estimate" : "measured"
    })),
    flexibility_history: eventsResult.rows.map((row) => ({
      proposal_id: String(row.id),
      start_time: safeDate(row.start_time),
      end_time: safeDate(row.end_time),
      target_kw: round(row.target_kw),
      status: row.status,
      display_status: customerStatus(row.status),
      requested_action: row.requested_action,
      reason: row.reason,
      result_type: "simulated"
    })),
    labels: {
      measured: "Measured from simulated meter telemetry",
      estimated: "Estimated from sampled simulated power",
      simulated: "Simulated workflow result"
    }
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCustomerReportCsv(report) {
  const rows = [
    ["section", "date_or_id", "category", "value", "unit", "quality_or_status"]
  ];
  for (const item of report.energy || []) {
    rows.push([
      "household_energy",
      item.day,
      "energy_used",
      item.energy_used_kwh,
      "kWh",
      item.data_quality
    ]);
  }
  for (const item of report.device_breakdown || []) {
    rows.push([
      "device_energy",
      item.device_id,
      item.device_type,
      item.energy_used_kwh,
      "kWh",
      item.data_quality
    ]);
  }
  for (const item of report.flexibility_history || []) {
    rows.push([
      "flexibility_event",
      item.proposal_id,
      item.requested_action,
      item.target_kw,
      "kW",
      item.display_status
    ]);
  }
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

module.exports = {
  buildCustomerReportCsv,
  getCustomerAnalytics,
  getCustomerCommunity,
  getCustomerDevices,
  getCustomerFlexibility,
  getCustomerReports,
  getCustomerSummary,
  listHouseholds,
  reportRange
};
