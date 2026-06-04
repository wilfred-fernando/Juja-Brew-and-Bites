"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthTurnstile, { isTurnstileEnabled } from "@/components/AuthTurnstile";
import PasswordField from "@/components/PasswordField";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

function customerPath(path) {
  if (typeof window === "undefined") return `/customer${path}`;
  return window.location.hostname.startsWith("customer.") ? path : `/customer${path}`;
}

function customerRedirectUrl() {
  return "https://customer.jujabrewandbites.com/reset-password";
}

export default function CustomerResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (verifyError) throw verifyError;
        }

        const { data } = await supabase.auth.getSession();
        if (active) {
          setHasRecoverySession(Boolean(data?.session));
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err?.message || "Password reset link is invalid or expired.");
          setHasRecoverySession(false);
          setLoading(false);
        }
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(true);
        setLoading(false);
      }
    });

    checkSession();

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function sendResetEmail(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const token = captchaToken.trim();
    if (isTurnstileEnabled() && !token) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: customerRedirectUrl(),
      captchaToken: token,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message || "Unable to send reset email.");
      setCaptchaToken("");
      setCaptchaResetKey((key) => key + 1);
      return;
    }

    setMessage("Password reset email sent. Please check your inbox.");
    setCaptchaToken("");
    setCaptchaResetKey((key) => key + 1);
  }

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || "Unable to update password.");
      return;
    }

    await supabase.auth.signOut();
    window.location.href = customerPath("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF5F7] p-4">
      <div className="w-full max-w-md rounded-[32px] border border-rose-100 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs uppercase tracking-wide text-rose-400">
            Customer Portal
          </p>
          <h1 className="text-3xl text-slate-900">
            {hasRecoverySession ? "Set New Password" : "Reset Password"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {hasRecoverySession
              ? "Enter a new password for your account."
              : "Enter your email and we will send a password reset link."}
          </p>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-center text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        {hasRecoverySession ? (
          <form onSubmit={savePassword} className="space-y-5">
            <label className="block text-xs uppercase tracking-wide text-slate-500">
              New Password
              <PasswordField
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-rose-100 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-[#FC687D]/50"
                placeholder="New password"
                autoComplete="new-password"
              />
            </label>

            <label className="block text-xs uppercase tracking-wide text-slate-500">
              Confirm Password
              <PasswordField
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-rose-100 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-[#FC687D]/50"
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-full bg-[#FC687D] text-sm uppercase tracking-wide text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Password"}
            </button>
          </form>
        ) : (
          <form onSubmit={sendResetEmail} className="space-y-5">
            <label className="block text-xs uppercase tracking-wide text-slate-500">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border border-rose-100 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-[#FC687D]/50"
                placeholder="you@example.com"
                required
              />
            </label>

            <AuthTurnstile
              resetKey={captchaResetKey}
              onTokenChange={setCaptchaToken}
            />

            <button
              type="submit"
              disabled={loading || (isTurnstileEnabled() && !captchaToken)}
              className="h-12 w-full rounded-full bg-[#FC687D] text-sm uppercase tracking-wide text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Reset Email"}
            </button>
          </form>
        )}

        <Link
          href={customerPath("/login")}
          className="mt-6 block text-center text-xs font-bold text-[#FC687D] hover:text-rose-500"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
