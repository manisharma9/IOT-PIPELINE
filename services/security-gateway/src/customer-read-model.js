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

const POWER_DEVICE_TYPES = new Set([
  "smart_plug",
  "shelly_plug",
  "washing_machine",
  "clothes_dryer",
  "dishwasher",
  "lighting_circuit",
  "ev_charger",
  "heat_pump",
  "thermostat_hvac",
  "water_heater",
  "solar_inverter",
  "home_battery"
]);

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
        count(*) FILTER (
          WHERE state.last_seen >= now() - interval '10 minutes'
        )::integer AS active_devices,
        coalesce(sum(greatest(coalesce(state.current_power_kw, 0), 0)) FILTER (
          WHERE coalesce(registry.device_category, state.device_type)
            NOT IN ('smart_meter', 'solar_inverter')
        ), 0) AS live_consumption_kw,
        coalesce(sum(coalesce(
          registry.maximum_flexible_power_kw,
          greatest(coalesce(state.current_power_kw, 0), 0)
        )) FILTER (
          WHERE coalesce(
              registry.flexibility_capable,
              state.device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
            )
            AND state.last_seen >= now() - interval '10 minutes'
        ), 0) AS flexible_load_available_kw,
        count(*) FILTER (
          WHERE coalesce(
              registry.flexibility_capable,
              state.device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
            )
            AND state.last_seen >= now() - interval '10 minutes'
        )::integer AS eligible_devices,
        bool_or(coalesce(registry.device_category, state.device_type) = 'ev_charger') AS has_ev,
        bool_or(coalesce(registry.device_category, state.device_type) = 'heat_pump') AS has_heat_pump,
        max(state.last_seen) AS last_updated
      FROM simulated_device_registry registry
      FULL OUTER JOIN customer_device_latest_state state
        ON state.device_id = registry.device_id
       AND state.household_id = registry.household_id
      WHERE coalesce(registry.household_id, state.household_id) = $1
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
  const parameters = [householdId];
  const clauses = ["inventory.household_id = $1"];
  function addFilter(value, expression) {
    if (value === undefined || value === null || value === "") return;
    parameters.push(value);
    clauses.push(expression.replace("?", `$${parameters.length}`));
  }
  addFilter(options.category, "inventory.device_category = ?");
  addFilter(options.profile, "inventory.household_profile = ?");
  addFilter(options.deviceId, "inventory.device_id = ?");
  if (options.search) {
    parameters.push(`%${String(options.search).toLowerCase()}%`);
    clauses.push(
      `(lower(inventory.display_name) LIKE $${parameters.length} OR ` +
      `lower(inventory.device_id) LIKE $${parameters.length})`
    );
  }
  if (options.online === true || options.online === false) {
    addFilter(options.online, "(inventory.last_seen >= now() - interval '10 minutes') = ?");
  }
  if (options.flexible === true || options.flexible === false) {
    addFilter(options.flexible, "inventory.flexibility_capable = ?");
  }
  if (options.state === "active") {
    clauses.push("abs(coalesce(inventory.current_power_kw, 0)) > 0.05");
  } else if (options.state === "idle") {
    clauses.push("abs(coalesce(inventory.current_power_kw, 0)) <= 0.05");
  } else if (options.state === "offline") {
    clauses.push("(inventory.last_seen IS NULL OR inventory.last_seen < now() - interval '10 minutes')");
  }

  const inventoryCte = `
    WITH inventory AS (
      SELECT
        coalesce(registry.household_id, state.household_id) AS household_id,
        coalesce(registry.community_id, state.community_id) AS community_id,
        coalesce(registry.device_id, state.device_id) AS device_id,
        coalesce(registry.device_category, state.device_type) AS device_category,
        coalesce(registry.device_category, state.device_type) AS device_type,
        coalesce(registry.display_name,
          CASE state.device_type
            WHEN 'shelly_plug' THEN 'Shelly smart plug'
            WHEN 'ev_charger' THEN 'Easee EV charger'
            WHEN 'heat_pump' THEN 'Heat pump'
            ELSE 'Connected energy device'
          END
        ) AS display_name,
        registry.household_profile,
        registry.provider,
        coalesce(
          registry.flexibility_capable,
          state.device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
        ) AS flexibility_capable,
        coalesce(
          registry.maximum_flexible_power_kw,
          CASE
            WHEN state.device_type IN ('shelly_plug', 'ev_charger', 'heat_pump')
              THEN greatest(coalesce(state.current_power_kw, 0), 0)
            ELSE 0
          END
        ) AS maximum_flexible_power_kw,
        coalesce(registry.simulated, true) AS simulated,
        coalesce(registry.no_real_execution, true) AS no_real_execution_registry,
        state.last_seen,
        state.current_power_kw,
        state.cumulative_energy_kwh,
        state.voltage_v,
        state.current_a,
        state.indoor_temperature_c,
        state.target_temperature_c,
        state.flow_temperature_c,
        state.charging_state_code,
        state.operating_mode_code,
        state.operating_state_code,
        state.water_temperature_c,
        state.battery_soc_percent,
        state.pv_generation_kw,
        state.battery_power_kw
      FROM simulated_device_registry registry
      FULL OUTER JOIN customer_device_latest_state state
        ON state.device_id = registry.device_id
       AND state.household_id = registry.household_id
    )
  `;
  const where = clauses.join("\n AND ");
  const pageParameters = [...parameters, limit, offset];
  const result = await pool.query(
    `
      ${inventoryCte}
      SELECT
        inventory.*,
        energy.energy_used_kwh,
        energy.data_quality AS energy_quality,
        command.action AS latest_action,
        command.status AS latest_command_status,
        command.event_time AS latest_command_time,
        command.no_real_execution AS command_no_real_execution
      FROM inventory
      LEFT JOIN customer_device_daily_energy energy
        ON energy.household_id = inventory.household_id
       AND energy.device_id = inventory.device_id
       AND energy.day_start = time_bucket(interval '1 day', now())
      LEFT JOIN LATERAL (
        SELECT action, status, event_time, no_real_execution
        FROM device_command_audit
        WHERE device_id = inventory.device_id
        ORDER BY created_at DESC
        LIMIT 1
      ) command ON true
      WHERE ${where}
      ORDER BY inventory.last_seen DESC NULLS LAST, inventory.display_name, inventory.device_id
      LIMIT $${pageParameters.length - 1} OFFSET $${pageParameters.length}
    `,
    pageParameters
  );
  const aggregateResult = await pool.query(
    `
      ${inventoryCte}
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (
          WHERE last_seen >= now() - interval '10 minutes'
        )::integer AS online,
        count(*) FILTER (
          WHERE abs(coalesce(current_power_kw, 0)) > 0.05
        )::integer AS active,
        count(*) FILTER (WHERE flexibility_capable)::integer AS flexible,
        coalesce(sum(greatest(coalesce(current_power_kw, 0), 0)) FILTER (
          WHERE device_category NOT IN ('smart_meter', 'solar_inverter')
        ), 0) AS current_consumption_kw
      FROM inventory
      WHERE ${where}
    `,
    parameters
  );
  const categoryResult = await pool.query(
    `
      ${inventoryCte}
      SELECT device_category, count(*)::integer AS count
      FROM inventory
      WHERE ${where}
      GROUP BY device_category
      ORDER BY device_category
    `,
    parameters
  );
  const energyResult = await pool.query(
    `
      ${inventoryCte}
      SELECT coalesce(sum(energy.energy_used_kwh), 0) AS energy_used_today_kwh
      FROM inventory
      LEFT JOIN customer_device_daily_energy energy
        ON energy.household_id = inventory.household_id
       AND energy.device_id = inventory.device_id
       AND energy.day_start = time_bucket(interval '1 day', now())
      WHERE ${where}
        AND inventory.device_category <> 'smart_meter'
    `,
    parameters
  );

  const now = Date.now();
  const devices = result.rows.map((row) => {
    const lastSeen = safeDate(row.last_seen);
    const online = lastSeen ? now - Date.parse(lastSeen) <= 10 * 60 * 1000 : false;
    const currentPower = row.current_power_kw === null ? null : round(row.current_power_kw);
    return {
      device_id: row.device_id,
      device_type: row.device_type,
      device_category: row.device_category,
      display_name: row.display_name,
      household_profile: row.household_profile || null,
      provider: row.provider || "simulated",
      simulated: row.simulated !== false,
      no_real_execution: row.no_real_execution_registry !== false,
      online,
      last_seen: lastSeen,
      current_power_kw: currentPower,
      energy_used_today_kwh: row.energy_used_kwh === null ? null : round(row.energy_used_kwh),
      energy_quality: row.energy_quality || "unavailable",
      operating_state: operatingState(row),
      indoor_temperature_c: row.indoor_temperature_c === null ? null : round(row.indoor_temperature_c, 1),
      target_temperature_c: row.target_temperature_c === null ? null : round(row.target_temperature_c, 1),
      water_temperature_c: row.water_temperature_c === null ? null : round(row.water_temperature_c, 1),
      battery_soc_percent: row.battery_soc_percent === null ? null : round(row.battery_soc_percent, 1),
      pv_generation_kw: row.pv_generation_kw === null ? null : round(row.pv_generation_kw),
      voltage_v: row.voltage_v === null ? null : round(row.voltage_v, 1),
      current_a: row.current_a === null ? null : round(row.current_a, 2),
      flexibility_capable:
        row.flexibility_capable === true || POWER_DEVICE_TYPES.has(row.device_type),
      maximum_flexible_power_kw: round(row.maximum_flexible_power_kw),
      flexibility_available:
        online && (row.flexibility_capable === true || POWER_DEVICE_TYPES.has(row.device_type)),
      flexibility_available_kw:
        online && (row.flexibility_capable === true || POWER_DEVICE_TYPES.has(row.device_type))
        ? round(row.maximum_flexible_power_kw || Math.max(toNumber(currentPower), 0))
        : 0,
      latest_simulated_command: row.latest_action ? {
        action: row.latest_action,
        status: row.latest_command_status,
        time: safeDate(row.latest_command_time),
        no_real_execution: row.command_no_real_execution !== false
      } : null,
      event_participation: Boolean(row.latest_action)
    };
  });

  const aggregate = aggregateResult.rows[0] || {};
  return {
    limit,
    offset,
    total: toNumber(aggregate.total),
    devices,
    summary: {
      total_devices: toNumber(aggregate.total),
      online_devices: toNumber(aggregate.online),
      active_devices: toNumber(aggregate.active),
      flexible_devices: toNumber(aggregate.flexible),
      current_consumption_kw: round(aggregate.current_consumption_kw),
      energy_used_today_kwh: round(energyResult.rows[0]?.energy_used_today_kwh),
      energy_scope: "filtered_household_inventory",
      by_category: categoryResult.rows.map((row) => ({
        category: row.device_category,
        count: toNumber(row.count)
      })),
      by_flexibility: {
        flexible: toNumber(aggregate.flexible),
        not_flexible: Math.max(0, toNumber(aggregate.total) - toNumber(aggregate.flexible))
      }
    },
    filters: {
      category: options.category || null,
      profile: options.profile || null,
      search: options.search || null,
      online: options.online ?? null,
      flexible: options.flexible ?? null,
      state: options.state || null
    },
    simulation: true,
    no_real_execution: true
  };
}

