"use client";

import Link from "next/link";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

export default function AdminSidebar({
  pathname,
  mobileOpen,
  setMobileOpen,
  userEmail,
  onLogout,
}) {
  const SECTIONS = [
    {
      label: "Operations",
      items: [
        { name: "Dashboard", path: "/admin", icon: "🏠" },
        { name: "Bookings", path: "/admin/bookings", icon: "📅" },
        { name: "Calendar", path: "/admin/calendar", icon: "🗓️" }, // exists in tree [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s008c2b75b3e84f00bb2e16354bd4dd9c)
        { name: "Live Orders", path: "/admin/orders", icon: "📋" },
        { name: "POS Admin", path: "/admin/pos-admin", icon: "🛒" }, // exists in tree [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s008c2b75b3e84f00bb2e16354bd4dd9c)
      ],
    },
    {
      label: "Business",
      items: [
        { name: "Menu Builder", path: "/admin/menu", icon: "🧩" },
        { name: "Modifiers", path: "/admin/modifiers", icon: "🧾" }, // exists in tree [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s008c2b75b3e84f00bb2e16354bd4dd9c)
        { name: "Loyalty", path: "/admin/loyalty", icon: "⭐" }, // exists in tree [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s008c2b75b3e84f00bb2e16354bd4dd9c)
        { name: "Promos", path: "/admin/promos", icon: "🎁" },
        { name: "Sales", path: "/admin/sales", icon: "💳" }, // exists in tree [1](https://onedrive.live.com?cid=933E55CC8541EC41&id=933E55CC8541EC41!s008c2b75b3e84f00bb2e16354bd4dd9c)
      ],
    },
    {
      label: "System",
      items: [{ name: "Settings", path: "/admin/settings", icon: "⚙️" }],
    },
  ];

  const isActive = (itemPath) => {
    if (itemPath === "/admin") return pathname === "/admin";
    return pathname?.startsWith(itemPath);
  };

  const initial = (userEmail || "Admin").trim().charAt(0).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-rose-100 flex flex-col transition-transform duration-300 md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-rose-50 flex items-center justify-between">
          <img src={LOGO} alt="Juja" className="h-8 object-contain" />
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-lg"
            aria-label="Close admin menu"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-2 text-[10px] uppercase tracking-widest text-slate-400 font-black">
                {section.label}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  const dashboard = item.path === "/admin";

                  // ✅ Dashboard: remove active background on desktop
                  // Mobile can still show subtle bg for clarity.
                  const activeClass = dashboard
                    ? "text-[#FC687D] bg-rose-50 md:bg-transparent"
                    : "text-[#FC687D] bg-rose-50";

                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`relative flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${
                        active
                          ? activeClass
                          : "text-slate-600 hover:bg-rose-50 hover:text-[#FC687D]"
                      }`}
                    >
                      {/* Active left indicator */}
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#FC687D] rounded-r" />
                      )}

                      <span className="text-lg">{item.icon}</span>
                      <span className="text-sm font-bold">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-rose-50 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-[#FC687D] font-extrabold text-sm">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black truncate">
                {userEmail || "Staff"}
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-500 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}