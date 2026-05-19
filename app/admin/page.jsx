"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] rounded-full animate-spin" />
      </div>
    );
  }

  // If redirecting, still show a stable UI (prevents blank / flicker)
  if (!user || (role !== "admin" && role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7] p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center max-w-sm w-full">
          <p className="font-bold text-slate-800">Redirecting…</p>
          <p className="text-slate-500 text-sm mt-1">Checking access…</p>
        </div>
      </div>
    );
  }

  const dashboardCards = [
    { title: "Live Orders", icon: "📋", desc: "View and manage incoming orders in real time.", path: "/admin/orders" },
    { title: "Menu Builder", icon: "🧩", desc: "Add, edit, and organize menu items.", path: "/admin/menu" },
    { title: "Loyalty Program", icon: "⭐", desc: "Manage customer rewards and points.", path: "/admin/loyalty" },
    { title: "Promo Codes", icon: "🎁", desc: "Create discount campaigns and vouchers.", path: "/admin/promos" },
    { title: "Settings", icon: "⚙️", desc: "Store settings and configuration.", path: "/admin/settings" },
    { title: "Accounts", icon: "👥", desc: "Manage staff and access control.", path: "/admin/accounts" },
  ];

  return (
    <main className="p-8 md:p-12 w-full min-h-screen bg-[#FFF5F7]">
      {/* HEADER */}
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-slate-800 mb-2">
          Admin Dashboard 👋
        </h1>

        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Juja Brew &amp; Bites • {user?.email}
        </p>
      </header>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {dashboardCards.map((card) => (
          {card.path}
            <div className="text-4xl mb-4">{card.icon}</div>

            <h3 className="text-xl font-extrabold text-slate-800 mb-2">
              {card.title}
            </h3>

            <p className="text-sm text-slate-500 flex-1">{card.desc}</p>
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
            /
              Home
            </Link>

            /customer
              Menu
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}