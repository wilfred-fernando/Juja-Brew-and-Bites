"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
 async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();

      // 1. Check if they are logged in at all
      if (!session) {
        console.log("Bouncer: No session found!");
        router.push("/login");
        return;
      }

      // 2. Check their role safely
      const role = session.user?.user_metadata?.role;
      console.log("Bouncer checked ID. Role is:", role);

      if (role !== "admin") {
        console.log("Bouncer: Access Denied. Kicking back to login.");
        router.push("/login");
        return;
      }

      // 3. Let them in!
      console.log("Bouncer: Welcome Admin!");
      setUser(session.user);
      setLoading(false);
    }
    checkSession();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full"></div>
      </div>
    );
  }

  // Cards for the main dashboard grid
  const dashboardCards = [
    { title: "Live Orders", icon: "📋", desc: "View and manage incoming orders in real time.", path: "/admin/orders" },
    { title: "Menu Builder", icon: "🧩", desc: "Add, edit, and organize your menu items and categories.", path: "/admin/menu" },
    { title: "Loyalty Program", icon: "⭐", desc: "Manage customer points, visits, and edit member details.", path: "/admin/loyalty" },
    { title: "Promo Codes", icon: "🎁", desc: "Create and manage discount codes for customers.", path: "/admin/promos" },
    { title: "Settings", icon: "⚙️", desc: "Update store info, hours, delivery fees, and more.", path: "/admin/settings" },
    { title: "Accounts", icon: "👥", desc: "Manage staff access and account settings.", path: "/admin/accounts" },
  ];

  return (
    <main className="p-8 md:p-12 overflow-y-auto w-full">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-2">
          Welcome Back 👋
        </h1>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Admin Panel • {user?.email}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Loop through standard cards */}
        {dashboardCards.map((card) => (
          <Link key={card.title} href={card.path} 
            className="bg-white rounded-[32px] p-8 border border-rose-50 shadow-[0_8px_30px_rgba(252,104,125,0.04)] hover:shadow-[0_12px_40px_rgba(252,104,125,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
            <div className="text-4xl mb-4">{card.icon}</div>
            <h3 className="font-extrabold text-slate-800 text-xl mb-2">{card.title}</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed flex-1">{card.desc}</p>
          </Link>
        ))}

        {/* Special Public Site Card */}
        <div className="bg-[#FFF9FA] rounded-[32px] p-8 border border-rose-100 shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl pointer-events-none" />
          <div className="text-4xl mb-4 text-[#FC687D] relative z-10">🌐</div>
          <h3 className="font-extrabold text-[#FC687D] text-xl mb-2 relative z-10">Public Site</h3>
          <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6 flex-1 relative z-10">
            Preview your public-facing menu and ordering pages.
          </p>
          <div className="flex gap-3 relative z-10">
            <Link href="/" className="px-5 py-2.5 bg-white border border-rose-100 rounded-full text-[11px] font-bold uppercase tracking-widest text-[#FC687D] hover:bg-[#FC687D] hover:text-white transition-all shadow-sm">
              Home
            </Link>
            <Link href="/customer" className="px-5 py-2.5 bg-white border border-rose-100 rounded-full text-[11px] font-bold uppercase tracking-widest text-[#FC687D] hover:bg-[#FC687D] hover:text-white transition-all shadow-sm">
              Menu
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}