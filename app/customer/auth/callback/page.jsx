"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

function customerPath(path) {
  if (typeof window === "undefined") return `/customer${path}`;
  return window.location.hostname.startsWith("customer.") ? path : `/customer${path}`;
}

export default function CustomerAuthCallbackPage() {
  const [status, setStatus] = useState("Confirming your email...");
  const [error, setError] = useState("");

  useEffect(() => {
    let redirectTimer;

    async function finishConfirmation() {
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
