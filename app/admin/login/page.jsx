"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      // ✅ LOGIN
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
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
      window.location.href = "https://jujabrewandbites.com";

    } catch (err) {
      console.error("Login Error:", err);

      const message =
        err.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : err.message;

      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7] p-4">
      <div className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-xl border border-rose-100">

        <h1 className="text-3xl font-black text-slate-800 text-center mb-8">
          Admin Login
        </h1>

        <form onSubmit={handleLogin} className="space-y-5">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-[#FC687D]/30 transition-all text-slate-700"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-[#FC687D]/30 transition-all text-slate-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
              <p className="text-rose-500 text-xs text-center font-bold">
                ⚠️ {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#FC687D] text-white rounded-full font-bold shadow-lg shadow-rose-100 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Enter Portal →"}
          </button>
        </form>

      </div>
    </div>
  );
}