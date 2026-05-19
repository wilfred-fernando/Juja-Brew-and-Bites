// app/customer/CustomerClient.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BookingTab from "@/components/BookingForm";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

/* ─────────────────────────────────────────────
  Helpers (NO hooks here)
───────────────────────────────────────────── */
function genMemberCode() {
  const n = String(Math.floor(Math.random() * 999999) + 1).padStart(6, "0");
  return `JUJA${new Date().getFullYear()}${n}`;
}
function genCustomerId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}
function todayISO() {
  return new Date().toISOString().split("T")[0];
}

/* ─────────────────────────────────────────────
  UI: Bottom Tab Bar
───────────────────────────────────────────── */
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "promo", icon: "🎁", label: "Promo" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "📅", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-50">
      <div className="flex justify-center gap-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center px-2 py-1 text-[10px] transition-all ${
              tab === t.id ? "text-[#FC687D]" : "text-slate-400"
            }`}
          >
            <span className="text-base">{t.icon}</span>
            <span className="leading-tight">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
  UI: Home Tab (always shows something)
───────────────────────────────────────────── */
function HomeTab({ member, user, setTab }) {
  const pts = parseFloat(member?.["Points balance"] ?? 0) || 0;
  const visits = parseFloat(member?.["Total visits"] ?? 0) || 0;

  return (
        <div className="flex items-center gap-3">
    <Link href="/" className="active:scale-95 transition">
        <img
        src={LOGO}
        alt="Juja Logo"
        className="h-8 w-auto object-contain"
        />
    </Link>

    <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-widest text-slate-400">
        Juja Brew &amp; Bites
        </p>
        <p className="text-[12px] text-slate-700 font-semibold">
        {user?.email || "Guest"}
        </p>
    </div>
    </div>

      <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm">
        <p className="text-[#FC687D] text-[10px] uppercase tracking-widest">
          Welcome
        </p>
        <h2 className="text-2xl font-semibold text-slate-800 mt-1">
          {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
        </h2>

        <div className="mt-4 flex gap-4 bg-[#FFF9FA] p-3 rounded-xl border border-rose-50 inline-flex">
          <div>
            <p className="text-[#FC687D] text-xl leading-none">{pts.toFixed(0)}</p>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-1">
              Points
            </p>
          </div>
          <div className="w-px bg-rose-100" />
          <div>
            <p className="text-slate-800 text-xl leading-none">{visits.toFixed(0)}</p>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest mt-1">
              Visits
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: "🍽️", label: "Order", sub: "Browse menu", tab: "order" },
          { icon: "⭐", label: "Loyalty", sub: "Rewards", tab: "loyalty" },
          { icon: "📅", label: "Booking", sub: "Reserve room", tab: "booking" },
          { icon: "🎁", label: "Promos", sub: "Deals", tab: "promo" },
        ].map((c) => (
          <button
            key={c.label}
            onClick={() => setTab(c.tab)}
            className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm text-left active:scale-95 transition"
          >
            <div className="text-2xl mb-2 bg-rose-50 w-10 h-10 rounded-full flex items-center justify-center text-[#FC687D]">
              {c.icon}
            </div>
            <p className="text-slate-800 font-semibold text-sm">{c.label}</p>
            <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">
              {c.sub}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
  UI: Promo Tab (safe)
───────────────────────────────────────────── */
function PromoTab({ setTab, setAppliedPromo }) {
  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchPromos() {
      setLoadingPromos(true);
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true);

      if (mounted) {
        if (!error) setPromos(data || []);
        setLoadingPromos(false);
      }
    }
    fetchPromos();
    return () => {
      mounted = false;
    };
  }, []);

  if (loadingPromos) {
    return (
      <div className="p-6 flex justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {promos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-slate-600">
          No active promos right now.
        </div>
      ) : (
        promos.map((promo) => (
          <div key={promo.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="font-semibold text-slate-800">{promo.title}</p>
            <p className="text-xs text-slate-500 mt-1">{promo.description}</p>
            <button
              onClick={() => {
                setAppliedPromo(promo);
                setTab("order");
              }}
              className="mt-3 w-full py-2.5 bg-[#FC687D] text-white rounded-xl text-[11px] uppercase tracking-widest active:scale-95"
            >
              Use Promo
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
  UI: Loyalty Tab (safe join)
───────────────────────────────────────────── */
function LoyaltyTab({ member, setMember, user }) {
  const [joining, setJoining] = useState(false);
  const pts = useMemo(() => parseFloat(member?.["Points balance"] ?? 0) || 0, [member]);

  const join = async () => {
    if (!user?.id) return;
    setJoining(true);

    const existing = await supabase
      .from("loyalty_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing.data) {
      setMember(existing.data);
      setJoining(false);
      return;
    }

    const payload = {
      user_id: user.id,
      "Customer ID": genCustomerId(),
      customer_name: user?.user_metadata?.full_name || "",
      Email: user?.email || null,
      Phone: null,
      City: null,
      customer_code: genMemberCode(),
      "Points balance": 0,
      Note: null,
      "First visit": todayISO(),
      "Last visit": todayISO(),
      "Total visits": 0,
      "Total spent": 0,
    };

    const { data, error } = await supabase
      .from("loyalty_members")
      .insert([payload])
      .select()
      .single();

    if (!error) setMember(data);
    setJoining(false);
  };

  if (!member) {
    return (
      <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-6 text-center">
        <div className="text-5xl mb-2">⭐</div>
        <p className="text-slate-800 font-semibold text-lg">Join Juja Rewards</p>
        <p className="text-slate-500 text-sm mt-1">Earn points on every purchase.</p>
        <button
          onClick={join}
          disabled={joining}
          className="mt-4 w-full py-3 rounded-xl bg-[#FC687D] text-white text-[11px] uppercase tracking-widest disabled:opacity-60 active:scale-95"
        >
          {joining ? "Creating…" : "Join For Free →"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-5">
        <p className="text-slate-800 font-semibold">Your Points</p>
        <p className="text-[#FC687D] text-3xl mt-2">{pts.toFixed(0)}</p>
        <p className="text-slate-500 text-[11px] uppercase tracking-widest mt-1">
          {member.customer_code || "—"}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
  UI: Profile Tab
───────────────────────────────────────────── */
function ProfileTab({ user, onLogout }) {
  return (
    <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-6">
      <p className="text-slate-800 font-semibold">{user?.email}</p>
      <p className="text-slate-400 text-[10px] uppercase tracking-widest mt-1">
        Juja Member
      </p>

      <button
        onClick={onLogout}
        className="mt-5 w-full py-3 rounded-xl bg-slate-50 text-slate-600 text-[11px] uppercase tracking-widest hover:bg-rose-50 hover:text-[#FC687D] active:scale-95 transition"
      >
        Sign Out
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
  MAIN Client Page
───────────────────────────────────────────── */
export default function CustomerClient() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);

  const [tab, setTab] = useState("home");
  const [appliedPromo, setAppliedPromo] = useState(null);

  // ✅ Boot / session check (prevents blank screen)
  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (!session) {
          // no session: go login
          router.replace("/login");
          return;
        }

        if (!mounted) return;

        setUser(session.user);

        // fetch member profile (safe)
        const { data: mData } = await supabase
          .from("loyalty_members")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (mounted) setMember(mData || null);
      } catch (e) {
        console.error("Customer boot error:", e);
      } finally {
        if (mounted) setBooting(false);
      }
    }

    boot();

    // listen auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [router]);

  // ✅ Realtime update for this user's member row (optional, safe)
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("loyalty-live-update")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "loyalty_members" },
        (payload) => {
          if (payload?.new?.user_id === user.id) setMember(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // ✅ Always show something while booting
  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // If session missing, the router will redirect; still show fallback to avoid blank
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7] p-6 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full">
          <p className="font-semibold text-slate-800">Redirecting…</p>
          <p className="text-slate-500 text-sm mt-1">Please sign in again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 pt-4 bg-[#FFF5F7]">
      <main className="max-w-6xl mx-auto px-4 py-4">
        {tab === "home" && <HomeTab member={member} user={user} setTab={setTab} />}

        {/* Replace with your full OrderTab later (keep it simple to avoid hook issues) */}
        {tab === "order" && (
          <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-6">
            <p className="text-slate-800 font-semibold">Order</p>
            {appliedPromo ? (
              <p className="text-slate-500 text-sm mt-2">
                Applied promo: <b>{appliedPromo.title || appliedPromo.code}</b>
              </p>
            ) : (
              <p className="text-slate-500 text-sm mt-2">No promo applied.</p>
            )}
          </div>
        )}

        {tab === "promo" && <PromoTab setTab={setTab} setAppliedPromo={setAppliedPromo} />}

        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}

        {tab === "booking" && <BookingTab user={user} member={member} />}

        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}
```