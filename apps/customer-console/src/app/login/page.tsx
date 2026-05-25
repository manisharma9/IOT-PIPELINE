"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { LockKeyhole, ShieldCheck, Zap } from "lucide-react";
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

    router.push(searchParams.get("next") || "/overview");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-md border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/30 md:grid md:grid-cols-[1fr_0.85fr]">
        <section className="p-8 md:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Smart Grid Communication Console</p>
              <p className="text-xs text-slate-400">Customer operator access</p>
            </div>
          </div>
          <Badge tone="amber">Local Demo Mode</Badge>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-4xl">
            Sign in to the operator dashboard
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
            This local authentication layer is for demo operation. Production identity can later be connected to Cognito, Auth0, or a JWT issuer without exposing gateway secrets to the browser.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <LockKeyhole className="mb-3 h-4 w-4 text-emerald-200" />
              <p className="text-xs text-slate-300">Server-side session cookie</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <Zap className="mb-3 h-4 w-4 text-blue-200" />
              <p className="text-xs text-slate-300">Gateway key stays server-side</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <ShieldCheck className="mb-3 h-4 w-4 text-amber-200" />
              <p className="text-xs text-slate-300">No real device control</p>
            </div>
          </div>
        </section>
        <section className="border-t border-white/10 bg-[#0b0f14]/80 p-8 md:border-l md:border-t-0 md:p-10">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Username</label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-emerald-300/30 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
              <input
                value={password}
                type="password"
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none ring-emerald-300/30 transition focus:ring-2"
              />
            </div>
            {error ? (
              <div className="rounded-md border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            <LoadingButton loading={loading} type="submit">Sign in</LoadingButton>
          </form>
          <div className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Default local credentials</p>
            <p className="mt-2 font-mono text-sm text-slate-200">operator / operator123</p>
          </div>
        </section>
      </div>
    </main>
  );
}
