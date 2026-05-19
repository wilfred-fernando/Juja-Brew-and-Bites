"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // -----------------------------
  // AUTH + ROLE PROTECTION
  // -----------------------------
useEffect(() => {
  let mounted = true;

  async function checkSession() {
    try {
      if (mounted) setLoading(true);

      // 1. Get session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // No session → go login
      if (!session) {
        router.replace("/admin/login");
        return;
      }

      const currentUser = session.user;
      if (mounted) setUser(currentUser);

      // 2. Get role from DB
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .single();

      if (error || !profile) {
        console.log("Profile not found");
        router.replace("/admin/login");
        return;
      }

      const role = profile.role;
      console.log("Detected role:", role);

      // 3. Role check
      if (role !== "admin" && role !== "super_admin") {
        console.log("Access denied");
        router.replace("/");
        return;
      }
    } catch (e) {
      console.error("Admin check error:", e);
      router.replace("/admin/login");
    } finally {
      if (mounted) setLoading(false); ! IMPORTANT
    }
  }

  checkSession();

  return () => {
    mounted = false;
  };
}, [router]);

  // -----------------------------
  // LOADING SCREEN
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] rounded-full animate-spin"></div>
      </div>
    );
  }

  // -----------------------------
  // DASHBOARD CARDS
  // -----------------------------
  const dashboardCards = [
    {
      title: "Live Orders",
      icon: "📋",
      desc: "View and manage incoming orders in real time.",
      path: "/admin/orders",
    },
    {
      title: "Menu Builder",
      icon: "🧩",
      desc: "Add, edit, and organize menu items.",
      path: "/admin/menu",
    },
    {
      title: "Loyalty Program",
      icon: "⭐",
      desc: "Manage customer rewards and points.",
      path: "/admin/loyalty",
    },
    {
      title: "Promo Codes",
      icon: "🎁",
      desc: "Create discount campaigns and vouchers.",
      path: "/admin/promos",
    },
    {
      title: "Settings",
      icon: "⚙️",
      desc: "Store settings and configuration.",
      path: "/admin/settings",
    },
    {
      title: "Accounts",
      icon: "👥",
      desc: "Manage staff and access control.",
      path: "/admin/accounts",
    },
  ];

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <main className="p-8 md:p-12 w-full min-h-screen bg-[#FFF5F7]">

      {/* HEADER */}
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
          Admin Dashboard 👋
        </h1>

        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Juja Brew & Bites • {user?.email}
        </p>
      </header>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {dashboardCards.map((card) => (
          <Link
            key={card.title}
            href={card.path}
            className="bg-white p-8 rounded-[28px] border border-rose-50 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col"
          >
            <div className="text-4xl mb-4">{card.icon}</div>

            <h3 className="text-xl font-extrabold text-slate-800 mb-2">
              {card.title}
            </h3>

            <p className="text-sm text-slate-500 flex-1">
              {card.desc}
            </p>
          </Link>
        ))}

        {/* PUBLIC SITE CARD */}
        <div className="bg-white p-8 rounded-[28px] border border-rose-100 shadow-sm flex flex-col">
          <div className="text-4xl mb-4">🌐</div>

          <h3 className="text-xl font-extrabold text-[#FC687D] mb-2">
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