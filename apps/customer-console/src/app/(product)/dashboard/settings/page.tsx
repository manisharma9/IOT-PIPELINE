"use client";

import {
  Bell,
  EyeOff,
  KeyRound,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserRound
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCustomerPortal } from "@/components/product-shell";
import {
  ProductPageHeader,
  ProductPanel,
  SimulationNotice,
  StatusPill
} from "@/components/product-ui";

export default function SettingsPage() {
  const { session, householdLabel } = useCustomerPortal();
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [compactNumbers, setCompactNumbers] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <ProductPageHeader
        eyebrow="Settings"
        title="Account, privacy and display preferences"
        description="Review your local demonstration access, household scope and product preferences."
      />
      <SimulationNotice />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProductPanel title="Account access">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-300">
              <UserRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{session.username}</p>
              <p className="mt-1 text-sm text-slate-400">{roleLabel(session.role)}</p>
              <div className="mt-3"><StatusPill label={householdLabel} tone="cyan" /></div>
            </div>
          </div>
          <div className="mt-6 border-t border-white/8 pt-4">
            <button type="button" className="product-secondary-button" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </ProductPanel>

        <ProductPanel title="Authentication">
          <SettingLine
            icon={<KeyRound className="h-4 w-4" />}
            title="Local protected session"
            detail="The current environment uses a signed, server-side demonstration session."
          />
          <SettingLine
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Production identity ready"
            detail="A managed identity provider can replace local credentials during deployment."
          />
        </ProductPanel>

        <ProductPanel title="Display preferences">
          <ToggleSetting
            icon={<Bell className="h-4 w-4" />}
            title="Event notifications"
            detail="Show visual notifications for new flexibility opportunities."
            checked={notifications}
            onChange={setNotifications}
          />
          <ToggleSetting
            icon={<SlidersHorizontal className="h-4 w-4" />}
            title="Compact number display"
            detail="This view preference does not change stored energy data."
            checked={compactNumbers}
            onChange={setCompactNumbers}
          />
        </ProductPanel>

        <ProductPanel title="Privacy boundaries">
          <SettingLine
            icon={<EyeOff className="h-4 w-4" />}
            title="Household isolation"
            detail="Your session is restricted to its authorized household or pseudonymized operator scope."
          />
          <SettingLine
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Community anonymization"
            detail="Community views contain aggregate information and protected comparisons only."
          />
          <SettingLine
            icon={<ShieldCheck className="h-4 w-4" />}
            title="No physical control"
            detail="All device instructions remain simulated and explicitly marked as non-executing."
          />
        </ProductPanel>
      </div>
    </>
  );
}

function SettingLine({
  icon,
  title,
  detail
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/8 py-4 first:pt-0 last:border-0 last:pb-0">
      <span className="mt-0.5 text-cyan-300">{icon}</span>
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function ToggleSetting({
  icon,
  title,
  detail,
  checked,
  onChange
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-cyan-300">{icon}</span>
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-cyan-300"
        aria-label={title}
      />
    </div>
  );
}

function roleLabel(role: string) {
  return role === "household_user"
    ? "Household account"
    : role === "enershare_operator"
      ? "EnerShare operator"
      : "Technical administrator";
}
