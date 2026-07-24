"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Building2, LockKeyhole, ShieldCheck, Waves, Zap } from "lucide-react";
import { Badge, LoadingButton } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center text-sm text-slate-300">Loading sign-in...</main>}>
      <LoginPanel />
    </Suspense>
  );
}

function LoginPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("operator123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message || "Login failed.");
      setLoading(false);
      return;
    }

    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#06101d] px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-[#0b1929] shadow-2xl shadow-black/30 md:grid md:grid-cols-[1.08fr_0.82fr]">
        <section className="p-8 md:p-11">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">EnerShare</p>
              <p className="text-xs text-slate-400">Household Energy Intelligence</p>
            </div>
          </div>
          <Badge tone="blue">Controlled demonstration</Badge>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-4xl">
            Energy decisions made clear
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
            Sign in to explore household consumption, connected devices, flexibility opportunities and privacy-aware community insights.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/15 p-3">
              <Zap className="mb-3 h-4 w-4 text-cyan-200" />
              <p className="text-xs text-slate-300">Live energy visibility</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 p-3">
              <Building2 className="mb-3 h-4 w-4 text-emerald-200" />
              <p className="text-xs text-slate-300">Protected community view</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 p-3">
              <ShieldCheck className="mb-3 h-4 w-4 text-amber-200" />
              <p className="text-xs text-slate-300">Simulation-only safety</p>
            </div>
          </div>
        </section>
        <section className="border-t border-white/10 bg-[#081421] p-8 md:border-l md:border-t-0 md:p-10">
          <div className="mb-6">
            <LockKeyhole className="h-5 w-5 text-cyan-300" />
            <h2 className="mt-3 text-xl font-semibold text-white">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Use your authorized local account.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium text-slate-300">Username</label>
              <input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none ring-cyan-300/30 transition focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
              <input
                id="login-password"
                value={password}
                type="password"
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none ring-cyan-300/30 transition focus:ring-2"
              />
            </div>
            {error ? (
              <div className="rounded-md border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            <LoadingButton loading={loading} type="submit">Sign in</LoadingButton>
          </form>
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold text-slate-500">Local demonstration access</p>
            <p className="mt-2 font-mono text-sm text-slate-200">operator / operator123</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Production deployment will use a managed identity provider.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