async function getCustomerDeviceDetail(pool, context, householdId, deviceId) {
  const page = await getCustomerDevices(pool, context, householdId, {
    limit: 1,
    offset: 0,
    deviceId
  });
  const device = page.devices[0];
  if (!device) return null;

  const usageResult = await pool.query(
    `
      SELECT
        time_bucket(interval '15 minutes', event_time) AS bucket_start,
        avg(
          CASE
            WHEN reading_name = 'pv_generation_kw' THEN reading_value
            WHEN lower(coalesce(reading_unit, '')) IN ('w', 'watt', 'watts')
              THEN reading_value / 1000.0
            ELSE reading_value
          END
        ) AS power_kw
      FROM normalized_telemetry
      WHERE household_id = $1
        AND device_id = $2
        AND event_time >= now() - interval '24 hours'
        AND reading_name IN (
          'active_power_kw', 'ev_charging_power_kw', 'heat_pump_power_kw',
          'power_kw', 'power_w', 'active_power_w', 'pv_generation_kw',
          'battery_power_kw'
        )
      GROUP BY time_bucket(interval '15 minutes', event_time)
      ORDER BY bucket_start
      LIMIT 96
    `,
    [householdId, deviceId]
  );

  return {
    device,
    recent_usage: usageResult.rows.map((row) => ({
      timestamp: safeDate(row.bucket_start),
      power_kw: round(row.power_kw)
    })),
    event_participation: {
      participated: device.event_participation,
      latest_simulated_command: device.latest_simulated_command
    },
    simulated: true,
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
          coalesce(sum(coalesce(current_power_kw, 0)) FILTER (
            WHERE last_seen >= now() - interval '10 minutes'
          ), 0) AS demand_kw,
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
        avg(demand_kw) FILTER (
          WHERE last_seen >= now() - interval '10 minutes'
        ) AS average_household_load_kw
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
  const cohortPrefix = String(config.customerScaleCohortPrefix || "scale1000-");
  const cohortResult = await pool.query(
    `
      SELECT
        count(DISTINCT registry.household_id)::integer AS household_count,
        count(*)::integer AS asset_count,
        count(*) FILTER (
          WHERE coalesce(state.last_seen, registry.last_seen) >= now() - interval '20 minutes'
        )::integer AS online_assets,
        count(*) FILTER (
          WHERE coalesce(state.last_seen, registry.last_seen) >= now() - interval '20 minutes'
            AND abs(coalesce(state.current_power_kw, 0)) > 0.05
        )::integer AS active_assets,
        count(*) FILTER (WHERE registry.flexibility_capable)::integer AS flexible_assets,
        coalesce(sum(greatest(coalesce(state.current_power_kw, 0), 0)) FILTER (
          WHERE registry.device_category NOT IN ('smart_meter', 'solar_inverter')
            AND coalesce(state.last_seen, registry.last_seen) >= now() - interval '20 minutes'
        ), 0) AS total_demand_kw,
        coalesce(sum(registry.maximum_flexible_power_kw) FILTER (
          WHERE registry.flexibility_capable
            AND coalesce(state.last_seen, registry.last_seen) >= now() - interval '20 minutes'
        ), 0) AS available_flexibility_kw
      FROM simulated_device_registry registry
      LEFT JOIN customer_device_latest_state state
        ON state.household_id = registry.household_id
       AND state.device_id = registry.device_id
      WHERE registry.community_id = $1
        AND registry.household_id LIKE $2
    `,
    [context.communityId, `${cohortPrefix}%`]
  );
  const cohortProfileResult = await pool.query(
    `
      SELECT household_profile, count(DISTINCT household_id)::integer AS households,
        count(*)::integer AS assets
      FROM simulated_device_registry
      WHERE community_id = $1 AND household_id LIKE $2
      GROUP BY household_profile
      ORDER BY household_profile
    `,
    [context.communityId, `${cohortPrefix}%`]
  );
  const cohortCategoryResult = await pool.query(
    `
      SELECT device_category, count(*)::integer AS count
      FROM simulated_device_registry
      WHERE community_id = $1 AND household_id LIKE $2
      GROUP BY device_category
      ORDER BY device_category
    `,
    [context.communityId, `${cohortPrefix}%`]
  );
  const semanticProgressResult = await pool.query(
    `
      WITH latest AS (
        SELECT DISTINCT ON (n.device_id)
          n.device_id, n.reading_id
        FROM normalized_telemetry n
        WHERE n.community_id = $1 AND n.household_id LIKE $2
        ORDER BY n.device_id, n.event_time DESC, n.processed_at DESC
      )
      SELECT
        count(*)::integer AS normalized_assets,
        count(*) FILTER (WHERE audit.reading_id IS NOT NULL)::integer AS terminal_slm_assets,
        count(*) FILTER (WHERE audit.final_status = 'mapped')::integer AS mapped_assets,
        count(*) FILTER (WHERE audit.safely_unmapped)::integer AS safely_unmapped_assets
      FROM latest
      LEFT JOIN LATERAL (
        SELECT reading_id, final_status, safely_unmapped
        FROM semantic_slm_audit
        WHERE reading_id = latest.reading_id
        ORDER BY processed_at DESC
        LIMIT 1
      ) audit ON true
    `,
    [context.communityId, `${cohortPrefix}%`]
  );
  const summary = summaryResult.rows[0] || {};
  const percentile = percentileResult.rows[0] || {};
  const comparisonAvailable = toNumber(percentile.comparison_households) >= 5
    && percentile.selected_percentile !== null;

  const cohort = cohortResult.rows[0] || {};
  const semanticProgress = semanticProgressResult.rows[0] || {};

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
    validation_population: {
      cohort:
        toNumber(cohort.household_count) === 100 && toNumber(cohort.asset_count) === 1000
          ? "validated_1000_asset_local_cohort"
          : "controlled_scale_validation_cohort",
      household_count: toNumber(cohort.household_count),
      asset_count: toNumber(cohort.asset_count),
      online_assets: toNumber(cohort.online_assets),
      active_assets: toNumber(cohort.active_assets),
      flexible_assets: toNumber(cohort.flexible_assets),
      total_simulated_demand_kw: round(cohort.total_demand_kw),
      available_flexibility_kw: round(cohort.available_flexibility_kw),
      by_profile: cohortProfileResult.rows.map((row) => ({
        profile: row.household_profile,
        households: toNumber(row.households),
        assets: toNumber(row.assets)
      })),
      by_category: cohortCategoryResult.rows.map((row) => ({
        category: row.device_category,
        count: toNumber(row.count)
      })),
      semantic_progress: {
        normalized_assets: toNumber(semanticProgress.normalized_assets),
        terminal_slm_assets: toNumber(semanticProgress.terminal_slm_assets),
        mapped_assets: toNumber(semanticProgress.mapped_assets),
        safely_unmapped_assets: toNumber(semanticProgress.safely_unmapped_assets),
        completion_percent: toNumber(semanticProgress.normalized_assets)
          ? round(
            100 * toNumber(semanticProgress.terminal_slm_assets) /
            toNumber(semanticProgress.normalized_assets),
            1
          )
          : 0
      },
      simulated: true,
      no_real_execution: true
    },
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
  getCustomerDeviceDetail,
  getCustomerDevices,
  getCustomerFlexibility,
  getCustomerReports,
  getCustomerSummary,
  listHouseholds,
  reportRange
};
