"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiEnvelope } from "@/lib/customer-types";

type CustomerResource<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  correlationId: string | null;
  refresh: () => Promise<void>;
};

export async function fetchCustomerData<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; correlationId: string | null }> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { message?: string; error?: string }
    | null;

  if (!response.ok || !payload || !("data" in payload)) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Energy information is temporarily unavailable."
    );
  }

  return {
    data: payload.data,
    correlationId: payload.correlation_id
  };
}

export function useCustomerResource<T>(
  path: string | null,
  options: { refreshIntervalMs?: number } = {}
): CustomerResource<T> {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    error: string | null;
    correlationId: string | null;
  }>({
    path: null,
    data: null,
    error: null,
    correlationId: null
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    fetchCustomerData<T>(path)
      .then((result) => {
        if (!active) return;
        setState({
          path,
          data: result.data,
          error: null,
          correlationId: result.correlationId
        });
      })
      .catch((loadError) => {
        if (!active) return;
        setState({
          path,
          data: null,
          error: loadError instanceof Error
            ? loadError.message
            : "Energy information is temporarily unavailable.",
          correlationId: null
        });
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [path, refreshVersion]);

  useEffect(() => {
    if (!path || !options.refreshIntervalMs) return;
    const timer = window.setInterval(() => {
      setRefreshVersion((version) => version + 1);
    }, options.refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [path, options.refreshIntervalMs]);

  const refresh = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    setRefreshVersion((version) => version + 1);
  }, [path]);

  return {
    data: state.path === path ? state.data : null,
    loading: Boolean(path) && state.path !== path,
    refreshing,
    error: state.path === path ? state.error : null,
    correlationId: state.path === path ? state.correlationId : null,
    refresh
  };
}

export function withHousehold(path: string, householdId: string | null) {
  if (!householdId) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}household_id=${encodeURIComponent(householdId)}`;
}
