"use client";

import { useEffect } from "react";
import FinanceFutureShell from "@/components/finance/FinanceFutureShell";

import { usePathname, useRouter } from "next/navigation";
import { Boxes, ReceiptText, Users, Wallet } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { usePortalAuth } from "@/components/usePortalAuth";
import { useIdleLogout } from "@/components/useIdleLogout";

function financePath(path) {
  if (typeof window === "undefined") return `/finance${path}`;
  return window.location.hostname.startsWith("finance.") ? path : `/finance${path}`;
}

export default function FinanceLayout({ children }) {
  const supabase = getSupabaseClient();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/finance/login" || pathname === "/login";
  const activeSection = pathname.includes("/cash-flow") ? "cash-flow" : pathname.includes("/payroll") ? "payroll" : pathname.includes("/inventory") ? "inventory" : "expenses";

  const { loading, authorized, userEmail, userRole, userStoreId } = usePortalAuth({
    portal: "finance",
    loginPath: "/finance/login",
    allowedRoles: ["admin", "super_admin", "cashier"],
    requireStore: false,
  });

  useEffect(() => {
    if (!loading && authorized && userRole === "cashier" && !userStoreId && !isLogin) {
      router.replace(financePath("/login"));
      return;
    }
    if (!loading && authorized && userRole === "cashier" && (pathname.includes("/payroll") || pathname.includes("/cash-flow"))) {
      router.replace(financePath("/expenses"));
      return;
    }
    if (!loading && !authorized && !isLogin) {
      router.replace(financePath("/login"));
    }
  }, [authorized, isLogin, loading, pathname, router, userRole, userStoreId]);

  useIdleLogout({
    timeoutMs: 60 * 60 * 1000,
    onTimeout: async () => {
      await supabase.auth.signOut();
      router.replace(financePath("/login"));
    },
    storageKey: "juja:finance:lastActivity",
  });

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace(financePath("/login"));
  }

  if (isLogin) return <>{children}</>;

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

  if (!authorized || (userRole === "cashier" && (!userStoreId || pathname.includes("/cash-flow")))) return null;

  const navItems = userRole === "cashier"
    ? [
      ["expenses", "/expenses", "Expenses", ReceiptText],
      ["inventory", "/inventory", "Inventory", Boxes],
    ]
    : [
      ["expenses", "/expenses", "Expenses", ReceiptText],
      ["inventory", "/inventory", "Inventory", Boxes],
      ["payroll", "/payroll", "Payroll", Users],
      ["cash-flow", "/cash-flow", "Cash Flow & Position", Wallet],
    ];

  return <FinanceFutureShell navItems={navItems} activeSection={activeSection} financePath={financePath} userEmail={userEmail} userRole={userRole} onLogout={handleLogout}>{children}</FinanceFutureShell>;
}
