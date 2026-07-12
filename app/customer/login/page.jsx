"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

function customerLoginRedirectUrl() {
  return "https://customer.jujabrewandbites.com/auth/callback";
}

function isEmailConfirmed(user) {
  return Boolean(
    user?.email_confirmed_at ||
      user?.confirmed_at ||
      user?.user_metadata?.email_verified ||
      user?.app_metadata?.email_verified
  );
}

export default function Login() {
  const pathname = usePathname();
  const router = useRouter();

  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", birthday: "", password: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setSuccess("");

    const token = captchaToken.trim();

    if (isTurnstileEnabled() && !token) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

      try {
        if (mode === "signup") {
        const firstName = form.firstName.trim();
        const lastName = form.lastName.trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        if (!firstName || !lastName || !form.birthday) {
          throw new Error("First name, last name, and birthday are required.");
        }

        const { error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            captchaToken: token,
            data: {
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
              birthday: form.birthday,
            },
            emailRedirectTo: customerLoginRedirectUrl(),
          },
        });

        if (authError) throw authError;

        await supabase.auth.signOut();
        setSuccess("Account created. Please verify your email before signing in.");
        setMode("signin");
        setForm({ firstName: "", lastName: "", email: form.email, birthday: "", password: "" });
        setCaptchaToken("");
        setCaptchaResetKey((key) => key + 1);
        setLoading(false);
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
        options: { captchaToken: token },
      });

      if (authError) throw authError;

      const { data: freshUserData } = await supabase.auth.getUser();
      const signedInUser = freshUserData?.user || data?.user;

      if (!isEmailConfirmed(signedInUser)) {
        await supabase.auth.signOut();
        throw new Error("Please verify your email before signing in.");
      }

      // ✅ FORCE FULL RELOAD (IMPORTANT)
      if (isAdminPortal) {
        window.location.href = "/admin/pos";
      } else {
        window.location.href = "/customer";
      }
    } catch (err) {
      setError(err.message || (mode === "signup" ? "Unable to create account." : "Invalid credentials."));
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
      setLoading(false);
    }
  };

  // ✅ LOADING SCREEN
  if (loading) {
    return (
      <div className="juja-page-bg min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-[#FC687D]" />
      </div>
    );
  }

  return (
    <div className="juja-page-bg min-h-screen flex flex-col bg-[#FFF5F7]">
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
          href="https://www.jujabrewandbites.com"
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
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full text-[10px] font-normal uppercase tracking-[0.25em] bg-rose-50 text-[#FC687D] border border-rose-100">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FC687D] animate-pulse" />
              {isAdminPortal ? "Admin Access" : "Customer Portal"}
            </div>

            <h1 className="text-2xl font-bold text-slate-800">{mode === "signup" ? "Create Account" : "Welcome Back"}</h1>
          </div>

          {/* CARD */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      First Name
                    </label>

                    <input
                      type="text"
                      required
                      value={form.firstName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, firstName: e.target.value }))
                      }
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
                      placeholder="First name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Last Name
                    </label>

                    <input
                      type="text"
                      required
                      value={form.lastName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lastName: e.target.value }))
                      }
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
                      placeholder="Last name"
                    />
                  </div>
                </>
              )}

              {/* EMAIL */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Email
                </label>

                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
                  placeholder="Email"
                />
              </div>

              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Birthday
                  </label>

                  <input
                    type="date"
                    required
                    value={form.birthday}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, birthday: e.target.value }))
                    }
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
                  />
                </div>
              )}

              {/* PASSWORD */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Password
                </label>

                <PasswordField
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500/30 transition-all text-slate-700"
                  placeholder="Password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>

              {mode === "signin" && (
                <div className="text-right">
                  <Link
                    href="/customer/reset-password"
                    className="text-xs font-bold text-[#FC687D] hover:text-rose-500"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}

              {/* ERROR */}
              {error && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 p-3 rounded-xl">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                  {success}
                </div>
              )}

              <AuthTurnstile
                resetKey={captchaResetKey}
                onTokenChange={setCaptchaToken}
              />

              {/* BUTTON */}
              <button
                type="submit"
                disabled={loading || (isTurnstileEnabled() && !captchaToken)}
                className="w-full py-3 bg-[#FC687D] text-white rounded-xl text-sm hover:bg-rose-500 transition"
              >
                {mode === "signup" ? "Sign Up" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSuccess("");
                  setCaptchaToken("");
                  setCaptchaResetKey((key) => key + 1);
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

