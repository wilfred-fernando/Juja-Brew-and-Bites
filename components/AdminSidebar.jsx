"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  Boxes,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DollarSign,
  Gift,
  Home,
  Puzzle,
  Settings,
  ShoppingCart,
  Star,
  UserCog,
  X,
} from "lucide-react";
import { canAccessPage } from "@/lib/adminPageAccess";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

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
        { name: "Orders", path: "/admin/orders", icon: ClipboardList },

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
            { name: "Dining Options", path: "/admin/pos-admin/settings/dining-options" },
            { name: "Discounts", path: "/admin/pos-admin/settings/discounts" },
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
        { name: "Promos", path: "/admin/promos", icon: Gift },
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
    "/admin/orders": "live_orders",
    "/admin/pos-admin": "pos_admin",
    "/admin/menu": "menu_builder",
    "/admin/inventory": "inventory",
    "/admin/loyalty": "customers",
    "/admin/customers": "customers",
    "/admin/promos": "promos",
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200/75 bg-white/84 text-slate-800 shadow-[0_28px_90px_rgba(51,65,85,0.18)] backdrop-blur-xl transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200/80 p-6">
          <img src={LOGO} className="h-8 object-contain" alt="logo" />

          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-slate-900 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAV */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-4">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">
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
                          className={`flex w-full justify-between rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 hover:bg-sky-50 hover:text-slate-950 ${
                            active ? "bg-sky-100 text-slate-950 shadow-[0_10px_24px_rgba(51,65,85,0.12)]" : "text-slate-700"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                          </span>
                          {isMenuOpen(item.path) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {isMenuOpen(item.path) && (
                          <div className="ml-4 mt-2 space-y-1 border-l border-slate-200 pl-3">
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
                                  className={`block rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 ${
                                    isSubActive(sub.path)
                                      ? "bg-sky-100 text-slate-950 shadow-[0_10px_22px_rgba(51,65,85,0.10)]"
                                      : "text-slate-600 hover:bg-sky-50 hover:text-slate-900"
                                  }`}
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
                      className={`flex gap-2 rounded-xl px-3 py-2 text-sm transition duration-200 hover:-translate-y-0.5 ${
                        active
                          ? "bg-sky-100 text-slate-950 shadow-[0_10px_22px_rgba(51,65,85,0.10)]"
                          : "text-slate-700 hover:bg-sky-50 hover:text-slate-950"
                      }`}
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
        <div className="border-t border-slate-200/80 p-4">
          <div className="mb-2 truncate text-xs text-slate-600">{userEmail}</div>
          <button
            onClick={onLogout}
            className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-slate-950"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
