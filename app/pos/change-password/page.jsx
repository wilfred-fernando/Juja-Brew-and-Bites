"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const supabase = getSupabaseClient();

  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
    setMsg("");
    if (!p1 || p1.length < 8) return setMsg("Password must be at least 8 characters.");
    if (p1 !== p2) return setMsg("Passwords do not match.");

    setLoading(true);

    // ✅ update password for logged-in user [5](https://supabase.com/docs/reference/javascript/auth-updateuser)
    const { error } = await supabase.auth.updateUser({ password: p1 });

    if (error) {
      setLoading(false);
      setMsg(error.message);
      return;
    }

    // ✅ unset first-login flag
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;

    if (uid) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", uid);
    }

    setLoading(false);
    window.location.href = "/pos";
  }

  return (
    <div className="juja-page-bg flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.20)] backdrop-blur-xl">
        <h1 className="text-xl font-semibold text-slate-950">Change Password</h1>
        <p className="text-sm text-slate-500">
          First login detected. Please set a new password to continue.
        </p>

        {msg ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {msg}
          </div>
        ) : null}

        <input
          type="password"
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          placeholder="New password"
          className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-3 outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20"
        />

        <input
          type="password"
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          placeholder="Confirm new password"
          className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-3 outline-none transition focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-300/20"
        />

        <button
          onClick={save}
          disabled={loading}
          className="w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(8,145,178,0.28)] transition hover:-translate-y-0.5 hover:bg-cyan-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save Password"}
        </button>
      </div>
    </div>
  );
}
