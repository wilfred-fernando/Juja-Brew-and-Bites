"use client";

import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

const DEFAULT_TURNSTILE_SITE_KEY = "0x4AAAAAADefwtyYJ6duX9Dy";

export const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || DEFAULT_TURNSTILE_SITE_KEY;

export function isTurnstileEnabled() {
  return Boolean(turnstileSiteKey);
}

export default function AuthTurnstile({ onTokenChange, resetKey = 0 }) {
  const [status, setStatus] = useState("loading");

  if (!turnstileSiteKey) return null;

  return (
    <div className="flex min-h-[92px] w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 shadow-sm">
      <Turnstile
        key={resetKey}
        siteKey={turnstileSiteKey}
        className="min-h-[65px] w-full max-w-[300px]"
        style={{ minHeight: 65, width: "100%", maxWidth: 300 }}
        onWidgetLoad={() => setStatus("ready")}
        onSuccess={(token) => {
          setStatus("verified");
          onTokenChange(token);
        }}
        onExpire={() => {
          setStatus("expired");
          onTokenChange("");
        }}
        onError={() => {
          setStatus("error");
          onTokenChange("");
        }}
        onUnsupported={() => {
          setStatus("error");
          onTokenChange("");
        }}
        onTimeout={() => {
          setStatus("error");
          onTokenChange("");
        }}
        options={{ theme: "light", size: "normal", appearance: "always" }}
      />
      {status === "loading" ? (
        <p className="mt-2 text-center text-xs font-medium text-slate-600">Loading Cloudflare security check...</p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 text-center text-xs font-semibold text-red-700">Cloudflare security check did not load. Refresh the page or check the Turnstile domain settings.</p>
      ) : null}
      {status === "expired" ? (
        <p className="mt-2 text-center text-xs font-semibold text-amber-700">Security check expired. Please complete it again.</p>
      ) : null}
    </div>
  );
}
