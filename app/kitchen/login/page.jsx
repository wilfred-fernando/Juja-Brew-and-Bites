"use client";

import { useEffect, useState } from "react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStableSession } from "@/lib/supabase/session";

const supabase = getSupabaseClient();

function kitchenPath(path = "") {
  if (typeof window === "undefined") return `/kitchen${path}`;
  return window.location.hostname.startsWith("pos.") ? `/kitchen${path}` : `/kitchen${path}`;
}

export default function KitchenLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { session } = await getStableSession(supabase);
      const user = session?.user;
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

      const role = String(profile?.role || "").toLowerCase();
      if (["kds", "kitchen", "admin", "super_admin"].includes(role) && (role === "super_admin" || profile?.store_id)) {
        window.location.href = kitchenPath("");
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
        .select("role, store_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const role = String(profile?.role || "").toLowerCase();
      if (!["kds", "kitchen", "admin", "super_admin"].includes(role)) {
        await supabase.auth.signOut();
        throw new Error("This account is not allowed to use KDS.");
      }

      if (role !== "super_admin" && !profile?.store_id) {
        await supabase.auth.signOut();
        throw new Error("No store assigned. Ask admin to assign this KDS account to a branch.");
      }

      window.location.href = kitchenPath("");
    } catch (err) {
      setError(err?.message === "Invalid login credentials" ? "Incorrect email or password." : err?.message || "Login failed.");
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
      setLoading(false);
    }
  }

  return (
    <div className="juja-page-bg flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md space-y-5 rounded-[32px] border border-white/70 bg-white/84 p-7 shadow-[0_30px_90px_rgba(2,6,23,0.20)] backdrop-blur-xl"
      >
        <div className="space-y-1 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-700">Kitchen Display System</p>
          <h1 className="text-2xl font-semibold text-slate-950">KDS Login</h1>
          <p className="text-sm text-slate-600">Sign in to view orders for your assigned branch.</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        ) : null}

        <input
          type="email"
          placeholder="Email"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-cyan-400"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordField
          placeholder="Password"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-cyan-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <AuthTurnstile resetKey={captchaResetKey} onTokenChange={setCaptchaToken} />

        <button
          type="submit"
          disabled={loading || (isTurnstileEnabled() && !captchaToken)}
          className="w-full rounded-2xl bg-slate-700 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition hover:bg-slate-600 disabled:bg-slate-300"
        >
          {loading ? "Verifying..." : "Open KDS"}
        </button>
      </form>
    </div>
  );
}
