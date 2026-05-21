"use client";

import Link from "next/link";

export default function POSAdmin() {
  return (
    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-bold">POS Admin</h1>

      <div className="grid md:grid-cols-2 gap-6">

        {/* REPORTS */}
        <div className="bg-white p-5 rounded-xl">
          <h2 className="font-bold mb-3">Reports</h2>

          <div className="space-y-2">
            <Link href="/admin/pos-admin/reports/sales-summary">Sales Summary</Link>
            <Link href="/admin/pos-admin/reports/sales-by-item">Sales by Item</Link>
            <Link href="/admin/pos-admin/reports/sales-by-category">Sales by Category</Link>
            <Link href="/admin/pos-admin/reports/sales-by-payment">Sales by Payment</Link>
            <Link href="/admin/pos-admin/reports/receipts">Receipts</Link>
            <Link href="/admin/pos-admin/reports/discounts">Discounts</Link>
            <Link href="/admin/pos-admin/reports/shifts">Shifts</Link>
          </div>
        </div>

        {/* SETTINGS */}
        <div className="bg-white p-5 rounded-xl">
          <h2 className="font-bold mb-3">Settings</h2>

          <div className="space-y-2">
            <Link href="/admin/pos-admin/settings/payment-types">Payment Types</Link>
            <Link href="/admin/pos-admin/settings/receipt-settings">Receipt Settings</Link>
            <Link href="/admin/pos-admin/settings/open-tickets">Open Tickets</Link>
            <Link href="/admin/pos-admin/settings/kitchen-printers">Kitchen Printers</Link>
            <Link href="/admin/pos-admin/settings/dining-options">Dining Options</Link>
            <Link href="/admin/pos-admin/settings/discounts">Discounts</Link>
          </div>
        </div>

      </div>
    </div>
  );
}