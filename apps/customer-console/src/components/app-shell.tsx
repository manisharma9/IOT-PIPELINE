"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { navigation } from "@/lib/console-data";

type AppShellProps = {
  username: string;
  children: React.ReactNode;
};

export function AppShell({ username, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (pathname === "/" && item.href === "/overview");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
              active
                ? "bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/20"
                : "text-slate-300 hover:bg-white/6 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 hidden h-screen w-72 border-r border-white/10 bg-[#0b0f14]/95 p-5 lg:block">
        <div className="mb-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Smart Grid</p>
              <p className="text-xs text-slate-400">Communication Console</p>
            </div>
          </div>
        </div>
        {nav}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="h-full w-80 border-r border-white/10 bg-[#0b0f14] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm font-semibold">Navigation</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 p-2 text-slate-300"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090b0f]/80 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md border border-white/10 p-2 text-slate-300 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <p className="text-sm font-semibold text-white">Customer Operator Console</p>
                <p className="text-xs text-slate-400">Gateway-only local operations view</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100 sm:inline-flex">
                Local Demo Mode
              </span>
              <span className="hidden rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100 sm:inline-flex">
                No real device control
              </span>
              <span className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300">
                {username}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-white/10 p-2 text-slate-300 transition hover:bg-white/8 hover:text-white"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
