"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function POSLoginPage() {
  // 1. Initialize Supabase here too!
  const supabase = createBrowserClient();

  // 2. State variables for your login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 3. Your Login Logic goes inside a handler function
  const handleLogin = async (e) => {
    e.preventDefault(); // Prevents the page from refreshing
    setError("");
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // If successful, redirect them back to the main terminal!
      window.location.href = "/pos";

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md p-8 bg-white rounded-3xl shadow-xl">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">Terminal Login</h1>
        
        {/* Error Message Display */}
        {error && (
          <div className="mb-4 p-4 bg-rose-50 text-rose-500 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* 4. Attach the handleLogin function to the form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-rose-300 transition-colors"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-4 bg-[#FC687D] text-white rounded-xl font-medium shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Open Register"}
          </button>
        </form>
      </div>
    </div>
  );
}