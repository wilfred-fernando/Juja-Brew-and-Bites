"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

import "@/app/style.css";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);

  const { loading, authorized, userEmail } = usePortalAuth({
    portal: "admin",
    loginPath: "/admin/login",
    allowedRoles: ["admin", "super_admin"],
  });

  // ✅ FIX: arrow function syntax
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useIdleLogout({
    timeoutMs: 60 * 60 * 1000,
    onTimeout: async () => {
      await supabase.auth.signOut();
      router.replace("/admin/login");
    },
    storageKey: "juja:admin:lastActivity",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  // ✅ Hide layout on login page
  if (pathname?.includes("/login")) return <>{children}</>;

  // ✅ CRITICAL FIX: prevent infinite spinner
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // ✅ If not authorized → render children (login page)
  if (!authorized) {
    return <>{children}</>;
  }

  const navItems = [
    { name: "Home", path: "/admin", icon: "🏠" },
    { name: "Bookings", path: "/admin/bookings", icon: "📅" },
    { name: "Live Orders", path: "/admin/orders", icon: "📋" },
    { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
    { name: "POS System", path: "/admin/pos-admin", icon: "🛒" },
    { name: "Loyalty Program", path: "/admin/loyalty", icon: "⭐" },
    { name: "Promo Codes", path: "/admin/promos", icon: "🎁" },
    { name: "Settings", path: "/admin/settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-[#FFF5F7] flex overflow-hidden">

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-8 border-b border-rose-50 flex justify-between items-center">
          <img src={LOGO} alt="Juja" className="h-10 object-contain" />
          <button onClick={() => setMobileOpen(false)} className="md:hidden">
            ✕
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.path === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.path);

            return (
              <Link
                key={item.name}
                href={item.path}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl ${
                  isActive
                    ? "bg-[#FC687D] text-white"
                    : "text-slate-600 hover:bg-rose-50"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t bg-slate-50">
          <div className="mb-4">
            <p className="text-xs text-slate-500">
              {userEmail || "Staff"}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-3 bg-white border rounded-xl text-sm"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 md:ml-[260px] h-screen overflow-y-auto">
        <div className="p-6 md:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
