"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

function customerPath(path) {
  if (typeof window === "undefined") return `/customer${path}`;
  return window.location.hostname.startsWith("customer.") ? path : `/customer${path}`;
}

function getAuthParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    code: searchParams.get("code") || hashParams.get("code"),
    tokenHash: searchParams.get("token_hash") || hashParams.get("token_hash"),
    type: searchParams.get("type") || hashParams.get("type"),
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    error:
      searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      searchParams.get("error") ||
      hashParams.get("error"),
  };
}

function otpTypeCandidates(type) {
  const normalized = String(type || "").toLowerCase();
  const candidates = normalized ? [normalized] : ["signup", "email"];

  if (normalized === "email") candidates.push("signup");
  if (normalized === "signup") candidates.push("email");

  return [...new Set(candidates.filter(Boolean))];
}

function isEmailConfirmed(user) {
  return Boolean(
    user?.email_confirmed_at ||
      user?.confirmed_at ||
      user?.user_metadata?.email_verified ||
      user?.app_metadata?.email_verified
  );
}

async function verifyTokenHash(tokenHash, type) {
  let lastError = null;

  for (const candidateType of otpTypeCandidates(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: candidateType,
    });

    if (!error) return data;
    lastError = error;
  }

  throw lastError || new Error("Unable to verify email confirmation link.");
}

export default function CustomerAuthCallbackPage() {
  const [status, setStatus] = useState("Confirming your email...");
  const [error, setError] = useState("");

  useEffect(() => {
    let redirectTimer;

    async function finishConfirmation() {
      try {
        const { code, tokenHash, type, accessToken, refreshToken, error: linkError } = getAuthParams();

        if (linkError) {
          throw new Error(linkError);
        }

        let confirmedUser = null;

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          confirmedUser = data?.user || null;
        } else if (tokenHash) {
          const data = await verifyTokenHash(tokenHash, type);
          confirmedUser = data?.user || null;
        } else if (accessToken && refreshToken) {
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          confirmedUser = data?.user || null;
        } else {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData?.session) {
            throw new Error("Verification link is missing or expired. Please request a new verification email.");
          }
          confirmedUser = sessionData.session.user || null;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError && !confirmedUser) throw userError;

        const user = isEmailConfirmed(userData?.user) ? userData.user : confirmedUser;
        if (!isEmailConfirmed(user)) {
          throw new Error("Email was not confirmed by Supabase. Please request a new verification email.");
        }

        setStatus("Email confirmed successfully. Redirecting to login...");
        await supabase.auth.signOut();

        redirectTimer = window.setTimeout(() => {
          window.location.href = customerPath("/login");
        }, 2500);
      } catch (err) {
        setError(err?.message || "Unable to confirm email.");
        setStatus("Email confirmation needs attention.");
      }
    }

    finishConfirmation();

    return () => {
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, []);

  return (
    <div className="juja-page-bg flex min-h-screen items-center justify-center bg-[#FFF5F7] p-4">
      <div className="w-full max-w-md rounded-[32px] border border-rose-100 bg-white p-8 text-center shadow-xl">
        <p className="mb-2 text-xs uppercase tracking-wide text-rose-400">
          Customer Portal
        </p>
        <h1 className="text-3xl text-slate-900">Email Confirmation</h1>

        <div className={`mt-6 rounded-2xl border p-4 text-sm ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {error || status}
        </div>

        <Link
          href={customerPath("/login")}
          className="mt-6 block text-xs font-bold text-[#FC687D] hover:text-rose-500"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
