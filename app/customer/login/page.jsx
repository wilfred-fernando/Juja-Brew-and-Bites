"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function Login() {
  const pathname = usePathname();
  const router = useRouter();

  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdminPortal =
    pathname.includes("/admin") || pathname.includes("/pos");

  // ✅ SESSION CHECK (FIXED)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (data?.session) {
          
    if (window.location.pathname !== "/customer") {
        window.location.href = "/customer";
      }
      return;

        }
      } catch (e) {
        console.error("Session check error:", e);
      }

      // ✅ ALWAYS STOP LOADING
      setLoading(false);
    };

    checkSession();
  }, [isAdminPortal]);

  // ✅ LOGIN HANDLER (FIXED)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authAction = mode === "signup"
        ? supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: { data: { full_name: form.name } },
          })
        : supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });

      const { error: authError } = await authAction;

      if (authError) throw authError;

      // ✅ FORCE FULL RELOAD (IMPORTANT)
      if (isAdminPortal) {
        window.location.href = "/admin/pos";
      } else {
        window.location.href = "/customer";
      }
    } catch (err) {
      setError(err.message || (mode === "signup" ? "Unable to create account." : "Invalid credentials."));
      setLoading(false);
    }
  };

  // ✅ LOADING SCREEN
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-[#FC687D]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF5F7]">
      {/* HEADER */}
      <div className="px-6 py-8 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link href="/">
          <img
            src={LOGO}
            alt="Juja"
            className="h-14 md:h-16 object-contain"
          />
        </Link>

        <Link
          href="/"
          className="text-[11px] tracking-wider text-slate-500 bg-white px-5 py-2.5 rounded-full border border-slate-200 hover:text-[#FC687D]"
        >
          ← Back to Website
        </Link>
      </div>

      {/* FORM */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">

          {/* TITLE */}
          <div className="text-center mb-6">
            <p className="text-xs text-rose-400 mb-2">
              {isAdminPortal ? "Admin Access" : "Customer Portal"}
            </p>

            <h1 className="text-2xl text-slate-800">{mode === "signup" ? "Create Account" : "Welcome Back"}</h1>
          </div>

          {/* CARD */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Full Name
                  </label>

                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-rose-300"
                    placeholder="Your name"
                  />
                </div>
              )}

              {/* EMAIL */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Email
                </label>

                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-rose-300"
                  placeholder="you@example.com"
                />
              </div>

              {/* PASSWORD */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Password
                </label>

                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-rose-300"
                  placeholder="••••••••"
                />
              </div>

              {/* ERROR */}
              {error && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 p-3 rounded-xl">
                  {error}
                </div>
              )}

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#FC687D] text-white rounded-xl text-sm hover:bg-rose-500 transition"
              >
                {mode === "signup" ? "Sign Up" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMode((m) => (m === "signup" ? "signin" : "signup"));
                }}
                className="w-full py-2 text-xs font-bold text-[#FC687D]"
              >
                {mode === "signup" ? "Already have an account? Sign in" : "No account yet? Sign up"}
              </button>

            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

