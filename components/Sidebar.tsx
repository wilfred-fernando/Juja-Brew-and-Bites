"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
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

export default function Sidebar() {
  const pathname = usePathname();
  const [openSection, setOpenSection] = useState("");

  useEffect(() => {
    const active = navItems.find((item) =>
      pathname.startsWith(item.path)
    );
    if (active?.submenu) {
      setOpenSection(active.name);
    }
  }, [pathname]);

  function toggleSection(name) {
    setOpenSection((prev) => (prev === name ? "" : name));
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">

      {/* HEADER */}
      <div className="p-6 border-b">
        <h2 className="font-bold">Admin Panel</h2>
      </div>

      {/* NAV */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const hasSub = !!item.submenu;
          const isOpen = openSection === item.name;
          const isActive = pathname.startsWith(item.path);

          return (
            <div key={item.name}>

              {/* MAIN */}
              {hasSub ? (
                <button
                  onClick={() => toggleSection(item.name)}
                  className={`w-full flex justify-between px-4 py-2 rounded-lg ${
                    isActive ? "bg-rose-100 text-[#FC687D]" : ""
                  }`}
                >
                  <span>{item.icon} {item.name}</span>
                  <span>{isOpen ? "▲" : "▼"}</span>
                </button>
              ) : (
                <Link
                  href={item.path}
                  className={`block px-4 py-2 rounded-lg ${
                    isActive ? "bg-rose-100 text-[#FC687D]" : ""
                  }`}
                >
                  {item.icon} {item.name}
                </Link>
              )}

              {/* SUBMENU */}
              {hasSub && isOpen && (
                <div className="ml-6 mt-1 space-y-1">
                  {item.submenu.map((sub) => (
                    <Link
                      key={sub.path}
                      href={sub.path}
                      className={`block text-sm px-3 py-1 rounded ${
                        pathname === sub.path ? "text-[#FC687D]" : "text-gray-500"
                      }`}
                    >
                      {sub.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}