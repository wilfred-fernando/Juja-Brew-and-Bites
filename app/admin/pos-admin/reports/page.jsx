"use client";

import Link from "next/link";

const reports = [
  { title: "Sales Summary", href: "/admin/pos-admin/reports/sales-summary", desc: "Daily gross sales, discounts, and net sales." },
  { title: "Sales by Item", href: "/admin/pos-admin/reports/sales-by-item", desc: "Quantity and sales totals per menu item." },
  { title: "Sales by Category", href: "/admin/pos-admin/reports/sales-by-category", desc: "Category-level performance." },
  { title: "Sales by Payment", href: "/admin/pos-admin/reports/sales-by-payment", desc: "Payment type breakdown." },
  { title: "Receipts", href: "/admin/pos-admin/reports/receipts", desc: "Receipt list and order totals." },
  { title: "Discounts", href: "/admin/pos-admin/reports/discounts", desc: "Discounted order report." },
  { title: "Shifts", href: "/admin/pos-admin/reports/shifts", desc: "Cashier shift records." },
];

export default function ReportsHub() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#FC687D]">POS Admin</p>
        <h1 className="text-2xl font-black text-slate-800">Reports</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition"
          >
            <h2 className="text-sm font-black text-slate-800">{report.title}</h2>
            <p className="text-xs font-semibold text-slate-500 mt-2 leading-relaxed">{report.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
