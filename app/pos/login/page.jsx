"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client"; // same style as your existing login [1](https://onedrive.live.com/?id=219bb63d-8ce2-4de9-9056-8e2421f08ae5&cid=933e55cc8541ec41&web=1)

export default function LoginPage() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      // ✅ sign in with email + password [2](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("Login succeeded but user is missing.");

      // ✅ load profile (role + store assignment)
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, role, store_id, full_name")
        .eq("id", userId)
        .single();

      if (pErr) throw pErr;

      
      // ✅ Force chanege password on first login
      if (profile.must_change_password) {
        window.location.href = "/pos/change-password";
        return;
      }


      // ✅ enforce cashier access (adjust if you want admins to open POS too)
      const role = String(profile?.role || "").toLowerCase();
      if (role !== "cashier" && role !== "admin") {
        await supabase.auth.signOut();
        throw new Error("This account is not allowed to use the POS.");
      }

      // ✅ store_id required for POS settings (payment types, printers, etc.)
      if (!profile?.store_id) {
        await supabase.auth.signOut();
        throw new Error("No store assigned to this account. Ask admin to assign a store.");
      }

      // ✅ set pos_store_id so your existing POS code can use it
      localStorage.setItem("pos_store_id", profile.store_id);

      // optional: store cashier name
      if (profile?.full_name) localStorage.setItem("cashier_name", profile.full_name);

      
      // ✅ go to POS terminal
      window.location.href = "/pos";
    } catch (err) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">Cashier Login</h1>
          <p className="text-sm text-slate-500">Sign in with email and password.</p>
        </div>

        {errorMsg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {errorMsg}
          </div>
        ) : null}

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
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-rose-300"
            placeholder="••••••••"
            required
            type="password"
          />
        </div>

        <button
          disabled={loading}
          className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50"
          type="submit"
        >
          {loading ? "Signing in…" : "Open POS"}
        </button>
      </form>
    </div>
  );
}