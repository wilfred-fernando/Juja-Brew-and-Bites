"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";

type NavItem = {
  name: string;
  path: string;
  icon: string;
};

export default function AdminSidebar({
  navItems,
  pathname,
  onNavigate,
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col">

      {/* LOGO */}
      <div className="p-8 border-b border-rose-50">
        <h2 className="font-bold text-slate-800">Admin Panel</h2>
      </div>

      {/* NAV */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.path === "/admin"
              ? pathname === "/admin" || pathname === "/"
              : pathname.startsWith(item.path);

          return (
            <Link
              key={item.name}
              href={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${
                isActive
                  ? "bg-[#FC687D] text-white shadow-lg"
                  : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}