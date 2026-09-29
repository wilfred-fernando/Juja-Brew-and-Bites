"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./AdminPremium.module.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  Boxes,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Gift,
  Home,
  MessageCircle,
  Puzzle,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Star,
  UserCog,
  X,
} from "lucide-react";
import { canAccessPage } from "@/lib/adminPageAccess";

export default function AdminSidebar({
  pathname,
  mobileOpen,
  setMobileOpen,
  userEmail,
  onLogout,
  userRole,
  accessRows = [],
}) {
  const [posOpen, setPosOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname?.startsWith("/admin/pos-admin")) {
      setPosOpen(true);
    }
    if (pathname?.startsWith("/admin/sales")) {
      setSalesOpen(true);
    }
  }, [pathname]);

  const SECTIONS = [
    {
      label: "Operations",
      items: [
        { name: "Dashboard", path: "/admin", icon: Home },
        { name: "Bookings", path: "/admin/bookings", icon: CalendarCheck },
        { name: "POS Audit Logs", path: "/admin/void-logs", icon: ShieldAlert },
        {
          name: "POS Admin",
          path: "/admin/pos-admin",
          icon: ShoppingCart,
          submenu: [
            { type: "label", name: "Settings" },
            { name: "Payment Types", path: "/admin/pos-admin/settings/payment-types" },
            { name: "Receipt Settings", path: "/admin/pos-admin/settings/receipt-settings" },
            { name: "Open Tickets", path: "/admin/pos-admin/settings/open-tickets" },
            { name: "Kitchen Printers", path: "/admin/pos-admin/settings/kitchen-printers" },
            { name: "Kitchen Order Display", path: "/admin/pos-admin/settings/order-display" },
            { name: "Dining Options", path: "/admin/pos-admin/settings/dining-options" },
            { name: "Discounts", path: "/admin/pos-admin/settings/discounts" },
            { name: "Beneficiaries", path: "/admin/pos-admin/settings/beneficiaries" },
            { name: "Stores & Admin Accounts", path: "/admin/pos-admin/settings/stores" },            
          ],
        },
      ],
    },
    {
      label: "Business",
      items: [
        {
          name: "Sales",
          path: "/admin/sales",
          icon: DollarSign,
          submenu: [
            { name: "Sales summary", path: "/admin/sales?tab=summary" },
            { name: "Sales by item", path: "/admin/sales?tab=items" },
            { name: "Sales by category", path: "/admin/sales?tab=categories" },
            { name: "Sales by employee", path: "/admin/sales?tab=employees" },
            { name: "Sales by payment type", path: "/admin/sales?tab=payments" },
            { name: "Receipts", path: "/admin/sales?tab=receipts" },
            { name: "Sales by modifier", path: "/admin/sales?tab=modifiers" },
            { name: "Discounts", path: "/admin/sales?tab=discounts" },
            { name: "Taxes", path: "/admin/sales?tab=taxes" },
            { name: "Shifts", path: "/admin/sales?tab=shifts" },
            { name: "Export Reports", path: "/admin/sales?tab=exports" },
          ],
        },
        { name: "Inventory", path: "/admin/inventory", icon: Boxes },
        { name: "Menu", path: "/admin/menu", icon: Puzzle },
        { name: "Customers", path: "/admin/customers", icon: Star },
        { name: "e-GC Monitoring", path: "/admin/gift-certificates", icon: Gift },
        { name: "Promos", path: "/admin/promos", icon: Gift },
        { name: "Messenger", path: "/admin/messenger", icon: MessageCircle },
      ],
    },
    {
      label: "System",
      items: [
        { name: "Accounts", path: "/admin/accounts", icon: UserCog },
        { name: "Settings", path: "/admin/settings", icon: Settings },
      ],
    },
  ];

  const PAGE_KEY_BY_PATH = {
    "/admin": "dashboard",
    "/admin/bookings": "bookings",
    "/admin/void-logs": "pos_admin",
    "/admin/pos-admin": "pos_admin",
    "/admin/menu": "menu_builder",
    "/admin/inventory": "inventory",
    "/admin/loyalty": "customers",
    "/admin/customers": "customers",
    "/admin/gift-certificates": "gift_certificates",
    "/admin/promos": "promos",
    "/admin/messenger": "messenger",
    "/admin/sales": "sales",
    "/admin/settings": "settings",
    "/admin/accounts": "accounts",
  };

  const pageAllowed = (path) => canAccessPage(accessRows, PAGE_KEY_BY_PATH[path], userRole);

  const isActive = (path) => {
    if (path === "/admin") return pathname === "/admin";
    return pathname?.startsWith(path);
  };

  const isSubActive = (path) => {
    const [basePath, query = ""] = path.split("?");
    if (pathname !== basePath) return false;
    const tab = new URLSearchParams(query).get("tab");
    if (!tab) return true;
    return (searchParams.get("tab") || "summary") === tab;
  };

  const isMenuOpen = (path) => (path === "/admin/pos-admin" ? posOpen : salesOpen);
  const toggleMenu = (path) => {
    if (path === "/admin/pos-admin") setPosOpen((value) => !value);
    if (path === "/admin/sales") setSalesOpen((value) => !value);
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-700/35 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.open : ""}`}
      >
        {/* HEADER */}
        <div className={styles.brand}>
          <div className={styles.logo}><Image src="/finance/juja-logo.png" width={8640} height={2160} sizes="300px" priority alt="JUJA Brew & Bites" /><span>ADMIN / WORKSPACE</span></div>

          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-slate-900 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAV */}
        <nav className={styles.navigation} aria-label="Admin pages">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className={styles.sectionLabel}>
                {section.label}
              </p>

              <div className="space-y-1">
                {section.items.filter((item) => pageAllowed(item.path)).map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;

                  if (item.submenu) {
                    return (
                      <div key={item.name}>
                        <button
                          onClick={() => toggleMenu(item.path)}
                          aria-expanded={isMenuOpen(item.path)}
                          className={`${styles.navItem} ${active ? styles.active : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                          </span>
                          {isMenuOpen(item.path) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {isMenuOpen(item.path) && (
                          <div className={styles.submenu}>
                            {item.submenu.map((sub, i) => {
                              if (sub.type === "label") {
                                return (
                                  <p key={i} className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    {sub.name}
                                  </p>
                                );
                              }

                              return (
                                <Link
                                  key={sub.path}
                                  href={sub.path}
                                  onClick={() => setMobileOpen(false)}
                                  aria-current={isSubActive(sub.path) ? "page" : undefined}
                                  className={`${styles.navItem} ${isSubActive(sub.path) ? styles.active : ""}`}
                                >
                                  {sub.name}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`${styles.navItem} ${active ? styles.active : ""}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* FOOTER */}
        <div className={styles.account}>
          <strong>{userEmail}</strong><small>{String(userRole || "Admin").replaceAll("_", " ")}</small>
          <button
            onClick={onLogout}
            className={styles.signOut}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
