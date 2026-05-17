"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

/* ================= TYPES ================= */

type SubItem = {
  name: string;
  path: string;
};

type NavItem = {
  name: string;
  path: string;
  icon: string;
  submenu?: SubItem[];
};

/* ================= NAV ================= */

const navItems: NavItem[] = [
  { name: "Dashboard", path: "/admin", icon: "🏠" },

  {
    name: "Bookings",
    path: "/admin/bookings",
    icon: "📅",
    submenu: [
      { name: "All Bookings", path: "/admin/bookings" },
      { name: "Calendar View", path: "/admin/bookings/calendar" },
    ],
  },

  {
    name: "Reports",
    path: "/admin/reports",
    icon: "📊",
  },

  {
    name: "Items",
    path: "/admin/menu",
    icon: "🛍️",
  },

  { name: "Loyalty", path: "/admin/loyalty", icon: "⭐" },
];

/* ================= HELPERS ================= */

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.path) return true;

  if (pathname.startsWith(item.path + "/")) return true;

  if (
    item.submenu?.some((s: SubItem) =>
      pathname === s.path || pathname.startsWith(s.path + "/")
    )
  ) return true;

  return false;
}

/* ================= COMPONENT ================= */

export default function Sidebar() {
  const pathname = usePathname();

  const [openSection, setOpenSection] = useState<string>("");

  useEffect(() => {
    const active = navItems.find((item) => isActive(item, pathname));
    if (active?.submenu) {
      setOpenSection(active.name);
    }
  }, [pathname]);

  function toggleSection(name: string) {
    setOpenSection((prev) => (prev === name ? "" : name));
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">

      {/* HEADER */}
      <div className="p-6 border-b">
        <h2 className="font-bold text-slate-800">Admin Panel</h2>
      </div>

      {/* NAV */}
      <nav className="flex-1 p-4 space-y-1">

        {navItems.map((item) => {
          const hasSub = !!item.submenu;
          const isOpen = openSection === item.name;
          const active = isActive(item, pathname);

          return (
            <div key={item.name}>

              {/* MAIN ITEM */}
              {hasSub ? (
                <button
                  onClick={() => toggleSection(item.name)}
                  className={`w-full flex justify-between px-4 py-2 rounded-lg ${
                    active ? "bg-rose-100 text-[#FC687D]" : "text-slate-500"
                  }`}
                >
                  <span>{item.icon} {item.name}</span>
                  <span>{isOpen ? "▲" : "▼"}</span>
                </button>
              ) : (
                <Link
                  href={item.path}
                  className={`block px-4 py-2 rounded-lg ${
                    active ? "bg-rose-100 text-[#FC687D]" : "text-slate-500"
                  }`}
                >
                  {item.icon} {item.name}
                </Link>
              )}

              {/* SUBMENU */}
              {hasSub && isOpen && (
                <div className="ml-6 mt-1 space-y-1">
                  {item.submenu?.map((s: SubItem) => {
                    const subActive = pathname === s.path;

                    return (
                      <Link
                        key={s.name}
                        href={s.path}
                        className={`block text-sm ${
                          subActive
                            ? "text-[#FC687D]"
                            : "text-slate-400"
                        }`}
                      >
                        {s.name}
                      </Link>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}

      </nav>
    </aside>
  );
}