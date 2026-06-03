"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import AdminSidebar from "@/components/AdminSidebar";
import { Menu } from "lucide-react";

import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

export default function AdminLayout({ children }) {
  const supabase = getSupabaseClient();

  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const isReportsPage = pathname.startsWith("/admin/pos-admin/reports");

  const { loading, authorized, userEmail } = usePortalAuth({
    portal: "admin",
    loginPath: "/admin/login",
    allowedRoles: ["admin", "super_admin"],
    requireStore: false,
  });

  // Close mobile menu on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Redirect unauthorized users after auth check.
  useEffect(() => {
    if (!loading && !authorized && pathname !== "/admin/login") {
      router.replace("/admin/login");
    }
  }, [loading, authorized, pathname, router]);

  // Idle logout.
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

  // Login page has no sidebar.
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Loading screen.
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FFF5F7]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  // Prevent render until redirect finishes.
  if (!authorized) {
    return null;
  }

  // Main layout.
  return (
    <div className="min-h-screen bg-[#FFF5F7] flex">
      
      {/* SIDEBAR */}
      <AdminSidebar
        pathname={pathname}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      {/* MAIN */}
      <div className="flex-1 md:ml-[260px] min-h-screen">

        {/* MOBILE TOP BAR */}
        <div className="md:hidden sticky top-0 z-40 bg-white border-b border-rose-100 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="text-sm font-extrabold text-slate-800">
            Admin Panel
          </div>

          <div className="w-10 h-10" />
        </div>

        {/* PAGE */}
        <main className={isReportsPage ? "w-full p-4 sm:p-6 md:p-8 xl:p-10" : "p-6 md:p-10 max-w-7xl mx-auto"}>
          {children}
        </main>

      </div>
    </div>
  );
}

