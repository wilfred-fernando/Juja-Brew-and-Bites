"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SalesDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("today");

  // -----------------------------
  // LOAD ORDERS
  // -----------------------------
  const fetchOrders = async () => {
    setLoading(true);

    let query = supabase.from("open_tickets_order").select("*");

    const now = new Date();
    let startDate = new Date();

    if (range === "today") {
      startDate.setHours(0, 0, 0, 0);
    }

    if (range === "7days") {
      startDate.setDate(now.getDate() - 7);
    }

    if (range === "30days") {
      startDate.setDate(now.getDate() - 30);
    }

    query = query.gte("created_at", startDate.toISOString());

    const { data } = await query;

    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [range]);

  // -----------------------------
  // TOTAL SALES
  // -----------------------------
  const totalSales = orders.reduce(
    (sum, o) => sum + Number(o.total || 0),
    0
  );

  // -----------------------------
  // TOTAL ORDERS
  // -----------------------------
  const totalOrders = orders.length;

  // -----------------------------
  // TOP PRODUCTS
  // -----------------------------
  const getTopItems = () => {
    const map = {};

    orders.forEach((order) => {
      order.items?.forEach((item) => {
        if (!map[item.name]) {
          map[item.name] = 0;
        }
        map[item.name] += item.qty;
      });
    });

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="p-6">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">

        <h1 className="text-2xl font-bold">
          📊 Sales Dashboard
        </h1>

        {/* FILTER */}
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>

      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-3 gap-4 mb-6">

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">
            Total Sales
          </div>
          <div className="text-xl font-bold">
            ₱{totalSales.toFixed(2)}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">
            Orders
          </div>
          <div className="text-xl font-bold">
            {totalOrders}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">
            Avg Order
          </div>
          <div className="text-xl font-bold">
            ₱
            {totalOrders
              ? (totalSales / totalOrders).toFixed(2)
              : 0}
          </div>
        </div>

      </div>

      {/* TOP ITEMS */}
      <div className="bg-white p-4 rounded shadow mb-6">

        <h2 className="font-bold mb-3">
          🔥 Top Selling Items
        </h2>

        {getTopItems().map(([name, qty], i) => (
          <div
            key={i}
            className="flex justify-between border-b py-2"
          >
            <span>{name}</span>
            <span className="font-bold">{qty}</span>
          </div>
        ))}

      </div>

      {/* ORDERS LIST */}
      <div className="bg-white p-4 rounded shadow">

        <h2 className="font-bold mb-3">
          📦 Recent Orders
        </h2>

        <div className="space-y-2">

          {orders.slice(0, 10).map((order) => (
            <div
              key={order.id}
              className="flex justify-between border-b py-2 text-sm"
            >

              <div>
                <div className="font-bold">
                  #{order.id.slice(-6)}
                </div>
                <div className="text-gray-500">
                  {new Date(order.created_at)
                    .toLocaleString()}
                </div>
              </div>

              <div className="font-bold">
                ₱{order.total}
              </div>

            </div>
          ))}

        </div>

      </div>

    </div>
  );
}