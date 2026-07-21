"use client";

import { useEffect, useState } from "react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import PosApkUpdatePrompt from "@/components/PosApkUpdatePrompt";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getStableSession } from "@/lib/supabase/session";

const POS_ALLOWED_ROLES = new Set(["cashier", "admin", "super_admin"]);
const POS_TEST_STORE_CODE = "TST";

export default function LoginPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function resolvePosStoreId(profile) {
    const role = String(profile?.role || "").toLowerCase();

    if (role === "super_admin") {
      const { data: testStore, error } = await supabase
        .from("stores")
        .select("id")
        .eq("store_code", POS_TEST_STORE_CODE)
        .eq("is_active", true)
        .eq("is_test", true)
        .maybeSingle();

      if (error) throw error;
      if (!testStore?.id) throw new Error("Test store is not available. Ask admin.");
      return testStore.id;
    }

    if (!profile?.store_id) throw new Error("No store assigned. Ask admin.");
    return profile.store_id;
  }

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const { session } = await getStableSession(supabase);
        if (!active || !session?.user?.id) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, store_id, full_name")
          .eq("id", session.user.id)
          .maybeSingle();

        const role = String(profile?.role || "").toLowerCase();
        if (POS_ALLOWED_ROLES.has(role)) {
          const activeStoreId = await resolvePosStoreId(profile);
          localStorage.setItem("pos_store_id", activeStoreId);
          if (profile?.full_name) {
            localStorage.setItem("cashier_name", profile.full_name);
          }
          window.location.replace("/pos");
        }
      } catch (err) {
        console.warn("POS session restore skipped:", err);
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [supabase]);

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
        window.location.replace("/pos/change-password");
        return;
      }

      // ✅ 4. Role check
      const role = String(profile?.role || "").toLowerCase();
      if (!POS_ALLOWED_ROLES.has(role)) {
        throw new Error("This account is not allowed to use the POS.");
      }

      // ✅ 5. Store required
      const activeStoreId = await resolvePosStoreId(profile);

      // ✅ 6. Save POS settings
      localStorage.setItem("pos_store_id", activeStoreId);

      if (profile?.full_name) {
        localStorage.setItem("cashier_name", profile.full_name);
      }

      // ✅ 7. Go to POS
      window.location.replace("/pos");

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
      <PosApkUpdatePrompt />
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
