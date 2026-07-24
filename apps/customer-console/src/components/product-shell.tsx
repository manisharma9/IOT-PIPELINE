"use client";

import {
  BarChart3,
  Building2,
  ChevronDown,
  FileText,
  Gauge,
  Home,
  LogOut,
  Menu,
  PlugZap,
  Settings,
  ShieldCheck,
  Sparkles,
  Waves,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  ApiEnvelope,
  CustomerSession,
  HouseholdOption
} from "@/lib/customer-types";

type CustomerPortalContextValue = {
  session: CustomerSession;
  selectedHousehold: string | null;
  householdLabel: string;
  households: HouseholdOption[];
  setSelectedHousehold: (value: string) => void;
  selectorLoading: boolean;
};

const CustomerPortalContext = createContext<CustomerPortalContextValue | null>(
  null
);

const productNavigation = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/analytics", label: "Energy analytics", icon: BarChart3 },
  { href: "/dashboard/devices", label: "Connected devices", icon: PlugZap },
  { href: "/dashboard/flexibility", label: "Flexibility", icon: Waves },
  { href: "/dashboard/community", label: "Community", icon: Building2 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export function useCustomerPortal() {
  const context = useContext(CustomerPortalContext);
  if (!context) {
    throw new Error("useCustomerPortal must be used inside ProductShell");
  }
  return context;
}

export function ProductShell({
  session,
  children
}: {
  session: CustomerSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState<string | null>(
    session.role === "household_user" ? session.household_id : null
  );
  const [selectorLoading, setSelectorLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/customer/households", {
          cache: "no-store"
        });
        const payload = (await response.json()) as ApiEnvelope<{
          households: HouseholdOption[];
        }>;
        if (!active || !response.ok) return;
        const options = payload.data.households || [];
        setHouseholds(options);
        if (!selectedHousehold) {
          setSelectedHousehold(
            options.find((item) => item.selected_by_default)?.selector_id ||
              options[0]?.selector_id ||
              null
          );
        }
      } catch {
        // Pages retain their independent unavailable state.
      } finally {
        if (active) setSelectorLoading(false);
      }
    }
    void loadHouseholds();
    return () => {
      active = false;
    };
  }, [selectedHousehold]);

  const householdLabel = useMemo(() => {
    const selected = households.find(
      (item) => item.selector_id === selectedHousehold
    );
    return selected?.display_name || (
      session.role === "household_user" ? "Your household" : "Latest household"
    );
  }, [households, selectedHousehold, session.role]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/dashboard"
      ? pathname === href
      : pathname.startsWith(href);
  }

  const navigation = (
    <nav aria-label="Product navigation" className="space-y-1">
      {productNavigation.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`product-nav-link ${active ? "product-nav-link-active" : ""}`}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      {session.role === "technical_admin" ? (
        <div className="pt-4">
          <p className="px-3 pb-2 text-xs font-medium text-slate-500">
            Technical access
          </p>
          <Link
            href="/admin/operations"
            onClick={() => setMobileOpen(false)}
            className="product-nav-link"
          >
            <Gauge className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>Operations</span>
          </Link>
        </div>
      ) : null}
    </nav>
  );

  const contextValue = useMemo<CustomerPortalContextValue>(() => ({
    session,
    selectedHousehold,
    householdLabel,
    households,
    setSelectedHousehold,
    selectorLoading
  }), [
    session,
    selectedHousehold,
    householdLabel,
    households,
    selectorLoading
  ]);

  return (
    <CustomerPortalContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[var(--product-background)]">
        <aside className="product-sidebar hidden lg:flex">
          <Brand />
          <div className="mt-8 flex-1">{navigation}</div>
          <div className="border-t border-white/8 pt-4">
            <div className="flex items-start gap-3 rounded-lg bg-cyan-300/[0.06] p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-xs font-medium text-cyan-50">Simulation protected</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  No physical device control is enabled.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {mobileOpen ? (
          <div
            className="fixed inset-0 z-50 bg-[#020713]/75 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="h-full w-[min(88vw,320px)] border-r border-white/10 bg-[#07111f] p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <Brand compact />
                <button
                  type="button"
                  className="product-icon-button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-8">{navigation}</div>
            </aside>
          </div>
        ) : null}

        <div className="lg:pl-[264px]">
          <header className="product-header">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="product-icon-button lg:!hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  Household Energy Intelligence
                </p>
                <p className="truncate text-xs text-slate-400">
                  {session.community_id.replaceAll("-", " ")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 md:flex">
                <Sparkles className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                <span className="text-xs text-slate-300">Simulated environment</span>
              </div>
              <div className="relative hidden sm:block">
                <label className="sr-only" htmlFor="household-selector">
                  Select household
                </label>
                <select
                  id="household-selector"
                  value={selectedHousehold || ""}
                  disabled={selectorLoading || households.length <= 1}
                  onChange={(event) => setSelectedHousehold(event.target.value)}
                  className="product-select min-w-44 appearance-none pr-9"
                >
                  {households.length ? households.map((household) => (
                    <option key={household.selector_id} value={household.selector_id}>
                      {household.display_name}
                    </option>
                  )) : (
                    <option value={selectedHousehold || ""}>{householdLabel}</option>
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <button
                type="button"
                onClick={logout}
                className="product-icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <div className="mb-4 sm:hidden">
              <label className="sr-only" htmlFor="mobile-household-selector">
                Select household
              </label>
              <select
                id="mobile-household-selector"
                value={selectedHousehold || ""}
                disabled={selectorLoading || households.length <= 1}
                onChange={(event) => setSelectedHousehold(event.target.value)}
                className="product-select w-full"
              >
                {households.length ? households.map((household) => (
                  <option key={household.selector_id} value={household.selector_id}>
                    {household.display_name}
                  </option>
                )) : (
                  <option value={selectedHousehold || ""}>{householdLabel}</option>
                )}
              </select>
            </div>
            {children}
          </main>
        </div>
      </div>
    </CustomerPortalContext.Provider>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3" aria-label="EnerShare home">
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
        <Waves className="h-5 w-5" aria-hidden="true" />
      </span>
      {!compact ? (
        <span>
          <span className="block text-base font-semibold text-white">EnerShare</span>
          <span className="block text-xs text-slate-500">Energy intelligence</span>
        </span>
      ) : (
        <span className="text-base font-semibold text-white">EnerShare</span>
      )}
    </Link>
  );
}
