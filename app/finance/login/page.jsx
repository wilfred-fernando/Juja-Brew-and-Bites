"use client";

import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

function financePath(path) {
  if (typeof window === "undefined") return `/finance${path}`;
  return window.location.hostname.startsWith("finance.") ? path : `/finance${path}`;
}

export default function FinanceLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (!active) return;

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, store_id")
        .eq("id", user.id)
        .maybeSingle();

      if ((profile?.role === "admin" || profile?.role === "super_admin") || (profile?.role === "cashier" && profile?.store_id)) {
        window.location.href = financePath("/expenses");
        return;
      }

      await supabase.auth.signOut();
      setLoading(false);
    }

    checkSession();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");

    const token = captchaToken.trim();

    if (isTurnstileEnabled() && !token) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: token },
      });

      if (authError) throw authError;

      const userId = data.user?.id;
      if (!userId) throw new Error("Login succeeded but user is missing.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, full_name, store_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const role = String(profile?.role || "").toLowerCase();
      if (!["admin", "super_admin", "cashier"].includes(role)) {
        await supabase.auth.signOut();
        throw new Error("This account is not allowed to use Finance.");
      }

      if (role === "cashier" && !profile?.store_id) {
        await supabase.auth.signOut();
        throw new Error("Cashier account has no assigned branch.");
      }

      window.location.href = financePath("/expenses");
    } catch (err) {
      setError(err?.message === "Invalid login credentials" ? "Incorrect email or password." : err?.message || "Login failed.");
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  return (
    <div className="juja-page-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/82 p-8 shadow-[0_30px_90px_rgba(2,6,23,0.20)] backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
            <Banknote size={28} />
          </div>
          <h1 className="text-3xl font-semibold text-slate-950">Finance Admin Login</h1>
          <p className="mt-2 text-sm text-slate-500">Payroll and finance access</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 text-sm normal-case text-slate-800 outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20"
              placeholder="admin@email.com"
              required
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Password
            <PasswordField
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 text-sm normal-case text-slate-800 outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20"
              placeholder="Password"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-sm font-bold text-red-600">
              {error}
            </div>
          ) : null}

          <AuthTurnstile
            resetKey={captchaResetKey}
            onTokenChange={setCaptchaToken}
          />

          <button
            type="submit"
            disabled={loading || (isTurnstileEnabled() && !captchaToken)}
            className="h-12 w-full rounded-full bg-cyan-600 text-sm font-semibold uppercase tracking-wide text-white shadow-[0_0_30px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Enter Finance"}
          </button>
        </form>
      </div>
    </div>
  );
}
