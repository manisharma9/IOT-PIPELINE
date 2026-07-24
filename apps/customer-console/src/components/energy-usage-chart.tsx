"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AnalyticsPoint } from "@/lib/customer-types";
import { formatNumber } from "@/components/product-ui";

export function EnergyUsageChart({
  points,
  compact = false
}: {
  points: AnalyticsPoint[];
  compact?: boolean;
}) {
  const data = points.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat("en-IE", compact ? {
      hour: "2-digit",
      minute: "2-digit"
    } : {
      day: "2-digit",
      month: "short",
      hour: "2-digit"
    }).format(new Date(point.bucket_start))
  }));

  return (
    <div className={compact ? "h-64 w-full" : "h-[22rem] w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8291a6", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            unit=" kW"
            tick={{ fill: "#8291a6", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={62}
          />
          <Tooltip
            contentStyle={{
              background: "#0b1726",
              border: "1px solid rgba(103,232,249,0.18)",
              borderRadius: 8,
              color: "#f8fafc"
            }}
            labelStyle={{ color: "#cbd5e1", marginBottom: 8 }}
            formatter={(value, name) => [
              `${formatNumber(Number(value))} kW`,
              String(name)
            ]}
          />
          {!compact ? (
            <Legend
              wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="total_power_kw"
            name="Total household"
            stroke="#67e8f9"
            fill="rgba(103,232,249,0.10)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {!compact ? (
            <>
              <Line
                type="monotone"
                dataKey="ev_charger_power_kw"
                name="EV charger"
                stroke="#34d399"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="heat_pump_power_kw"
                name="Heat pump"
                stroke="#fbbf24"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="smart_plug_power_kw"
                name="Smart plug"
                stroke="#a78bfa"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </>
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="sr-only">
        Household power chart with {points.length} downsampled data points.
      </p>
    </div>
  );
}

