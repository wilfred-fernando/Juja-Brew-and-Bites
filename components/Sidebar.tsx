"use client";

import Link from "next/link";

/* ================= TYPES ================= */

type NavItem = {
  name: string;
  path: string;
  icon: string;
};

type SidebarProps = {
  navItems: NavItem[];
  pathname: string;
  onNavigate: () => void;
};

/* ================= COMPONENT ================= */

export default function Sidebar({
  navItems,
  pathname,
  onNavigate,
}: SidebarProps) {

  return (
    <aside className="w-[260px] bg-white border-r border-rose-100 flex flex-col">

      {/* HEADER */}
      <div className="p-6 border-b border-rose-50">
        <h2 className="font-bold text-slate-800">Admin Panel</h2>
      </div>

      {/* NAV */}
      <nav className="flex-1 py-6 px-4 space-y-1">
        {navItems.map((item: NavItem) => {

          const isActive =
            item.path === "/admin"
              ? pathname === "/admin" || pathname === "/"
              : pathname.startsWith(item.path);

          return (
            <Link
              key={item.name}
              href={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-[#FFF5F7] text-[#FC687D] font-semibold"
                  : "text-slate-500 hover:bg-rose-50"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}