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
  const isReportsPage = pathname.startsWith("/admin/pos-admin/reports") || pathname.startsWith("/admin/sales");

  const { loading, authorized, userEmail, userRole } = usePortalAuth({
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
      <div
        className="flex h-screen items-center justify-center bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(248,250,252,0.78), rgba(226,232,240,0.70)), url('https://images.jujabrewandbites.com/page%20background.png')",
        }}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
      </div>
    );
  }

  // Prevent render until redirect finishes.
  if (!authorized) {
    return null;
  }

  // Main layout.
  return (
    <div
      className="admin-shell flex min-h-screen bg-cover bg-fixed bg-center bg-no-repeat text-slate-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(125,211,252,0.18), transparent 34%), linear-gradient(135deg, rgba(248,250,252,0.80), rgba(226,232,240,0.66)), url('https://images.jujabrewandbites.com/page%20background.png')",
      }}
    >
      
      {/* SIDEBAR */}
      <AdminSidebar
        pathname={pathname}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        userEmail={userEmail}
        onLogout={handleLogout}
        userRole={userRole}
        accessRows={[]}
      />

      {/* MAIN */}
      <div className="flex-1 md:ml-[260px] min-h-screen">

        {/* MOBILE TOP BAR */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/70 bg-white/82 px-4 py-3 shadow-[0_18px_45px_rgba(51,65,85,0.14)] backdrop-blur-xl md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100 hover:text-slate-900"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800">
            Admin Panel
          </div>

          <div className="w-10 h-10" />
        </div>

        {/* PAGE */}
        <main className={`admin-premium w-full animate-[financeFade_260ms_ease-out] ${isReportsPage ? "p-4 sm:p-6 md:p-8 xl:p-10" : "mx-auto max-w-7xl p-6 md:p-10"}`}>
          {children}
        </main>

      </div>
    </div>
  );
}

