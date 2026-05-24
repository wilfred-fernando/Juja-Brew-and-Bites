"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // FETCH ORDERS
  // -----------------------------
  const fetchOrders = async () => {
    const { data } = await supabase
      .from("open_tickets_order")
      .select("*")
      .in("status", ["open", "preparing"])
      .order("created_at", { ascending: true });

    if (data) setOrders(data);
    setLoading(false);
  };

  // -----------------------------
  // REALTIME LISTENER
  // -----------------------------
  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("kds-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "open_tickets_order",
        },
        (payload) => {
          fetchOrders();

          // 🔥 NEW ORDER SOUND ALERT
          if (payload.eventType === "INSERT") {
            const audio = new Audio(
              "https://actions.google.com/sounds/v1/alarms/beep_short.ogg"
            );
            audio.play();
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // -----------------------------
  // UPDATE STATUS
  // -----------------------------
  const updateStatus = async (id, status) => {
    await supabase
      .from("open_tickets_order")
      .update({ status })
      .eq("id", id);
  };

  // -----------------------------
  // CALCULATE TIME AGO
  // -----------------------------
  const getTimeAgo = (date) => {
    const diff = Math.floor((new Date() - new Date(date)) / 60000);

    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)} hr ago`;
  };

  // -----------------------------
  // PRINT
  // -----------------------------
  const printKitchenTicket = (order) => {
    const w = window.open("", "_blank");

    w.document.write(`
      <html>
        <head>
          <title>Kitchen Ticket</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            h2 { text-align:center; }
            .item { padding: 4px 0; }
            .total { font-weight:bold; margin-top:10px; }
          </style>
        </head>
        <body>
          <h2>🍳 KITCHEN ORDER</h2>

          <p><b>ID:</b> ${order.id}</p>
          <p><b>Time:</b> ${new Date(order.created_at).toLocaleString()}</p>

          <hr/>

          ${order.items
            ?.map(
              (i) => `
              <div class="item">
                ${i.name} x${i.qty}
              </div>
            `
            )
            .join("")}

          <hr/>
          <div class="total">TOTAL: ₱${order.total}</div>

          <script>window.print();</script>
        </body>
      </html>
    `);

    w.document.close();
  };

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        Loading Kitchen...
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">🍳 Kitchen Display</h1>

        <button
          onClick={() => document.documentElement.requestFullscreen()}
          className="bg-black text-white px-3 py-1 rounded text-sm"
        >
          Full Screen
        </button>
      </div>

      {/* ORDERS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {orders.map((order) => {
          const minutes = Math.floor(
            (new Date() - new Date(order.created_at)) / 60000
          );

          return (
            <div
              key={order.id}
              className={`bg-white rounded-xl shadow border p-4 ${
                minutes > 10 ? "border-red-400" : ""
              }`}
            >

              {/* HEADER */}
              <div className="flex justify-between mb-2">
                <b>Order #{order.id.slice(-6)}</b>

                <span className="text-xs text-gray-500">
                  {getTimeAgo(order.created_at)}
                </span>
              </div>

              {/* ITEMS */}
              <div className="space-y-1 mb-3">
                {order.items?.map((item, i) => (
                  <div key={i} className="text-sm border-b pb-1">
                    <b>{item.name}</b> x{item.qty}
                  </div>
                ))}
              </div>

              {/* TOTAL */}
              <div className="font-bold mb-3">
                Total: ₱{order.total}
              </div>

              {/* STATUS */}
              <div className="mb-3 text-xs">
                Status:
                <span className="ml-2 font-bold">
                  {order.status}
                </span>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-2">

                <button
                  onClick={() => printKitchenTicket(order)}
                  className="bg-black text-white px-3 py-1 rounded text-sm"
                >
                  Print
                </button>

                {order.status === "open" && (
                  <button
                    onClick={() =>
                      updateStatus(order.id, "preparing")
                    }
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Start
                  </button>
                )}

                {order.status === "preparing" && (
                  <button
                    onClick={() =>
                      updateStatus(order.id, "done")
                    }
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm"
                  >
                    Done
                  </button>
                )}

              </div>

            </div>
          );
        })}

      </div>
    </div>
  );
}