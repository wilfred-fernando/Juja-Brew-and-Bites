"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

export default function LiveDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalSales: 0,
    activeOrders: 0,
    completedOrders: 0,
  });

  // -----------------------------
  // FETCH ORDERS
  // -----------------------------
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("open_tickets_order")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setOrders(data || []);
    calculateStats(data || []);
    setLoading(false);
  };

  // -----------------------------
  // CALCULATE DASHBOARD STATS
  // -----------------------------
  const calculateStats = (data) => {
    let totalSales = 0;
    let active = 0;
    let completed = 0;

    data.forEach((order) => {
      const amount = parseFloat(order.total || 0);
      totalSales += amount;

      if (order.status === "done") completed++;
      else active++;
    });

    setStats({
      totalSales,
      activeOrders: active,
      completedOrders: completed,
    });
  };

  // -----------------------------
  // REALTIME SUBSCRIPTION
  // -----------------------------
  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("live-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "open_tickets_order",
        },
        () => {
          fetchOrders(); // refresh instantly
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* HEADER */}
      <h1 className="text-2xl font-bold mb-6">
        📊 Live Sales Dashboard
      </h1>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        <div className="bg-white p-5 rounded-xl shadow border">
          <p className="text-gray-500 text-sm">Total Sales</p>
          <h2 className="text-2xl font-bold text-green-600">
            ₱{stats.totalSales.toFixed(2)}
          </h2>
        </div>

        <div className="bg-white p-5 rounded-xl shadow border">
          <p className="text-gray-500 text-sm">Active Orders</p>
          <h2 className="text-2xl font-bold text-blue-600">
            {stats.activeOrders}
          </h2>
        </div>

        <div className="bg-white p-5 rounded-xl shadow border">
          <p className="text-gray-500 text-sm">Completed Orders</p>
          <h2 className="text-2xl font-bold text-gray-800">
            {stats.completedOrders}
          </h2>
        </div>

      </div>

      {/* LIVE ORDERS LIST */}
      <div className="bg-white rounded-xl shadow border">
        <div className="p-4 border-b font-bold">
          🔴 Live Orders Feed
        </div>

        <div className="divide-y max-h-[600px] overflow-y-auto">

          {orders.map((order) => (
            <div
              key={order.id}
              className="p-4 flex justify-between items-center"
            >

              {/* LEFT */}
              <div>
                <p className="font-bold">
                  Order #{order.id.slice(-6)}
                </p>
                <p className="text-sm text-gray-500">
                  {formatDateTime(order.created_at)}
                </p>
              </div>

              {/* CENTER */}
              <div className="text-right">
                <p className="font-bold">₱{order.total}</p>
              </div>

              {/* STATUS */}
              <div>
                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold ${
                    order.status === "open"
                      ? "bg-yellow-100 text-yellow-700"
                      : order.status === "preparing"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {order.status}
                </span>
              </div>

            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
