"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BookingForm from "@/components/BookingForm";
import { getSupabaseClient } from "@/lib/supabase/client";

const LOGO_URL = "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";

export default function EventCartPage() {
  const supabase = getSupabaseClient();
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCustomerContext() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;
      const sessionUser = session?.user || null;
      setUser(sessionUser);

      if (sessionUser?.id) {
        const { data } = await supabase
          .from("loyalty_members")
          .select("*")
          .or(`user_id.eq.${sessionUser.id},Email.eq.${sessionUser.email}`)
          .maybeSingle();

        if (active) setMember(data || null);
      }

      if (active) setLoading(false);
    }

    loadCustomerContext();
    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Juja Brew & Bites" className="h-12 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Link href="/function-room" className="rounded-full border border-slate-200 px-4 py-2 transition hover:border-[#FC687D] hover:text-[#FC687D]">
              Function Room
            </Link>
            <Link href="/menu" className="hidden rounded-full border border-slate-200 px-4 py-2 transition hover:border-[#FC687D] hover:text-[#FC687D] sm:inline-flex">
              Menu
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FC687D]">Event Cart</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Function Room Booking</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Check availability, choose a package, and submit your event booking request.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-rose-100 border-t-[#FC687D]" />
          </div>
        ) : (
          <BookingForm user={user} member={member} />
        )}
      </main>
    </div>
  );
}
