"use client";

import { useState } from "react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErrorMsg("");

    const token = captchaToken.trim();

    if (isTurnstileEnabled() && !token) {
      setErrorMsg("Please complete the security check.");
      return;
    }

    setLoading(true);

    try {
      // ✅ 1. Login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: token },
      });

      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("Login succeeded but user is missing.");

      // ✅ 2. Load profile INCLUDING must_change_password
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, role, store_id, full_name, must_change_password")
        .eq("id", userId)
        .maybeSingle();

      if (pErr) throw pErr;

      console.log("PROFILE:", profile);

      // ✅ ✅ ✅ 3. FORCE CHANGE PASSWORD (FIXED)
      if (profile?.must_change_password === true) {
        window.location.href = "/pos/change-password";
        return;
      }

      // ✅ 4. Role check
      const role = String(profile?.role || "").toLowerCase();
      if (role !== "cashier" && role !== "admin") {
        await supabase.auth.signOut();
        throw new Error("This account is not allowed to use the POS.");
      }

      // ✅ 5. Store required
      if (!profile?.store_id) {
        await supabase.auth.signOut();
        throw new Error("No store assigned. Ask admin.");
      }

      // ✅ 6. Save POS settings
      localStorage.setItem("pos_store_id", profile.store_id);

      if (profile?.full_name) {
        localStorage.setItem("cashier_name", profile.full_name);
      }

      // ✅ 7. Go to POS
      window.location.href = "/pos";

    } catch (err) {
      setErrorMsg(err?.message || "Login failed.");
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="juja-page-bg flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md space-y-4 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.20)] backdrop-blur-xl"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-950">Cashier Login</h1>
          <p className="text-sm text-slate-500">Sign in with email and password.</p>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {errorMsg}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-300"
            placeholder="cashier@yourstore.com"
            required
            type="email"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Password
          </label>
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-300"
            placeholder="Password"
          />
        </div>

        <AuthTurnstile
          resetKey={captchaResetKey}
          onTokenChange={setCaptchaToken}
        />

        <button
          disabled={loading || (isTurnstileEnabled() && !captchaToken)}
          className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50"
          type="submit"
        >
          {loading ? "Signing in…" : "Open POS"}
        </button>
      </form>
    </div>
  );
}
