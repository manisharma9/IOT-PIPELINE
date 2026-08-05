import type { CustomerRole } from "@/lib/auth";

export type ApiEnvelope<T> = {
  ok: boolean;
  status_code: number;
  correlation_id: string | null;
  data: T;
};

export type CustomerSession = {
  username: string;
  role: CustomerRole;
  household_id: string | null;
  community_id: string;
};

export type HouseholdOption = {
  selector_id: string;
  display_name: string;
  pseudonym: string;
  last_seen?: string;
  device_count?: number;
  selected_by_default?: boolean;
};

export type CustomerSummary = {
  household: {
    id?: string;
    display_name: string;
    pseudonym: string;
    community_id: string;
  };
  connection: {
    status: "live" | "stale" | "no_data";
    last_updated: string | null;
  };
  live_consumption_kw: number | null;
  energy_used_today_kwh: number | null;
  energy_used_today_quality: string;
  active_devices: number;
  total_devices: number;
  flexible_load_available_kw: number | null;
  flexible_load_quality: string;
  current_grid_event: FlexibilityEvent | null;
  simulated_energy_shifted_today_kwh: number | null;
  shifted_energy_quality: string;
  flexibility_score: FlexibilityScoreResult;
  simulation: {
    enabled: boolean;
    no_real_execution: boolean;
    notice: string;
  };
  unavailable_metrics: string[];
};

export type AnalyticsPoint = {
  bucket_start: string;
  total_power_kw: number;
  smart_plug_power_kw: number;
  ev_charger_power_kw: number;
  heat_pump_power_kw: number;
  sample_count: number;
};

export type CustomerAnalytics = {
  range: {
    label: string;
    start: string;
    end: string;
    bucket: string;
  };
  units: "kW";
  points: AnalyticsPoint[];
  data_status: "available" | "empty";
  data_quality: string;
  partial_data: boolean;
  flexibility_events: Array<{
    proposal_id: string;
    start_time: string;
    end_time: string;
    target_kw: number;
    status: string;
    display_status: string;
  }>;
};

export type CustomerDevice = {
  device_id: string;
  device_type: string;
  device_category: string;
  display_name: string;
  household_profile: string | null;
  provider: string;
  simulated: boolean;
  no_real_execution: boolean;
  online: boolean;
  last_seen: string | null;
  current_power_kw: number | null;
  energy_used_today_kwh: number | null;
  energy_quality: string;
  operating_state: string;
  indoor_temperature_c: number | null;
  target_temperature_c: number | null;
  water_temperature_c: number | null;
  battery_soc_percent: number | null;
  pv_generation_kw: number | null;
  voltage_v: number | null;
  current_a: number | null;
  flexibility_capable: boolean;
  maximum_flexible_power_kw: number;
  flexibility_available: boolean;
  flexibility_available_kw: number;
  latest_simulated_command: {
    action: string;
    status: string;
    time: string | null;
    no_real_execution: boolean;
  } | null;
  event_participation: boolean;
};

export type CustomerDevices = {
  limit: number;
  offset: number;
  total: number;
  devices: CustomerDevice[];
  summary: {
    total_devices: number;
    online_devices: number;
    active_devices: number;
    flexible_devices: number;
    current_consumption_kw: number;
    energy_used_today_kwh: number;
    energy_scope: string;
    by_category: Array<{ category: string; count: number }>;
    by_flexibility: {
      flexible: number;
      not_flexible: number;
    };
  };
  filters: {
    category: string | null;
    profile: string | null;
    search: string | null;
    online: boolean | null;
    flexible: boolean | null;
    state: string | null;
  };
  simulation: boolean;
  no_real_execution: boolean;
};

export type CustomerDeviceDetail = {
  device: CustomerDevice;
  recent_usage: Array<{
    timestamp: string;
    power_kw: number;
  }>;
  event_participation: {
    participated: boolean;
    latest_simulated_command: CustomerDevice["latest_simulated_command"];
  };
  simulated: boolean;
  no_real_execution: boolean;
};

export type FlexibilityTimelineItem = {
  time: string;
  status: string;
  label: string;
  comment?: string | null;
  message?: string | null;
};

export type FlexibilityEvent = {
  proposal_id: string;
  signal_id?: string;
  requested_action: string;
  proposed_action: string;
  target_kw: number;
  start_time: string;
  end_time: string;
  duration_minutes?: number;
  priority: string;
  status: string;
  display_status: string;
  reason: string;
  suggested_device_contributions?: Array<{
    device_id: string;
    device_type: string;
    allocated_reduction_kw: number;
    customer_action: string;
    no_real_execution: boolean;
  }>;
  mock_dispatch_status?: string;
  simulated_shifted_energy_kwh?: number | null;
  shifted_energy_quality?: string;
  timeline?: FlexibilityTimelineItem[];
};

export type CustomerFlexibility = {
  latest_event: FlexibilityEvent | null;
  events: FlexibilityEvent[];
  flexible_load_currently_available_kw: number | null;
  no_real_execution: boolean;
  execution_mode: "simulation_only";
};

export type FlexibilityScoreResult =
  | {
      available: false;
      score: null;
      reason: string;
      components: [];
    }
  | {
      available: true;
      score: number;
      reason: null;
      components: Array<{
        id: string;
        label: string;
        points: number;
        maximum: number;
      }>;
    };

export type CommunitySummary = {
  community_id: string;
  selected_household: string;
  household_count: number;
  active_households: number;
  total_community_demand_kw: number;
  flexible_load_available_kw: number;
  average_household_load_kw: number | null;
  active_flexibility_events: number;
  active_requested_reduction_kw: number;
  device_type_distribution: Array<{
    device_type: string;
    count: number;
  }>;
  validation_population: {
    cohort: string;
    household_count: number;
    asset_count: number;
    online_assets: number;
    active_assets: number;
    flexible_assets: number;
    total_simulated_demand_kw: number;
    available_flexibility_kw: number;
    by_profile: Array<{
      profile: string;
      households: number;
      assets: number;
    }>;
    by_category: Array<{
      category: string;
      count: number;
    }>;
    semantic_progress: {
      normalized_assets: number;
      terminal_slm_assets: number;
      mapped_assets: number;
      safely_unmapped_assets: number;
      completion_percent: number;
    };
    simulated: boolean;
    no_real_execution: boolean;
  };
  comparison_available: boolean;
  selected_household_percentile: number | null;
  privacy: {
    anonymized: boolean;
    household_identifiers_exposed: boolean;
    minimum_comparison_group: number;
  };
};

export type CustomerReports = {
  period: "daily" | "weekly" | "monthly";
  period_days: number;
  generated_at: string;
  energy: Array<{
    day: string;
    energy_used_kwh: number;
    metered_energy_kwh: number;
    estimated_energy_kwh: number;
    data_quality: string;
  }>;
  device_breakdown: Array<{
    device_id: string;
    device_type: string;
    energy_used_kwh: number;
    data_quality: string;
  }>;
  flexibility_history: FlexibilityEvent[];
  labels: Record<string, string>;
};

export type CustomerInsight = {
  insight_id: string;
  category: string;
  title: string;
  text: string;
  supporting_metrics: Record<string, unknown> | null;
  period_start: string | null;
  period_end: string | null;
  generated_at: string;
  expires_at: string;
  confidence: number;
  validation_status: string;
  label: "AI-powered energy insight";
};

export type CustomerInsights = {
  status: "cached" | "generated" | "not_enough_data" | "temporarily_unavailable";
  insights: CustomerInsight[];
  reason?: string;
};
