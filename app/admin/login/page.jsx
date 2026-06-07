"use client";

import { useState } from "react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    const token = captchaToken.trim();

    if (isTurnstileEnabled() && !token) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

    try {
      // ✅ LOGIN
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: token },
        });

      if (authError) throw authError;

      const user = data.user;

      // ✅ GET PROFILE
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      const role = profile?.role || "customer";

      // ✅ DEBUG SESSION
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("ADMIN SESSION:", sessionData);

      // ✅ ADMIN REDIRECT (FIXED)
      if (role === "admin" || role === "super_admin") {
        window.location.href = "/admin/pos-admin/settings/stores";
        return;
      }

      // ✅ DEFAULT
      await supabase.auth.signOut();
      window.location.href = "https://jujabrewandbites.com";

    } catch (err) {
      console.error("Login Error:", err);

      const message =
        err.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : err.message;

      setError(message);
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
      setLoading(false);
    }
  };

  return (
    <div className="juja-page-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-white/82 p-8 shadow-[0_30px_90px_rgba(2,6,23,0.20)] backdrop-blur-xl sm:p-10">

        <h1 className="mb-8 text-center text-3xl font-semibold text-slate-950">
          Admin Login
        </h1>

        <form onSubmit={handleLogin} className="space-y-5">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <PasswordField
            placeholder="Password"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div className="bg-sky-50 p-4 rounded-2xl border border-slate-200">
              <p className="text-sky-500 text-xs text-center font-bold">
                ⚠️ {error}
              </p>
            </div>
          )}

          <AuthTurnstile
            resetKey={captchaResetKey}
            onTokenChange={setCaptchaToken}
          />

          <button
            type="submit"
            disabled={loading || (isTurnstileEnabled() && !captchaToken)}
            className="w-full py-3 bg-[#FC687D] text-white rounded-xl text-sm hover:bg-rose-500 transition"
          >
            {loading ? "Verifying..." : "Enter Portal →"}
          </button>
        </form>

      </div>
    </div>
  );
}
