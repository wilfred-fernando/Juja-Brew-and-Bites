"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // 1. Authenticate with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Invalid email or password. Please try again.");
        setIsLoading(false);
        return;
      }

      if (data.session) {
        // 2. Set the Admin Security Cookie
        // path=/ ensures it is visible to all /admin subroutes
        // SameSite=Lax is required for modern browser security
        document.cookie = "juja-admin-auth=true; path=/; SameSite=Lax; max-age=86400";
        
        // 3. Force a full page reload to the admin dashboard
        // This ensures the Proxy (proxy.js) detects the cookie on the next request
        window.location.href = "/admin";
      }
    } catch (err) {
      setError("An unexpected error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F7F2] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#1A1A1A] shadow-2xl p-8 rounded-none">
        
        {/* Branding Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">
            JUJA <span className="text-[#1EBBA3]">MERCHANT</span>
          </h1>
          <div className="h-1 w-20 bg-[#1EBBA3] mx-auto mt-2"></div>
          <p className="text-gray-500 text-xs font-bold tracking-widest mt-4 uppercase">
            Authorized Personnel Only
          </p>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="bg-red-50 text-red-600 border-l-4 border-red-600 p-4 mb-6 text-sm font-bold rounded-none animate-pulse">
            ✕ {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 p-4 text-sm focus:outline-none focus:border-[#1EBBA3] focus:ring-0 transition-colors rounded-none placeholder-gray-300"
              placeholder="admin@juja.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 p-4 text-sm focus:outline-none focus:border-[#1EBBA3] focus:ring-0 transition-colors rounded-none placeholder-gray-300"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1EBBA3] text-white h-16 font-bold uppercase tracking-[0.2em] hover:bg-[#1A1A1A] active:scale-[0.98] transition-all rounded-none shadow-md disabled:opacity-70 flex justify-center items-center gap-3"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "Secure Login"
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
            System Version 1.0.4 • Powered by Supabase
          </p>
        </div>

      </div>
    </div>
  );
}