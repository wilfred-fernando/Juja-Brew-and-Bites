export const ADMIN_ACCESS_PAGES = [
  { key: "dashboard", label: "Dashboard", path: "/admin", group: "Operations" },
  { key: "bookings", label: "Bookings", path: "/admin/bookings", group: "Operations" },
  { key: "calendar", label: "Calendar", path: "/admin/calendar", group: "Operations" },
  { key: "live_orders", label: "Live Orders", path: "/admin/orders", group: "Operations" },
  { key: "pos_admin", label: "POS Admin", path: "/admin/pos-admin", group: "Operations" },
  { key: "menu_builder", label: "Menu Builder", path: "/admin/menu", group: "Business" },
  { key: "loyalty", label: "Loyalty", path: "/admin/loyalty", group: "Business" },
  { key: "promos", label: "Promos", path: "/admin/promos", group: "Business" },
  { key: "sales", label: "Sales", path: "/admin/sales", group: "Business" },
  { key: "settings", label: "Settings", path: "/admin/settings", group: "System" },
  { key: "accounts", label: "Accounts", path: "/admin/accounts", group: "System" },
  { key: "pos", label: "POS", path: "/pos", group: "Portals" },
  { key: "kitchen", label: "Kitchen", path: "/kitchen", group: "Portals" },
  { key: "finance", label: "Finance", path: "/finance", group: "Portals" },
];

export function getAdminPageKey(pathname = "") {
  if (pathname === "/admin") return "dashboard";
  const sorted = [...ADMIN_ACCESS_PAGES].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((page) => page.path !== "/admin" && pathname.startsWith(page.path))?.key || null;
}

export function canAccessPage(accessRows = [], key, role = "") {
  if (!key || role === "super_admin") return true;
  const row = accessRows.find((entry) => entry.page_key === key);
  return row ? row.can_access !== false : true;
}
