"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MonitorUp, Utensils } from "lucide-react";

const SLIDES = [
  {
    src: "/images/event-cart-milk-tea.jpg",
    title: "JUJA Drink Cart",
    kicker: "Milk Tea • Coffee • Events",
  },
  {
    src: "/images/event-cart-picapica.jpg",
    title: "JUJA Picapica",
    kicker: "Parties • Gatherings • Celebrations",
  },
  {
    src: "https://images.jujabrewandbites.com/juja%201.png",
    title: "Annyeong!",
    kicker: "Freshly prepared orders",
  },
];

function itemLabel(count) {
  return `${Number(count || 0).toLocaleString("en-PH")} ${Number(count || 0) === 1 ? "item" : "items"}`;
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

export default function CustomerOrderDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [now, setNow] = useState(new Date());

  const currentSlide = SLIDES[slideIndex % SLIDES.length];
  const servedOrders = useMemo(() => orders.filter((order) => order.status === "served"), [orders]);
  const preparingOrders = useMemo(() => orders.filter((order) => order.status !== "served"), [orders]);

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
    const slide = setInterval(() => setSlideIndex((value) => value + 1), 8000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(slide);
      clearInterval(clock);
    };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-4 text-slate-950">
      <div className="grid h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[70fr_30fr]">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 shadow-2xl backdrop-blur">
          <img
            key={currentSlide.src}
            src={currentSlide.src}
            alt={currentSlide.title}
            className="h-full w-full object-cover transition duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/10" />
          <div className="absolute left-8 top-8 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/85 px-5 py-3 shadow-lg backdrop-blur">
            <img src="/images/juja-logo.png" alt="JUJA Brew & Bites" className="h-10 w-auto" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-800">Now Preparing</p>
              <p className="text-lg font-bold text-slate-950">JUJA Brew & Bites</p>
            </div>
          </div>
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-white/90">{currentSlide.kicker}</p>
            <h1 className="mt-2 text-5xl font-black tracking-tight text-white drop-shadow lg:text-7xl">{currentSlide.title}</h1>
            <div className="mt-5 flex gap-2">
              {SLIDES.map((slide, index) => (
                <span
                  key={slide.src}
                  className={`h-2 rounded-full transition-all ${index === slideIndex % SLIDES.length ? "w-16 bg-white" : "w-6 bg-white/45"}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-slate-400/40 shadow-2xl">
          <div className="border-b border-slate-200/80 bg-slate-700 px-5 py-3 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-bold uppercase text-cyan-100">Customer Order</p>
                <p className="mt-1 text-4xl font-bold tracking-tight">Kitchen Queue</p>
              </div>
              <div className="text-right">
                <p className="text-5xl font-black">
                  {new Intl.DateTimeFormat("en-PH", {
                    timeZone: "Asia/Manila",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  }).format(now)}
                </p>
                
              </div>
            </div>
          </div>

         
          <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
            {loading ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
                <div className="text-center">
                  <MonitorUp className="mx-auto h-12 w-12 text-cyan-700" />
                  <p className="mt-3 text-xl font-bold text-slate-700">Loading kitchen queue...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-xl font-bold text-red-700">
                {error}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/80">
                <div className="text-center">
                  <Utensils className="mx-auto h-16 w-16 text-slate-400" />
                  <p className="mt-4 text-3xl font-black text-slate-800">No active kitchen orders.</p>                  
                </div>
              </div>
            ) : (
              <div className="h-full space-y-3 overflow-y-auto pr-1">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className={`rounded-3xl border px-6 py-5 shadow-sm transition ${
                      order.status === "served"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-cyan-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between px-sm py-sm gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-3xl font-bold uppercase tracking-tight text-slate-950">{order.dining_option}</p>
                        <div className="mt-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                          <Clock3 className="h-4 w-4" />
                          {displayTime(order.updated_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-flex rounded-2xl px-4 py-2 text-sm font-black uppercase tracking-[0.14em] ${
                          order.status === "served" ? "bg-emerald-600 text-white" : "bg-blue-500 text-white"
                        }`}>
                          {order.status === "served" ? "Served" : "Preparing"}
                        </span>
                        <p className="mt-1 text-[22px] font-black text-slate-950 text-center">{itemLabel(order.item_count)}</p>
                      </div>
                    </div>
                    
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
