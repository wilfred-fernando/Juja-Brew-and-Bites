"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

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
      // 1. LOGIN USER
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) throw authError;

      const user = data.user;

      // 2. GET ROLE FROM PROFILES
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

      if (profileError) throw profileError;

      const role = profile?.role;

      // 3. ROLE-BASED REDIRECT
      if (role === "admin" || role === "super_admin") {
        window.location.href = "https://admin.jujabrewandbites.com";
        return;
      }

      if (role === "cashier") {
        window.location.href = "https://pos.jujabrewandbites.com";
        return;
      }

      // 4. DEFAULT (CUSTOMER)
      window.location.href = "https://jujabrewandbites.com";

    } catch (err) {
      console.error(err);
      setError(err.message);
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
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="text-red-500 text-xs text-center font-bold">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#FC687D] text-white rounded-full font-bold shadow-lg active:scale-95 transition-all"
          >
            {loading ? "Verifying..." : "Enter Portal →"}
          </button>

        </form>

      </div>
    </div>
  );
}