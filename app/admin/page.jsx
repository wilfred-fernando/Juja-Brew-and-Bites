"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Gift, Globe, Puzzle, Settings, Star, Users } from "lucide-react";

const supabase = getSupabaseClient();

export default function AdminDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        if (mounted) setLoading(true);

        // 1) Session
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (!session) {
          router.replace("/admin/login");
          return;
        }

        const currentUser = session.user;
        if (mounted) setUser(currentUser);

        // 2) Role lookup (use maybeSingle to avoid crash if row missing)
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (error || !profile?.role) {
          console.log("Profile not found / role missing:", error);
          router.replace("/admin/login");
          return;
        }

        const r = profile.role;
        console.log("Detected role:", r);
        if (mounted) setRole(r);

        // 3) Allow only admins
        if (r !== "admin" && r !== "super_admin") {
          console.log("Access denied: Not admin");
          router.replace("/");
          return;
        }
      } catch (e) {
        console.error("Admin check error:", e);
        router.replace("/admin/login");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f7fb]">
        <div className="w-10 h-10 border-4 border-sky-200 border-t-[#5b7288] rounded-full animate-spin" />
      </div>
    );
  }

  // If redirecting, still show a stable UI (prevents blank / flicker)
  if (!user || (role !== "admin" && role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f7fb] p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center max-w-sm w-full">
          <p className="font-bold text-slate-800">Redirecting...</p>
          <p className="text-slate-500 text-sm mt-1">Checking access...</p>
        </div>
      </div>
    );
  }

  const dashboardCards = [
    { title: "Menu Builder", icon: Puzzle, desc: "Add, edit, and organize menu items.", path: "/admin/menu" },
    { title: "Loyalty Program", icon: Star, desc: "Manage customer rewards and points.", path: "/admin/loyalty" },
    { title: "Promo Codes", icon: Gift, desc: "Create discount campaigns and vouchers.", path: "/admin/promos" },
    { title: "Settings", icon: Settings, desc: "Store settings and configuration.", path: "/admin/settings" },
    { title: "Accounts", icon: Users, desc: "Manage staff and access control.", path: "/admin/accounts" },
  ];

 return (
  <main className="p-8 md:p-12 w-full min-h-screen bg-[#f0f7fb]">

    {/* HEADER */}
    <header className="mb-10">
      <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
        Admin Dashboard
      </h1>

      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Juja Brew & Bites - {user?.email}
      </p>
    </header>

    {/* GRID */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

      {dashboardCards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.title}
            href={card.path}
            className="bg-white p-8 rounded-[28px] border border-sky-50 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col"
          >
            <Icon className="mb-4 h-10 w-10 text-slate-700" />

            <h3 className="text-xl font-extrabold text-slate-800 mb-2">
              {card.title}
            </h3>

            <p className="text-sm text-slate-500 flex-1">
              {card.desc}
            </p>
          </Link>
        );
      })}
      {/* PUBLIC SITE CARD */}
      <div className="bg-white p-8 rounded-[28px] border border-slate-200 shadow-sm flex flex-col">
        <Globe className="mb-4 h-10 w-10 text-slate-700" />

        <h3 className="text-xl font-extrabold text-slate-700 mb-2">
          Public Site
        </h3>

        <p className="text-sm text-slate-500 flex-1">
          Preview your customer-facing website and menu.
        </p>

        <div className="flex gap-3 mt-4">
          <Link
            href="/"
            className="px-4 py-2 text-xs font-bold bg-slate-100 rounded-full"
          >
            Home
          </Link>

          <Link
            href="/customer"
            className="px-4 py-2 text-xs font-bold bg-slate-100 rounded-full"
          >
            Menu
          </Link>
        </div>
      </div>

    </div>

  </main>
);
}
