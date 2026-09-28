"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import AdminSidebar from "@/components/AdminSidebar";
import premium from "@/components/finance/FinanceFutureShell.module.css";
import styles from "@/components/AdminPremium.module.css";
import FloatingTableScrollbar from "@/components/finance/FloatingTableScrollbar";
import { Menu } from "lucide-react";

import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

export default function AdminLayout({ children }) {
  const supabase = getSupabaseClient();

  const pathname = usePathname();
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const contentRef = useRef(null);

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
    <div className={`${premium.shell} ${styles.shell}`}>
      <a href="#admin-workspace" className={premium.skip}>Skip to workspace</a>
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
      <div className={styles.workspace}>

        {/* MOBILE TOP BAR */}
        <div className={styles.mobileBar}>
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
        <main id="admin-workspace" className={styles.main}>
          <div ref={contentRef} className={`${premium.content} ${styles.content}`}>{children}</div>
          <FloatingTableScrollbar containerRef={contentRef} />
          <footer className={premium.footer}><span>JUJA BREW & BITES</span><span>Admin workspace</span></footer>
        </main>

      </div>
    </div>
  );
}

