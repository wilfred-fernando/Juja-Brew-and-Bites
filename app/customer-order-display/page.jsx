"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MonitorUp, Utensils } from "lucide-react";

const DISPLAY_WIDTH = 8268;
const DISPLAY_HEIGHT = 4606;
const SLIDE_INTERVAL_MS = 10000;

const DISPLAY_SLIDES = [
  "https://images.jujabrewandbites.com/Cookies%20(1376%20x%20824%20px).jpg",
  "https://images.jujabrewandbites.com/TV_BENTO.png",
  "https://images.jujabrewandbites.com/TV_DUBAI%20CHEWY.png",
  "https://images.jujabrewandbites.com/TV_LOYALTY%202.png",
  "https://images.jujabrewandbites.com/TV_EGG%20BUBBLE.png",
  "https://images.jujabrewandbites.com/TV_FREE%20WIFI.png",
  "https://images.jujabrewandbites.com/TV_FRESH%20MANGO.png",
  "https://images.jujabrewandbites.com/TV_FUNCTION%20ROOM.png",
  "https://images.jujabrewandbites.com/TV_GREAT%20COFFEE.png",
  "https://images.jujabrewandbites.com/TV_KATSU.png",
  "https://images.jujabrewandbites.com/TV_MILK%20TEA.png",
  "https://images.jujabrewandbites.com/TV_MIN%20DONUT-COFFEE.png",
  "https://images.jujabrewandbites.com/TV_NO%20SMOKING.png",
  "https://images.jujabrewandbites.com/TV_LOYALTY.png",
  "https://images.jujabrewandbites.com/TV_NUTELLA%20MT.png",
  "https://images.jujabrewandbites.com/TV_PARFAIT.png",
  "https://images.jujabrewandbites.com/TV_PET%20FRIENDLY.png",
  "https://images.jujabrewandbites.com/TV_PET%20FRIENDLY.png",
  "https://images.jujabrewandbites.com/TV_TAIWAN.png",
  "https://images.jujabrewandbites.com/TV_UNLI%20WINGS.png",
];
const LOGO_SRC = "/images/juja-logo.png";

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
  const [slideIndex, setSlideIndex] = useState(0);

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
    const refresh = setInterval(() => loadOrders({ silent: true }), 6000);
    const clock = setInterval(() => setNow(new Date()), 2000);
    const slide = setInterval(() => {
      setSlideIndex((current) => (current + 1) % DISPLAY_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      clearInterval(slide);
    };
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-[url('https://images.jujabrewandbites.com/page%20background.png')] bg-cover bg-center p-5 text-slate-950">
      <div
        className="mx-auto grid h-full w-full max-w-[8268px] grid-cols-[minmax(0,1fr)_300px] grid-rows-[96px_minmax(0,1fr)] gap-4"
        style={{ aspectRatio: `${DISPLAY_WIDTH} / ${DISPLAY_HEIGHT}` }}
      >
        <header className="col-span-1 flex min-w-0 items-center justify-between bg-blue-600/60 px-4 text-white">
          <div className="flex min-w-0 items-center gap-4">
            <img src={LOGO_SRC} alt="JUJA Brew & Bites" className="h-20 w-20 shrink-0 object-contain" />
            <div className="border-4 border-[#7b5cff]">
              <p className="text-6xl font-bold italic tracking-[0.13em] drop-shadow"></p>
            </div>
          </div>
          <div className="hidden min-w-[310px] text-left xl:block">
            <p className="text-xl font-bold text-center tracking-[0.11em] italic">fb / ig / tiktok: jujabrewandbites</p>
            <p className="mt-1 text-[25px] text-center font-semibold">www.jujabrewandbites.com</p>
          </div>
          <div className="min-w-[300px] text-right">
            <p className="text-6xl font-black leading-none tracking-wide">{time.time}</p>
            <p className="mt-.5 text-2xl font-black tracking-wide">{time.date}</p>
          </div>
        </header>

        <aside className="col-start-2 row-span-2 grid min-h-0 grid-rows-[95px_minmax(0,1fr)] bg-blue-300/20">
          <div className="flex items-center justify-center bg-blue-600/60 px-6 text-white">
            <p className="text-[28px] font-black uppercase">Now Preparing</p>
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
                          className={`inline-flex px-4 py-2 text-sm font-black rounded-full uppercase tracking-[0.14em] ${
                            order.status === "served" ? "bg-red-600 text-white" : "bg-emerald-500 text-white"
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
          <img
            key={DISPLAY_SLIDES[slideIndex]}
            src={DISPLAY_SLIDES[slideIndex]}
            alt=""
            className="absolute inset-0 z-10 h-full w-full object-cover"
          />
        </section>
      </div>
    </main>
  );
}
