"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MonitorUp, Utensils } from "lucide-react";

const VIDEO_SRC = "/videos/customer-order-display.mp4";
const VIDEO_POSTER = "https://images.jujabrewandbites.com/Cookies%20(1376%20x%20824%20px).jpg";
const LOGO_SRC = "/images/juja-logo.png";
const TARGET_TV_SIZE = "1920 x 1080 px";
const TARGET_VIDEO_SIZE = "1376 x 924 px";

function itemLabel(count) {
  const value = Number(count || 0);
  return `${value.toLocaleString("en-PH")} ${value === 1 ? "item" : "items"}`;
}

function displayTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function clockParts(now) {
  const time = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    weekday: "short",
  }).format(now);

  return { time, date: date.toUpperCase() };
}

export default function CustomerOrderDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());

  const preparingOrders = useMemo(() => orders.filter((order) => order.status !== "served"), [orders]);
  const servedOrders = useMemo(() => orders.filter((order) => order.status === "served"), [orders]);
  const visibleOrders = useMemo(() => [...preparingOrders, ...servedOrders], [preparingOrders, servedOrders]);
  const time = clockParts(now);

  async function loadOrders({ silent = false } = {}) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/customer-order-display", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to load display.");
      setOrders(Array.isArray(json.orders) ? json.orders : []);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to load display.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    const refresh = setInterval(() => loadOrders({ silent: true }), 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-5 text-slate-950">
      <div className="mx-auto grid h-full max-w-[1920px] grid-cols-[minmax(0,1fr)_500px] grid-rows-[96px_minmax(0,1fr)] gap-4">
        <header className="col-span-1 flex min-w-0 items-center justify-between bg-[#8d8adf] px-4 text-white">
          <div className="flex min-w-0 items-center gap-4">
            <img src={LOGO_SRC} alt="JUJA Brew & Bites" className="h-20 w-20 shrink-0 object-contain" />
            <div className="border-4 border-[#7b5cff]">
              <p className="text-6xl font-bold italic tracking-[0.13em] drop-shadow">Annyeong!</p>
            </div>
          </div>
          <div className="hidden min-w-[310px] text-left xl:block">
            <p className="text-xl font-bold text-center tracking-[0.11em] italic">fb / ig / tiktok: jujabrewandbites</p>
            <p className="mt-1 text-[25px] text-center font-semibold">www.jujabrewandbites.com</p>
          </div>
          <div className="min-w-[300px] text-right">
            <p className="text-6xl font-black leading-none tracking-wide">{time.time}</p>
            <p className="mt-1 text-xl font-black tracking-wide">{time.date}</p>
          </div>
        </header>

        <aside className="col-start-2 row-span-2 grid min-h-0 grid-rows-[76px_minmax(0,1fr)] bg-sky-50/70">
          <div className="flex items-center justify-center bg-[#7468cf] px-4 text-white">
            <p className="text-[41px] font-black uppercase tracking-[0.10em]">Now Preparing</p>
          </div>

          <section className="min-h-0 overflow-hidden bg-slate-800/30">
            {loading ? (
              <div className="flex h-full items-center justify-center bg-blue-50/80">
                <div className="text-center">
                  <MonitorUp className="mx-auto h-12 w-12 text-cyan-700" />
                  <p className="mt-3 text-xl font-bold text-slate-700">Loading kitchen queue...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center bg-red-50 p-8 text-center text-xl font-bold text-red-700">
                {error}
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="flex h-full items-center justify-center bg-slate-50/60">
                <div className="text-center">
                  <Utensils className="mx-auto h-20 w-20 text-slate-400" />
                  <p className="mt-4 text-2xl font-black text-slate-900">No active kitchen orders.</p>
                </div>
              </div>
            ) : (
              <div className="h-full space-y-3 overflow-y-auto p-3">
                {visibleOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`border px-5 py-4 shadow-sm transition ${
                      order.status === "served" ? "border-emerald-200 bg-emerald-50" : "border-cyan-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-3xl font-black uppercase tracking-tight text-slate-950">{order.dining_option}</p>
                        <div className="mt-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                          <Clock3 className="h-4 w-4" />
                          {displayTime(order.updated_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex px-4 py-2 text-sm font-black uppercase rounded-[15px] tracking-[0.14em] ${
                            order.status === "served" ? "bg-emerald-600 text-white" : "bg-blue-500 text-white"
                          }`}
                        >
                          {order.status === "served" ? "Served" : "Preparing"}
                        </span>
                        <p className="mt-2 text-center text-2xl font-black text-slate-950">{itemLabel(order.item_count)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="relative col-span-1 row-start-2 min-h-0 overflow-hidden bg-black">
          <video
            className="h-full w-full object-cover"
            src={VIDEO_SRC}
            poster={VIDEO_POSTER}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />         
        </section>
      </div>
    </main>
  );
}
