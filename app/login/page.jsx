"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Invalid email or password.");
      setIsLoading(false);
    } else if (data.session) {
      // Set the cookie with a more explicit path and SameSite attribute
      document.cookie = "juja-admin-auth=true; path=/; SameSite=Lax; max-age=86400";
      
      // Use window.location for a "hard" redirect to ensure the proxy catches the new cookie
      window.location.href = "/admin";
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F7F2] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#1A1A1A] shadow-xl p-8 rounded-none">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold uppercase tracking-widest text-[#1A1A1A]">
            JUJA <span className="text-[#1EBBA3]">MERCHANT</span>
          </h1>
          <p className="text-gray-500 text-sm font-semibold tracking-wider mt-2 uppercase">
            Authorized Personnel Only
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 border-l-4 border-red-600 p-4 mb-6 text-sm font-bold rounded-none">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 p-3 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-colors rounded-none"
              placeholder="admin@juja.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 p-3 focus:outline-none focus:border-[#1EBBA3] focus:ring-1 focus:ring-[#1EBBA3] transition-colors rounded-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1EBBA3] text-white h-14 font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all rounded-none shadow-sm disabled:opacity-70 flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              "Secure Login"
            )}
          </button>
        </form>

      </div>
    </div>
  );
}