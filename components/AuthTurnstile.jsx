"use client";

import { Turnstile } from "@marsidev/react-turnstile";

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export function isTurnstileEnabled() {
  return Boolean(turnstileSiteKey);
}

export default function AuthTurnstile({ onTokenChange, resetKey = 0 }) {
  if (!turnstileSiteKey) return null;

  return (
    <div className="flex w-full justify-center rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
      <Turnstile
        key={resetKey}
        siteKey={turnstileSiteKey}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => onTokenChange("")}
        onError={() => onTokenChange("")}
        options={{ theme: "light" }}
      />
    </div>
  );
}
