"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Order, MenuItem, MenuCategory } from "@/api/entities";

const STATUS_COLORS = {
  Pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  Confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  Preparing: "bg-purple-100 text-purple-700 border-purple-200",
  Ready:     "bg-green-100 text-green-700 border-green-200",
  Delivered: "bg-gray-100 text-gray-700 border-gray-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
};

export default function AdminDashboard() {
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetches live data from your Supabase tables
    Promise.all([
      Order.list(),
      MenuItem.list(),
      MenuCategory.list()
    ]).then(([o, m, c]) => {
      setOrders(o);
      setMenuItems(m);
      setCategories(c);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white border-b border-brand-gray">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-brand-teal">Juja Admin</Link>
          </div>
          <Link href="/order" className="text-sm px-4 py-2 border border-brand-gray hover:border-brand-teal transition">
            View Live Store
          </Link>
        </div>
      </nav>

      <div className="pt-24 max-w-7xl mx-auto px-6 pb-12">
        {/* Modern Tab Toggle */}
        <div className="flex border-b border-brand-gray mb-8">
          {["orders", "menu", "categories"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-8 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
                tab === t 
                ? "border-b-2 border-brand-teal text-brand-teal" 
                : "text-gray-400 hover:text-brand-dark"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center py-20 text-gray-500">Updating dashboard...</p>
        ) : (
          <div className="bg-white border border-brand-gray p-6">
            {tab === "orders" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-gray text-xs uppercase text-gray-500">
                      <th className="py-4 px-2">Order ID</th>
                      <th className="py-4 px-2">Customer</th>
                      <th className="py-4 px-2">Items</th>
                      <th className="py-4 px-2">Total</th>
                      <th className="py-4 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-brand-light hover:bg-brand-light transition">
                        <td className="py-4 px-2 font-mono text-xs uppercase">{order.id.slice(0, 8)}</td>
                        <td className="py-4 px-2 font-bold">{order.customer_name}</td>
                        <td className="py-4 px-2 text-gray-500">{order.items?.length} items</td>
                        <td className="py-4 px-2 font-bold text-brand-teal">₱{order.total_amount?.toFixed(2)}</td>
                        <td className="py-4 px-2">
                          <span className={`px-3 py-1 text-[10px] font-bold uppercase border ${STATUS_COLORS[order.status]}`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {tab === "menu" && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {menuItems.map((item) => (
                  <div key={item.id} className="border border-brand-gray p-4 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold">{item.name}</h3>
                      <p className="text-xs text-gray-500">{item.category}</p>
                      <p className="text-brand-teal font-bold mt-2">₱{item.price?.toFixed(2)}</p>
                    </div>
                    <button className="text-[10px] uppercase font-bold border border-brand-dark px-2 py-1 hover:bg-brand-dark hover:text-white transition">
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}