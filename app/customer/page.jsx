"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Barcode as BarcodeIcon, CalendarDays, DollarSign, MapPin, Phone, ShoppingBasket, Star } from "lucide-react";

import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { webDiningOptionLabel } from "@/lib/kds";
import { applyAnnualPointResetToMember, resetMemberPointsIfExpired } from "@/lib/loyalty/annualReset";
import { isWelcomeVoucher, WELCOME_VOUCHER_REWARD_TEXT } from "@/lib/loyalty/welcomeVoucher";
import { findVoucherForMenuItem, isPromoCategoryName, isPromoMenuItem, isVoucherAvailable, loyaltyEligibleLineTotal } from "@/lib/menuPromos";
import { ensureNativeNotificationPermission, isNativeApp, registerNativeCustomerPush, showNativeNotification } from "@/lib/nativeNotifications";
import BookingTab from "@/components/BookingForm";
import CustomerApkUpdatePrompt from "@/components/CustomerApkUpdatePrompt";
import ApkDownloadBanner from "@/components/ApkDownloadBanner";
import { getStableSession } from "@/lib/supabase/session";

const hasMenuOptions = (item) =>
  Array.isArray(item?.variants) &&
  item.variants.some((group) => (Array.isArray(group?.options) ? group.options.length > 0 : true));

const Barcode = dynamic(() => import("react-barcode"), { ssr: false });

const LOGO =
  "https://images.jujabrewandbites.com/SIGNAGE%20light%20with%20korean%20letters%203.png";

const supabase = getSupabaseClient();

const loyaltyPoints = (amount) => Number(((Number(amount) || 0) * 0.04).toFixed(2));
const peso0 = (amount) => `₱${Number(amount || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
const peso2 = (amount) => `₱${Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ALERT_SOUND_SRC = "/sound/notification.mp3";
const CUSTOMER_NOTIFICATION_ICON = "/favicon.ico";
const isMenuItemMarkedAvailable = (item) => item?.is_available !== false && item?.available !== false;
const optionGroupKey = (value) => String(value || "").trim().toLowerCase();
const optionSelectionKey = (value) => String(value || "").trim().toLowerCase();

function customerLineGross(line) {
  return Number(line?.unitPrice || line?.price || 0) * Number(line?.quantity || line?.qty || 0);
}

function customerLineDiscount(line) {
  return Math.max(0, Math.min(customerLineGross(line), Number(line?.discountAmount || line?.discount_amount || 0)));
}

function customerLineNet(line) {
  return Math.max(0, customerLineGross(line) - customerLineDiscount(line));
}

function voucherRewardText(voucher) {
  return isWelcomeVoucher(voucher) ? WELCOME_VOUCHER_REWARD_TEXT : voucher?.reward_text;
}

const loyaltyPerkSections = [  
  {
    label: "Earning Points",
    accent: "EARN",
    items: [
      "Earn 1 JUJA Point for every PHP 25 spent on food and drinks.",
      "Present your loyalty card for scanning during purchase.",
      "Points are credited immediately after purchase.",
    ],
  },
  {
    label: "Redeeming Rewards",
    accent: "100",
    items: [
      "100 Points creates a free reward for any 16oz drink, waffle, or mini donuts.",
      "Birthday perk: get any 16oz drink or waffle free on your birthday with a valid ID.",
      "Rewards expire 90 days after reaching 100 points.",
    ],
  },
  {
    label: "Expiration Policy",
    accent: "EXP",
    items: ["Available JUJA Points reset to 0 every December 31 at 11:59 PM Asia/Manila. Lifetime points balance and active vouchers are not included in the reset."],
  },
];

const loyaltyFlavorSelections = [
  {
    label: "Waffle Flavors",
    items: ["Honey Syrup", "Choco Oreo", "Cheese", "Blueberry Whip", "Strawberry Whip", "Mango Graham"],
  },
  {
    label: "Mini Donut Flavors",
    items: ["Chocolate", "White Chocolate", "Strawberry", "Matcha"],
  },
];

const loyaltyTerms = [
  "Rewards and perks are non-transferable and cannot be exchanged for cash.",
  "Lost loyalty card? Request a digital copy in-store.",
  "JUJA Brew & Bites may amend these guidelines without prior notice.",
];

function isCustomerPwaInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
}

function customerPortalPath(path) {
  if (typeof window === "undefined") return `/customer${path}`;
  return window.location.hostname.startsWith("customer.") ? path : `/customer${path}`;
}

async function registerCustomerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn("Customer service worker registration skipped:", err);
    return null;
  }
}

async function requestCustomerNotificationPermission() {
  if (isNativeApp()) return ensureNativeNotificationPermission();
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.warn("Customer notification permission skipped:", err);
    return Notification.permission;
  }
}

async function showCustomerPanelNotification(payload) {
  const notificationPayload = {
    title: "Juja Brew & Bites",
    icon: CUSTOMER_NOTIFICATION_ICON,
    badge: CUSTOMER_NOTIFICATION_ICON,
    url: "/customer?tab=history",
    requireInteraction: true,
    ...payload,
  };

  const nativeShown = await showNativeNotification({
    title: notificationPayload.title,
    body: notificationPayload.body,
    tag: notificationPayload.tag,
    icon: notificationPayload.icon,
    channelId: "customer-orders-audible",
    channelName: "Customer Order Alerts",
    summaryText: notificationPayload.summaryText,
    largeBody: notificationPayload.largeBody,
    group: notificationPayload.group,
    data: {
      url: notificationPayload.url,
      ...(notificationPayload.data || {}),
    },
  });
  if (nativeShown) return;

  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const registration = await registerCustomerServiceWorker();
  if (registration?.showNotification) {
    await registration.showNotification(notificationPayload.title, {
      body: notificationPayload.body,
      icon: notificationPayload.icon,
      badge: notificationPayload.badge,
      tag: notificationPayload.tag,
      renotify: true,
      requireInteraction: notificationPayload.requireInteraction,
      vibrate: [220, 90, 220, 90, 220],
      data: { url: notificationPayload.url, ...(notificationPayload.data || {}) },
    });
    return;
  }

  const notification = new Notification(notificationPayload.title, {
    body: notificationPayload.body,
    icon: notificationPayload.icon,
    badge: notificationPayload.badge,
    tag: notificationPayload.tag,
    requireInteraction: notificationPayload.requireInteraction,
  });
  notification.onclick = () => {
    window.focus();
    window.location.href = notificationPayload.url;
  };
}

function playCustomerAlertSound(status = "ready") {
  if (typeof window === "undefined") return;
  const audio = new Audio(ALERT_SOUND_SRC);
  audio.volume = status === "ready" ? 0.95 : 0.75;
  audio.play().catch(() => {
    playGeneratedCustomerTone(status);
  });
}

function playGeneratedCustomerTone(status = "ready") {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const notes = status === "completed" ? [660, 880, 990] : [880, 1175, 1568];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.72);
    gain.connect(ctx.destination);

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
      osc.connect(gain);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.22);
    });
    setTimeout(() => ctx.close(), 900);
  } catch (err) {
    console.warn("Customer alert sound skipped:", err);
  }
}

function getManilaDateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function getManilaTimeString(offsetMinutes = 30) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function manilaDateTime(dateString, timeString) {
  if (!dateString || !timeString) return null;
  const parsed = new Date(`${dateString}T${timeString}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundUpToQuarter(date) {
  const next = new Date(date);
  const roundedMinutes = Math.ceil(next.getMinutes() / 15) * 15;
  next.setMinutes(roundedMinutes, 0, 0);
  return next;
}

function parseStoreTime(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (raw === "24:00") return raw;
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return fallback;
  return `${String(Math.min(23, Number(match[1]))).padStart(2, "0")}:${String(Math.min(59, Number(match[2] || 0))).padStart(2, "0")}`;
}

function getStoreOrderHours(store) {
  const storeName = String(store?.name || "").toLowerCase();
  const defaultClose = storeName.includes("pasong") ? "24:00" : "22:00";
  return {
    open: parseStoreTime(store?.open_time || store?.opening_time || store?.store_open_time, "10:00"),
    close: parseStoreTime(store?.close_time || store?.closing_time || store?.store_close_time, defaultClose),
  };
}

function buildTargetTimeOptions(dateString, store) {
  if (!dateString) return [];
  const { open, close } = getStoreOrderHours(store);
  const openAt = manilaDateTime(dateString, open);
  const closeAtBase = manilaDateTime(dateString, close === "24:00" ? "00:00" : close);
  if (!openAt || !closeAtBase) return [];

  let closeAt = closeAtBase;
  if (close === "24:00" || closeAt <= openAt) closeAt = new Date(closeAt.getTime() + 24 * 60 * 60 * 1000);
  const lastOrderAt = new Date(closeAt.getTime() - 30 * 60 * 1000);
  const minImmediateAt = roundUpToQuarter(new Date(Date.now() + 30 * 60 * 1000));
  let cursor = dateString === getManilaDateString(0) && minImmediateAt > openAt ? minImmediateAt : openAt;
  cursor = roundUpToQuarter(cursor);

  const options = [];
  while (cursor <= lastOrderAt) {
    options.push({
      value: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(cursor),
      label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(cursor),
    });
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }
  return options;
}

function formatOrderScheduleLabel(dateString, timeString) {
  const date = manilaDateTime(dateString, timeString);
  if (!date) return `${dateString || ""} ${timeString || ""}`.trim();
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function normalizePinCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return "";
  return number.toFixed(7);
}

function hasDeliveryPin(pin) {
  return Boolean(normalizePinCoordinate(pin?.lat, -90, 90) && normalizePinCoordinate(pin?.lng, -180, 180));
}

function deliveryMapPreviewUrl({ pin, address } = {}) {
  const lat = Number(pin?.lat);
  const lng = Number(pin?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=17&output=embed`;
  }
  const q = String(address || "").trim();
  if (q.length >= 4) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
  }
  return "";
}

function genCustomerId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function normalizeLoyaltyName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return formatDate(iso, String(iso));
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function dateInputToBirthday(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return "";
  return `${m[1]}-${MONTHS[monthIndex]}-${m[3]}`;
}

function birthdayToDateInput(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  const mon = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
  const monthIndex = MONTHS.indexOf(mon);
  if (monthIndex === -1) return "";
  return `${m[1]}-${String(monthIndex + 1).padStart(2, "0")}-${m[3]}`;
}

function normalizeBirthday(input) {
  const s = String(input || "").trim();
  if (!s) return { ok: false, value: "", msg: "Birthday is required." };

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const converted = dateInputToBirthday(s);
    if (!converted) return { ok: false, value: s, msg: "Please select a valid birthday." };
    return normalizeBirthday(converted);
  }

  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (!m) {
    return { ok: false, value: s, msg: "Please select birthday from the date field." };
  }

  const yyyy = m[1];
  const monRaw = m[2];
  const dd = m[3];

  const mon = monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase();
  if (!MONTHS.includes(mon)) {
    return {
      ok: false,
      value: s,
      msg: "Month must be Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.",
    };
  }

  const dayNum = Number(dd);
  if (dayNum < 1 || dayNum > 31) {
    return { ok: false, value: s, msg: "Day must be 01 to 31." };
  }

  return { ok: true, value: `${yyyy}-${mon}-${dd}`, msg: "" };
}

/* ──────────────────────────────────────────────────────────────
    Responsive Sidebar / Bottom Tab Navigation
────────────────────────────────────────────────────────────── */
function AppNavigation({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "order", icon: "🍽️", label: "Order" },
    { id: "history", icon: "📦", label: "Tracker" },
    { id: "loyalty", icon: "⭐", label: "Loyalty" },
    { id: "booking", icon: "🗓", label: "Book" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <>
      {/* Mobile & Tablet Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-rose-50 pb-safe shadow-[0_-4px_24px_rgba(252,104,125,0.05)] lg:hidden">
        <div className="max-w-xl mx-auto grid grid-cols-6 px-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center justify-center py-3 gap-1 transition-all duration-300 active:scale-90 ${
                tab === t.id ? "text-[#FC687D]" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className={`text-[20px] leading-none transition-transform duration-300 ${tab === t.id ? "scale-110 -translate-y-0.5" : ""}`}>
                {t.icon}
              </span>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${tab === t.id ? "text-[#FC687D]" : "text-slate-400"}`}>
                {t.label}
              </span>
              {tab === t.id && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#FC687D]" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Desktop Persistent Left Sidebar Layout */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-64 bg-white border-r border-rose-50 p-6 z-50">
        <div className="flex items-center gap-3 mb-8 px-2">
          <img src={LOGO} alt="Juja Logo" className="h-10 w-auto object-contain" />
          <div className="leading-tight">
            <h1 className="text-xs font-bold uppercase tracking-widest text-[#FC687D]">Juja</h1>
            <p className="text-[10px] uppercase text-slate-400 tracking-wider">Brew & Bites</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                tab === t.id
                  ? "bg-[#FFF5F7] text-[#FC687D]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="tracking-wide">{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
    Home Tab
────────────────────────────────────────────────────────────── */
function HomeTab({ member, user, setTab }) {
  const availablePts = parseFloat(member?.["Available points"] ?? 0) || 0;
  const totalPts = parseFloat(member?.["Points balance"] ?? 0) || 0;
  const visits = parseFloat(member?.["Total visits"] ?? 0) || 0;

  const [branch, setBranch] = useState("pasongtamo");

  const BRANCHES = {
    pasongtamo: {
      buttonLabel: "Pasong Tamo",
      name: "PASONG TAMO BRANCH",
      address: "36D Visayas Ave., Pasong Tamo, QC",
      phone: "0939-9228383",
      hoursLabel: "OPEN DAILY",
      hours: ["10AM – 12MN"],
      room: ["Function Room: 10AM – 2AM"],
    },
    diliman: {
      buttonLabel: "Diliman",
      name: "DILIMAN BRANCH",
      address: "8 Visayas Ave., Diliman, QC",
      phone: "0961-6320909",
      hoursLabel: "STORE HOURS",
      hours: ["Mon - Sat: 9AM – 10PM", "Sun: CLOSED"],
      room: [],
    },
  };

  const active = BRANCHES[branch];

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-rose-50 shadow-sm lg:hidden">
        <div className="flex items-center gap-3">
          <Link href="/" className="active:scale-95 transition">
            <img src={LOGO} alt="Juja" className="h-9 w-auto object-contain" />
          </Link>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Juja Brew & Bites</p>
            <p className="text-xs text-slate-600 font-semibold truncate max-w-[200px]">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl md:rounded-[32px] p-6 border border-rose-100 shadow-[0_4px_20px_rgba(252,104,125,0.04)] relative overflow-hidden h-full flex flex-col justify-between">
            <div
              className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-20"
              style={{
                background: "radial-gradient(circle,#FC687D,transparent 65%)",
                filter: "blur(50px)",
              }}
            />
            <div className="relative z-10">
              <p className="text-[#FC687D] text-[10px] font-semibold uppercase tracking-[0.25em] mb-1">
                Welcome back 👋
              </p>
              <h2 className="text-2xl md:text-3xl font-medium text-slate-800 leading-tight tracking-tight">
                {member?.customer_name || user?.user_metadata?.full_name || "Coffee Lover"}
              </h2>
              {member?.customer_code && (
                <p className="text-slate-400 text-xs font-mono tracking-wider mt-1">{member.customer_code}</p>
              )}
            </div>

            {member && (
              <div className="grid grid-cols-3 gap-2 mt-8 bg-[#FFF9FA] p-4 rounded-2xl border border-rose-50">
                <div className="text-center md:text-left">
                  <p className="text-[#FC687D] font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {availablePts.toFixed(2)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Available</p>
                </div>
                <div className="text-center md:text-left border-l border-rose-100 pl-2">
                  <p className="text-slate-800 font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {totalPts.toFixed(2)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Total</p>
                </div>
                <div className="text-center md:text-left border-l border-rose-100 pl-2">
                  <p className="text-slate-800 font-bold text-xl md:text-2xl lg:text-3xl leading-none">
                    {visits.toFixed(0)}
                  </p>
                  <p className="text-slate-500 text-[9px] uppercase font-semibold tracking-widest mt-1.5">Visits</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:block bg-white rounded-2xl border border-rose-50 p-6 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-4">App Status</p>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#FFF5F7] flex items-center justify-center text-lg text-[#FC687D]">✨</div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800">Automatic Updates</p>
              <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold">Enabled & Live</p>
            </div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-500">
            📍 High-speed ordering, bookings and point monitoring features are completely operational.
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Quick Shortcuts</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: "🍽️", label: "Order Food", sub: "Browse menu", tab: "order" },
            { icon: "📦", label: "Tracker", sub: "Order Status", tab: "history" },
            { icon: "⭐", label: "Loyalty", sub: "Rewards", tab: "loyalty" },
            { icon: "🗓", label: "Book Room", sub: "Function room", tab: "booking" },
          ].map((c) => (
            <button
              key={c.label}
              onClick={() => setTab(c.tab)}
              className="flex min-h-[150px] w-full flex-col items-center justify-center rounded-2xl border border-rose-50 bg-white p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-2xl text-[#FC687D]">
                {c.icon}
              </div>
              <p className="text-center text-sm font-semibold text-slate-800 md:text-base">{c.label}</p>
              <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">{c.sub}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-rose-50 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Our Outlets</p>
            <h3 className="text-lg font-semibold text-slate-800">Visit Juja Outlets</h3>
          </div>
          <div className="flex gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
            {Object.entries(BRANCHES).map(([key, b]) => (
              <button
                key={key}
                onClick={() => setBranch(key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                  branch === key
                    ? "bg-white text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {b.buttonLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-3.5 text-sm text-slate-600 font-medium">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">{active.name}</p>
            <p className="flex gap-3 items-start"><span className="text-base">📍</span>{active.address}</p>
            <p className="flex gap-3 items-start"><span className="text-base">📞</span>{active.phone}</p>
          </div>
          <div className="space-y-3 bg-[#FFF9FA] border border-rose-50/50 p-4 rounded-xl text-sm text-slate-600">
            <p className="flex gap-3 items-start">
              <span className="text-base">🕙</span>
              <span>
                <span className="font-bold text-slate-800 uppercase tracking-wider text-xs block mb-1">{active.hoursLabel}</span>
                {active.hours.map((line) => <span key={line} className="block font-medium">{line}</span>)}
              </span>
            </p>
            {active.room.length > 0 && (
              <p className="flex gap-3 items-start border-t border-rose-100/60 pt-2 mt-2">
                <span className="text-base">🏢</span>
                <span>
                  {active.room.map((line) => <span key={line} className="block text-slate-500 font-medium">{line}</span>)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Customer Order: Add To Cart Modal View
────────────────────────────────────────────────────────────── */
function optionGroupMaxSelection(group) {
  const value = Number(group?.maxSelection ?? group?.max_selection ?? group?.maxSelections ?? group?.max_selections);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : null;
}

function AddToCartModal({ item, onClose, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState({});
  const [instructions, setInstructions] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    if (!item) return;
    const source = item.editData || item;
    setQuantity(source.quantity || 1);
    setInstructions(source.instructions || "");

    const selected = {};
    if (source.variantDetails && item.variants) {
      source.variantDetails.split(", ").forEach((name) => {
        item.variants.forEach((g) => {
          const match = g.options?.find((o) => o.name === name);
          if (match) {
            selected[g.id] = selected[g.id] || [];
            selected[g.id].push(match);
          }
        });
      });
    }
    setSelections(selected);

    const nextCollapsed = {};
    (item.variants || [])
      .filter((g) => !g.posOnly && g.isAvailable !== false && g.is_available !== false)
      .forEach((g) => {
        nextCollapsed[g.id] = !g.isRequired;
      });
    setCollapsedGroups(nextCollapsed);
  }, [item]);

  if (!item) return null;

  const toggleOption = (group, opt) => {
    const current = selections[group.id] || [];
    if (!group.isMultiSelect) {
      setSelections({ ...selections, [group.id]: [opt] });
    } else {
      const exists = current.find((o) => o.id === opt.id);
      const maxSelection = optionGroupMaxSelection(group);
      if (!exists && maxSelection && current.length >= maxSelection) return;
      setSelections({
        ...selections,
        [group.id]: exists ? current.filter((o) => o.id !== opt.id) : [...current, opt],
      });
    }
  };

  const visibleVariantGroups = (item.variants || []).filter(
    (g) => !g.posOnly && g.isAvailable !== false && g.is_available !== false
  );

  const variantPrice =
    Object.values(selections)
      .flat()
      .reduce((sum, o) => sum + (Number(o.price) || 0), 0) || 0;

  const unitPrice = (Number(item.price) || 0) + variantPrice;
  const promoVoucher = item._promoVoucher || null;
  const voucherDiscountRate = promoVoucher ? (isWelcomeVoucher(promoVoucher) ? 0.5 : 1) : 0;
  const voucherDiscountAmount = promoVoucher ? Number((unitPrice * quantity * voucherDiscountRate).toFixed(2)) : 0;
  const variantDetails = Object.values(selections)
    .flat()
    .map((o) => o.name)
    .join(", ");
  const selectedOptions = Object.entries(selections).flatMap(([groupId, options]) => {
    const group = visibleVariantGroups.find((entry) => String(entry.id) === String(groupId)) || {};
    return (options || []).map((option) => ({
      id: option.id,
      name: option.name,
      price: Number(option.price) || 0,
      groupId,
      groupName: group.name || group.label || group.id || "Options",
    }));
  });

  const canAdd =
    visibleVariantGroups.every((g) => !g.isRequired || (selections[g.id] || []).length > 0);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="customer-item-modal contrast-safe-modal w-full max-w-lg rounded-t-[26px] md:rounded-[24px] p-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom md:fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="customer-item-modal__header flex items-start justify-between gap-4 pb-4">
          <div>
            <p className="customer-item-modal__eyebrow text-[10px] uppercase tracking-widest font-bold">Add to Selection</p>
            <h3 className="customer-item-modal__title text-xl font-bold mt-0.5">{item.name}</h3>
            <p className="customer-item-modal__base text-sm font-semibold mt-1">
              Base {peso0(item.price)}
              {variantPrice > 0 ? ` • +${peso0(variantPrice)} variants` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="customer-item-modal__close w-9 h-9 rounded-full flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {visibleVariantGroups.length > 0 && (
          <div className="mt-4 space-y-5">
            {visibleVariantGroups.map((g) => {
              const isCollapsed = !!collapsedGroups[g.id];
              const selectedCount = (selections[g.id] || []).length;

              return (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="customer-item-modal__group-title text-sm font-bold">
                      {g.name} {g.isRequired ? <span className="customer-item-modal__required">*</span> : null}
                    </p>
                    <p className="customer-item-modal__group-mode text-[10px] uppercase font-bold tracking-wider">
                      {g.isMultiSelect ? `Multi-select${optionGroupMaxSelection(g) ? ` up to ${optionGroupMaxSelection(g)}` : ""}` : "Single-select"}
                      {selectedCount > 0 ? ` • ${selectedCount} selected` : ""}
                    </p>
                  </div>
                  {!g.isRequired && (
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups((current) => ({ ...current, [g.id]: !current[g.id] }))}
                      className="rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 transition hover:bg-slate-100"
                    >
                      {isCollapsed ? "Expand" : "Hide"}
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(g.options || []).map((o) => {
                    const sel = (selections[g.id] || []).find((x) => x.id === o.id);
                    const maxSelection = optionGroupMaxSelection(g);
                    const blocked = !!(g.isMultiSelect && !sel && maxSelection && (selections[g.id] || []).length >= maxSelection);
                    return (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => toggleOption(g, o)}
                        className={`customer-option-choice ${sel ? "customer-option-choice--selected" : ""}`}
                        style={{ opacity: blocked ? 0.45 : 1 }}
                      >
                        <span className="customer-option-choice__name">{o.name}</span>
                        <span className="customer-option-choice__price">
                          {Number(o.price) > 0 ? `+${peso0(o.price)}` : "FREE"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        <div className="mt-5">
          <label className="customer-item-modal__label block text-[10px] uppercase tracking-widest font-bold mb-1">
            Special Instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g., less ice, sweetener options, etc..."
            className="customer-item-modal__textarea w-full p-4 rounded-xl text-sm outline-none h-20 resize-none transition-all font-medium"
          />
        </div>

        <div className="customer-item-modal__footer mt-6 flex flex-col sm:flex-row items-center gap-4 pt-4">
          <div className="customer-item-modal__qty flex items-center w-full sm:w-36 h-12 rounded-xl overflow-hidden">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="customer-item-modal__qty-btn w-12 h-full text-xl font-bold transition-colors"
            >
              −
            </button>
            <div className="customer-item-modal__qty-value flex-1 text-center font-bold">{quantity}</div>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="customer-item-modal__qty-btn w-12 h-full font-bold transition-colors"
            >
              +
            </button>
          </div>

          <button
            disabled={!canAdd}
            onClick={() =>
              onAdd({
                id: item.id,
                name: item.name,
                category: item.category || item.category_name || item.categoryName || null,
                categoryId: item.category_id || item.menu_category_id || null,
                unitPrice,
                quantity,
                variantDetails,
                selectedOptions,
                instructions,
                discountAmount: voucherDiscountAmount,
                isPromoRedemption: isPromoMenuItem(item),
                loyaltyPointsEligible: !isPromoMenuItem(item),
                appliedVoucher: promoVoucher
                  ? {
                      id: promoVoucher.id,
                      code: promoVoucher.code,
                      reward_text: voucherRewardText(promoVoucher),
                      reward_type: promoVoucher.reward_type,
                      expires_at: promoVoucher.expires_at,
                    }
                  : null,
                cartItemId: item.editData?.cartItemId || Date.now(),
              })
            }
            className="bg-blue-200 w-full sm:flex-1 h-12 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
          >
            {canAdd ? `Add To Basket • ${peso0(unitPrice * quantity - voucherDiscountAmount)}` : "Select Required Configurations"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Interactive Checkout Confirmation Drawer
────────────────────────────────────────────────────────────── */
function DeliveryPinPickerModal({ open, address, pin, onAddressChange, onPinChange, onClose }) {
  const [draftAddress, setDraftAddress] = useState(address || "");
  const [draftPin, setDraftPin] = useState({ lat: pin?.lat || "", lng: pin?.lng || "" });
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraftAddress(address || "");
    setDraftPin({ lat: pin?.lat || "", lng: pin?.lng || "" });
    setPinError("");
  }, [address, open, pin?.lat, pin?.lng]);

  if (!open) return null;

  const previewUrl = deliveryMapPreviewUrl({ pin: draftPin, address: draftAddress });
  const pinIsValid = hasDeliveryPin(draftPin);
  const saveDisabled = !pinIsValid || draftAddress.trim().length < 8;

  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPinError("Location access is not available on this device.");
      return;
    }
    setPinLoading(true);
    setPinError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = normalizePinCoordinate(position.coords.latitude, -90, 90);
        const lng = normalizePinCoordinate(position.coords.longitude, -180, 180);
        setDraftPin({ lat, lng });
        setDraftAddress((current) => current.trim() || `Pinned location: ${lat}, ${lng}`);
        setPinLoading(false);
      },
      (error) => {
        setPinError(error?.message || "Location permission was denied.");
        setPinLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const savePin = () => {
    if (saveDisabled) return;
    onAddressChange(draftAddress.trim());
    onPinChange({
      lat: normalizePinCoordinate(draftPin.lat, -90, 90),
      lng: normalizePinCoordinate(draftPin.lng, -180, 180),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[190] bg-black/55 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full max-w-lg rounded-t-[28px] md:rounded-[24px] bg-white p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-700">Delivery Pin</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Select Pin Location</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Use the exact drop-off point plus the written address or landmark.</p>
          </div>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 shadow-sm">
            x
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-cyan-100 bg-cyan-50/80">
            {previewUrl ? (
              <iframe title="Delivery pin preview" src={previewUrl} className="h-56 w-full border-0" loading="lazy" />
            ) : (
              <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-slate-500">
                <MapPin className="h-8 w-8 text-cyan-700" />
                <p className="text-xs font-bold uppercase tracking-widest">No pin selected</p>
                <p className="max-w-xs text-xs">Tap use current location or manually enter latitude and longitude.</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={pinLoading}
            className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-900/10 transition active:scale-[0.98] disabled:opacity-60"
          >
            {pinLoading ? "Getting Location..." : "Use My Current Location"}
          </button>

          {pinError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{pinError}</div> : null}

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Address / Landmark</label>
            <textarea
              value={draftAddress}
              onChange={(e) => setDraftAddress(e.target.value)}
              className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-cyan-600"
              placeholder="House number, street, barangay, city, landmark"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Latitude</label>
              <input
                value={draftPin.lat}
                onChange={(e) => setDraftPin((current) => ({ ...current, lat: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-cyan-600"
                inputMode="decimal"
                placeholder="14.6754858"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Longitude</label>
              <input
                value={draftPin.lng}
                onChange={(e) => setDraftPin((current) => ({ ...current, lng: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-cyan-600"
                inputMode="decimal"
                placeholder="121.0438648"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setDraftPin({ lat: "", lng: "" });
                onPinChange({ lat: "", lng: "" });
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700"
            >
              Clear Pin
            </button>
            <button
              type="button"
              onClick={savePin}
              disabled={saveDisabled}
              className="rounded-xl bg-cyan-700 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white disabled:bg-slate-200 disabled:text-slate-500"
            >
              Save Pin
            </button>
        </div>
      </div>
    </div>
    </div>
  );
}

function OrderConfirmationModal({ open, onClose, onConfirm, subtotal, loyaltyEligibleSubtotal, cartItems, isSubmitting, selectedStore, selectedStoreName }) {
  const [diningOption, setDiningOption] = useState("TAKEOUT");
  const [fulfillmentDate, setFulfillmentDate] = useState(getManilaDateString(0));
  const [fulfillmentTime, setFulfillmentTime] = useState(getManilaTimeString(30));
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPin, setDeliveryPin] = useState({ lat: "", lng: "" });
  const [deliveryServiceLevel, setDeliveryServiceLevel] = useState("regular");
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState("");
  const [deliveryLocationLoading, setDeliveryLocationLoading] = useState(false);
  const [deliveryLocationError, setDeliveryLocationError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentProof, setPaymentProof] = useState(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const targetTimeOptions = useMemo(() => buildTargetTimeOptions(fulfillmentDate, selectedStore), [fulfillmentDate, selectedStore]);
  const selectedTimeOption = targetTimeOptions.find((option) => option.value === fulfillmentTime);

  useEffect(() => {
    if (!targetTimeOptions.length) {
      setFulfillmentTime("");
      setTimePickerOpen(false);
      return;
    }
    if (!targetTimeOptions.some((option) => option.value === fulfillmentTime)) {
      setFulfillmentTime(targetTimeOptions[0].value);
    }
  }, [fulfillmentTime, targetTimeOptions]);

  useEffect(() => {
    let cancelled = false;
    setDeliveryQuote(null);
    setDeliveryQuoteError("");

    if (!open || diningOption !== "DELIVERY") {
      setDeliveryQuoteLoading(false);
      return;
    }

    const address = deliveryAddress.trim();
    if (address.length < 8 || !selectedStore?.id) {
      setDeliveryQuoteLoading(false);
      return;
    }

    setDeliveryQuoteLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const { session } = await getStableSession(supabase);
        const res = await fetch("/api/customer/delivery-quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            storeId: selectedStore.id,
            deliveryAddress: address,
            deliveryLatitude: deliveryPin.lat || null,
            deliveryLongitude: deliveryPin.lng || null,
            deliveryServiceLevel,
            subtotal,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
          throw new Error(json?.error || "Delivery fee estimate failed.");
        }
        if (!cancelled) {
          setDeliveryQuote(json.summary || null);
          setDeliveryQuoteError("");
        }
      } catch (error) {
        if (!cancelled) {
          setDeliveryQuote(null);
          setDeliveryQuoteError(error?.message || "Delivery fee estimate failed.");
        }
      } finally {
        if (!cancelled) setDeliveryQuoteLoading(false);
      }
    }, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, diningOption, deliveryAddress, deliveryPin.lat, deliveryPin.lng, deliveryServiceLevel, selectedStore?.id, subtotal]);

  if (!open) return null;

  const selectedTargetAt = manilaDateTime(fulfillmentDate, fulfillmentTime);
  const minImmediateAt = roundUpToQuarter(new Date(Date.now() + 30 * 60 * 1000));
  const isScheduledOrder = Boolean(selectedTargetAt && selectedTargetAt > minImmediateAt);
  const isValidTime = fulfillmentTime && fulfillmentTime.trim() !== "" && targetTimeOptions.some((option) => option.value === fulfillmentTime);
  const paymentOptions = diningOption === "DELIVERY" ? ["QRPH"] : diningOption === "DINEIN" ? [] : ["Cash", "Card", "QRPH"];
  const requiresPaymentProof = paymentMethod === "QRPH";
  const regularDeliveryFee = Number(deliveryQuote?.regularFee || deliveryQuote?.fee || 0);
  const priorityDeliveryFee = Number(deliveryQuote?.priorityFee || 0);
  const priorityDeliveryAvailable = Boolean(deliveryQuote && priorityDeliveryFee > 0);
  const deliveryFee =
    diningOption === "DELIVERY"
      ? deliveryServiceLevel === "priority"
        ? regularDeliveryFee + priorityDeliveryFee
        : regularDeliveryFee
      : 0;
  const orderTotal = subtotal + deliveryFee;
  const hasDeliveryQuote =
    diningOption !== "DELIVERY" ||
    (Number.isFinite(deliveryFee) && deliveryFee > 0 && (deliveryServiceLevel !== "priority" || priorityDeliveryAvailable));
  const deliveryPinSelected = hasDeliveryPin(deliveryPin);
  const canSubmit =
    isValidTime &&
    (diningOption !== "DELIVERY" || deliveryAddress.trim().length >= 8) &&
    hasDeliveryQuote &&
    !deliveryQuoteLoading &&
    (!requiresPaymentProof || !!paymentProof);
  const potentialPointsEarned = loyaltyPoints(loyaltyEligibleSubtotal);
  const deliveryMapUrl = deliveryMapPreviewUrl({ pin: deliveryPin, address: deliveryAddress });

  const useDeliveryCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDeliveryLocationError("Location access is not available on this device.");
      return;
    }
    setDeliveryLocationLoading(true);
    setDeliveryLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = normalizePinCoordinate(position.coords.latitude, -90, 90);
        const lng = normalizePinCoordinate(position.coords.longitude, -180, 180);
        setDeliveryPin({ lat, lng });
        setDeliveryAddress((current) => current.trim() || `Pinned location: ${lat}, ${lng}`);
        setDeliveryLocationLoading(false);
      },
      (error) => {
        setDeliveryLocationError(error?.message || "Location permission was denied.");
        setDeliveryLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/55 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div 
        className="w-full max-w-xl bg-slate-50 rounded-t-[30px] md:rounded-[28px] shadow-2xl max-h-[94vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-slate-200/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-[0.28em] text-cyan-700">Checkout</p>
              <h3 className="mt-0.5 text-xl font-bold text-slate-900">Place Order</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Review branch, schedule, payment, and total before sending.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-50 text-lg font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
              aria-label="Close checkout"
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3">
          <div className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-800">Sending to</p>
                <p className="mt-1 text-base font-bold text-slate-900">{selectedStoreName || "Selected branch"}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">Change the branch from the store selector above the menu before placing the order.</p>
              </div>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-800">Store</span>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500">
              ORDER TYPE
              </label>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Required</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "TAKEOUT", label: "Self Pickup", icon: "🛍️" },
                { id: "DINEIN", label: "Dine-In", icon: "🍽️" },
                { id: "DELIVERY", label: "Delivery", icon: "🛵" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setDiningOption(opt.id); setPaymentProof(null); if (opt.id === "DELIVERY") setPaymentMethod("QRPH"); else if (opt.id === "DINEIN") setPaymentMethod(""); else setPaymentMethod("Cash"); }}
                  className={`min-h-20 rounded-2xl border px-2 py-3 flex flex-col items-center justify-center gap-2 font-bold text-xs transition ${
                    diningOption === opt.id
                      ? "border-cyan-500 bg-cyan-50 text-cyan-900 shadow-sm shadow-cyan-900/10"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/60"
                  }`}
                >
                  <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wider ${diningOption === opt.id ? "bg-cyan-700 text-white" : "bg-white text-slate-500"}`}>
                    {opt.id === "TAKEOUT" ? "Pickup" : opt.id === "DINEIN" ? "Table" : "Rider"}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Target Time</p>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isScheduledOrder ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {isScheduledOrder ? "Scheduled" : "Soonest"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">
                  Target Date
                </label>
                <input
                  type="date"
                  min={getManilaDateString(0)}
                  value={fulfillmentDate}
                  onChange={(e) => setFulfillmentDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-3 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">
                  Target Time
                </label>
                <div className="relative">
                  <button
                    type="button"
                    disabled={!targetTimeOptions.length}
                    onClick={() => setTimePickerOpen((current) => !current)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-3 rounded-xl text-left text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {selectedTimeOption?.label || "Select time"}
                  </button>
                  {timePickerOpen && targetTimeOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[170] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl">
                      {targetTimeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setFulfillmentTime(option.value);
                            setTimePickerOpen(false);
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold transition ${
                            fulfillmentTime === option.value
                              ? "bg-cyan-700 text-white"
                              : "text-slate-700 hover:bg-cyan-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          {!targetTimeOptions.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              No available target times for this store/date. Please choose another date.
            </div>
          )}
          {isValidTime && (
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-[11px] font-semibold text-cyan-900">
              {isScheduledOrder ? "Advance order scheduled for " : "Earliest target time: "}
              {formatOrderScheduleLabel(fulfillmentDate, fulfillmentTime)}
            </div>
          )}
          </section>

          {diningOption === "DELIVERY" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Details</p>
                <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-800">Lalamove</span>
              </div>
              <div className="space-y-2">
                {[
                  { id: "regular", label: "Regular", help: "Standard rider booking" },
                  { id: "priority", label: "Priority", help: "Higher rider matching fee" },
                ].map((speed) => {
                  const fee = speed.id === "priority" ? regularDeliveryFee + priorityDeliveryFee : regularDeliveryFee;
                  const selected = deliveryServiceLevel === speed.id;
                  const unavailablePriority = speed.id === "priority" && deliveryQuote && !priorityDeliveryAvailable;
                  return (
                    <button
                      key={speed.id}
                      type="button"
                      disabled={unavailablePriority}
                      onClick={() => setDeliveryServiceLevel(speed.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        unavailablePriority
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          :
                        selected
                          ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm shadow-cyan-900/10"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/60"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-black uppercase tracking-wider">{speed.label}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-slate-500">{speed.help}</span>
                      </span>
                      <span className={`shrink-0 text-right text-sm font-black ${unavailablePriority ? "text-slate-400" : "text-cyan-900"}`}>
                        {deliveryQuoteLoading ? "..." : unavailablePriority ? "Not available" : deliveryQuote ? peso2(fee) : "--"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">
                  Delivery Address
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => {
                    setDeliveryAddress(e.target.value);
                    setDeliveryPin({ lat: "", lng: "" });
                  }}
                  className="w-full min-h-20 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  placeholder="House number, street, barangay, city, landmark"
                />
              </div>
              <div className="overflow-hidden rounded-2xl border border-cyan-100 bg-cyan-50/70">
                {deliveryMapUrl ? (
                  <iframe title="Delivery address map" src={deliveryMapUrl} className="h-52 w-full border-0" loading="lazy" />
                ) : (
                  <div className="flex h-52 flex-col items-center justify-center gap-2 text-center text-slate-500">
                    <MapPin className="h-8 w-8 text-cyan-700" />
                    <p className="text-xs font-bold uppercase tracking-widest">Type delivery address</p>
                    <p className="max-w-xs text-xs">The map preview updates as the address is entered.</p>
                  </div>
                )}
                <div className="border-t border-cyan-100 bg-white/75 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-800">Map Preview</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-600">
                        {deliveryPinSelected ? `Using phone location: ${deliveryPin.lat}, ${deliveryPin.lng}` : "Address-based preview. Use phone location if the pin needs higher accuracy."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={useDeliveryCurrentLocation}
                      disabled={deliveryLocationLoading}
                      className="shrink-0 rounded-xl bg-cyan-700 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg shadow-cyan-900/10 transition hover:bg-cyan-800 disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {deliveryLocationLoading ? "Locating..." : "Use Phone Location"}
                    </button>
                  </div>
                  {deliveryLocationError ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">{deliveryLocationError}</p>
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Fee Preview</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-600">
                      {deliveryServiceLevel === "priority"
                        ? priorityDeliveryAvailable
                          ? "Priority includes the regular fee plus the rider matching priority fee."
                          : "Priority fee is not available from Lalamove yet. Please use Regular delivery."
                        : "Regular Lalamove motorcycle estimate. Final rider booking is confirmed by the cashier."}
                    </p>
                  </div>
                  <p className="text-lg font-black text-cyan-900">
                    {deliveryQuoteLoading ? "..." : deliveryQuote && deliveryServiceLevel === "priority" && !priorityDeliveryAvailable ? "Not available" : deliveryQuote ? peso2(deliveryFee) : "--"}
                  </p>
                </div>
                {deliveryServiceLevel === "priority" && deliveryQuote ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                    <span>Regular fee: {peso2(regularDeliveryFee)}</span>
                    <span className="text-right">Priority fee: {peso2(priorityDeliveryFee)}</span>
                  </div>
                ) : null}
                {deliveryQuote?.distanceMeters ? (
                  <p className="mt-2 text-[10px] font-bold text-cyan-700">
                    Estimated distance: {(Number(deliveryQuote.distanceMeters) / 1000).toFixed(2)} km
                  </p>
                ) : null}
                {deliveryQuoteError ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">
                    {deliveryQuoteError}
                  </p>
                ) : null}
                {deliveryAddress.trim().length >= 8 && !deliveryQuote && !deliveryQuoteLoading && !deliveryQuoteError ? (
                  <p className="mt-2 text-[10px] font-bold text-slate-500">Delivery fee will appear here before you place the order.</p>
                ) : null}
              </div>
            </section>
          )}

          {paymentOptions.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-3">
                Payment Option
              </label>
              <div className="grid grid-cols-3 gap-2">
                {paymentOptions.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(method);
                      if (method !== "QRPH") setPaymentProof(null);
                    }}
                    className={`h-11 rounded-xl border text-xs font-bold uppercase tracking-wider transition ${
                      paymentMethod === method
                        ? "border-cyan-500 bg-cyan-700 text-white shadow-sm shadow-cyan-900/10"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-200 hover:bg-cyan-50"
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </section>
          )}

          {paymentMethod === "QRPH" && (
            <section className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">QRPH Payment Proof</p>
              <img src="/images/qrph.jpg" alt="QRPH payment code" className="w-full rounded-xl border border-white bg-white object-contain max-h-72" />
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">
                  Upload Payment Screenshot
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                  className="w-full text-xs font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                />
                <p className="text-[10px] font-semibold text-slate-500 mt-2">
                  Cashier will review the proof amount before accepting the order.
                </p>
              </div>
            </section>
          )}

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-between text-xs text-emerald-800 font-medium shadow-sm">
            <span className="flex items-center gap-2">⭐ <span>Points Earned</span></span>
            <span className="font-extrabold text-sm text-emerald-700">+{potentialPointsEarned.toFixed(2)} pts</span>
          </div>

          <section className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Order Summary</p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{cartItems.length} line(s)</span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 pr-1">
              {cartItems.map((line, idx) => (
                <div key={line.cartItemId || idx} className="flex justify-between gap-3 py-2 text-xs font-medium text-slate-700">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 leading-snug whitespace-normal break-words">
                      {line.quantity} x {line.name}
                    </p>
                    {line.variantDetails ? (
                      <p className="mt-0.5 text-[11px] font-semibold italic leading-snug text-slate-500 whitespace-normal break-words">{line.variantDetails}</p>
                    ) : null}
                    {line.specialInstructions ? (
                      <p className="mt-1 rounded-lg bg-cyan-50 px-2 py-1 text-[11px] font-semibold leading-snug text-cyan-900">Note: {line.specialInstructions}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-bold text-slate-900">{peso0(line.unitPrice * line.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-rose-100/60 pt-2.5 mt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold text-slate-700">Items Amount</span>
              <span className="text-base font-black text-slate-800">{peso0(subtotal)}</span>
            </div>
            {diningOption === "DELIVERY" && (
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-700">Delivery Fee</span>
                <span className="text-base font-black text-cyan-800">{deliveryQuote ? peso2(deliveryFee) : "--"}</span>
              </div>
            )}
            <div className="border-t border-rose-100/60 pt-2 flex justify-between items-baseline">
              <span className="text-xs font-bold text-slate-700">Total Amount</span>
              <span className="text-xl font-black text-cyan-800">{peso2(orderTotal)}</span>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white p-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)]">
          <div className="mb-3 space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Items Amount</span>
              <span className="text-slate-900">{peso0(subtotal)}</span>
            </div>
            {diningOption === "DELIVERY" && (
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Delivery Fee</span>
                <span className="text-cyan-800">{deliveryQuote ? peso2(deliveryFee) : "--"}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
              <span>Total Amount</span>
              <span className="text-xl text-cyan-800">{peso2(orderTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full py-3 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              diningOption,
              fulfillmentDate,
              fulfillmentTime,
              deliveryAddress,
              deliveryPin,
              deliveryServiceLevel,
              deliveryFee,
              deliveryQuote,
              paymentMethod,
              paymentProof,
              scheduledFor: selectedTargetAt?.toISOString() || null,
              scheduleLabel: formatOrderScheduleLabel(fulfillmentDate, fulfillmentTime),
              isScheduled: isScheduledOrder,
            })}
            disabled={isSubmitting || !canSubmit}
            className="w-full py-3 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-cyan-900/15 transition disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {isSubmitting ? "Sending..." : "Place Order"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-[26px] md:rounded-[20px] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Confirmation Required</p>
        <h3 className="text-lg font-bold text-slate-800 mt-0.5">{title}</h3>
        <p className="text-sm text-slate-500 mt-2.5 font-medium leading-relaxed">{message}</p>

        <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-xl bg-[#FC687D] text-white text-xs font-bold shadow-sm hover:bg-rose-500 transition"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Order Tab (Now Focused 100% On Smooth Menu & Basket Selection)
────────────────────────────────────────────────────────────── */
function OrderTab({ user, member, onCheckoutSuccess }) {
  const [items, setItems] = useState([]);
  const [cats, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState("ALL");
  const [itemSearch, setItemSearch] = useState("");

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("bcfa9d8f-f2e5-4573-b3e3-635901ec7a4e");
  const [stores, setStores] = useState([]);
  const [itemStoreAvailability, setItemStoreAvailability] = useState([]);
  const [categoryStoreAvailability, setCategoryStoreAvailability] = useState([]);
  const [optionGroupStoreAvailability, setOptionGroupStoreAvailability] = useState([]);
  const [optionSelectionStoreAvailability, setOptionSelectionStoreAvailability] = useState([]);
  const [activeVouchers, setActiveVouchers] = useState([]);
  const [availabilityNotice, setAvailabilityNotice] = useState("");

  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);
      const { session } = await getStableSession(supabase);
      const accessToken = session?.access_token;
      const res = await fetch("/api/menu-data?mode=customer", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setAvailabilityNotice(json.error || "Store availability is being synced. Showing all available menu items for now.");
        setLoading(false);
        return;
      }

      setItems(json.items || []);
      setCategories([...(json.categories || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
      const activeStores = json.stores || [];
      setStores(activeStores);
      setSelectedBranch((current) => (activeStores.some((store) => String(store.id) === String(current)) ? current : activeStores[0]?.id || current));
      setAvailabilityNotice("");
      setItemStoreAvailability(json.itemStoreAvailability || []);
      setCategoryStoreAvailability(json.categoryStoreAvailability || []);
      setOptionGroupStoreAvailability(json.optionGroupStoreAvailability || []);
      setOptionSelectionStoreAvailability(json.optionSelectionStoreAvailability || []);
      setLoading(false);
    }
    fetchMenu();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchActiveVouchers() {
      if (!member?.id) {
        setActiveVouchers([]);
        return;
      }
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, code, reward_text, reward_type, status, expires_at, redeemed_at, member_id")
        .eq("member_id", member.id)
        .order("issued_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn("Unable to load promo vouchers:", error.message);
        setActiveVouchers([]);
        return;
      }
      setActiveVouchers((data || []).filter((voucher) => isVoucherAvailable(voucher)));
    }
    fetchActiveVouchers();
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-menu-item-availability")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        (payload) => {
          const nextItem = payload.new || {};
          const previousItem = payload.old || {};
          const rowId = nextItem.id || previousItem.id;
          if (!rowId) return;

          if (payload.eventType === "DELETE" || nextItem.pos_only === true) {
            setItems((prev) => prev.filter((item) => item.id !== rowId));
            setSelectedItemForModal((current) => (current?.id === rowId ? null : current));
            return;
          }

          setItems((prev) => (prev.some((item) => item.id === rowId) ? prev.map((item) => (item.id === rowId ? nextItem : item)) : [...prev, nextItem]));
          setSelectedItemForModal((current) => (current?.id === rowId && !isMenuItemMarkedAvailable(nextItem) ? null : current));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const q = itemSearch.trim().toLowerCase();
  const selectedStore = useMemo(
    () => stores.find((store) => String(store.id) === String(selectedBranch)),
    [selectedBranch, stores]
  );

  const visibleCategories = useMemo(() => {
    return cats.filter((cat) => {
      if (!selectedBranch) return true;
      const row = categoryStoreAvailability.find(
        (entry) => String(entry.category_id) === String(cat.id) && String(entry.store_id) === String(selectedBranch)
      );
      const storeAvailable = row ? row.is_available !== false : true;
      if (!storeAvailable) return false;
      if (!isPromoCategoryName(cat.name)) return true;
      return items.some(
        (item) =>
          String(item.category || "").toLowerCase() === String(cat.name || "").toLowerCase() &&
          findVoucherForMenuItem(activeVouchers, item)
      );
    });
  }, [cats, categoryStoreAvailability, selectedBranch, items, activeVouchers]);

  useEffect(() => {
    if (activeTab === "ALL") return;
    if (!visibleCategories.some((cat) => cat.name === activeTab)) setActiveTab("ALL");
  }, [activeTab, visibleCategories]);

  const filteredItems = useMemo(() => {
    return items
      .filter((i) => visibleCategories.some((cat) => cat.name === i.category))
      .filter((i) => (activeTab === "ALL" ? true : i.category === activeTab))
      .filter((i) => (!isPromoMenuItem(i) ? true : !!findVoucherForMenuItem(activeVouchers, i)))
      .filter((i) => (q ? (i.name || "").toLowerCase().includes(q) : true));
  }, [items, visibleCategories, activeTab, q, activeVouchers]);

  const isItemAvailableForSelectedStore = (item) => {
    if (!selectedBranch) return true;
    const row = itemStoreAvailability.find(
      (entry) => String(entry.item_id) === String(item.id) && String(entry.store_id) === String(selectedBranch)
    );
    return row ? row.is_available !== false : true;
  };

  const isItemOrderable = (item) =>
    isMenuItemMarkedAvailable(item) &&
    isItemAvailableForSelectedStore(item) &&
    (!isPromoMenuItem(item) || !!findVoucherForMenuItem(activeVouchers, item));

  const itemWithStoreOptionGroupAvailability = (item) => {
    if (!selectedBranch || !Array.isArray(item?.variants)) return item;
    const availabilityByGroup = new Map(
      optionGroupStoreAvailability
        .filter((entry) => String(entry.store_id) === String(selectedBranch))
        .map((entry) => [entry.group_key || optionGroupKey(entry.group_name), entry.is_available !== false])
    );
    const availabilityByOption = new Map(
      optionSelectionStoreAvailability
        .filter((entry) => String(entry.store_id) === String(selectedBranch))
        .map((entry) => [
          `${entry.group_key || optionGroupKey(entry.group_name)}::${entry.option_key || optionSelectionKey(entry.option_name)}`,
          entry.is_available !== false,
        ])
    );
    if (availabilityByGroup.size === 0 && availabilityByOption.size === 0) return item;
    return {
      ...item,
      variants: item.variants.map((group) => {
        const key = optionGroupKey(group.name || group.groupName || group.label || group.id);
        const groupAvailable = availabilityByGroup.has(key) ? availabilityByGroup.get(key) : null;
        const options = Array.isArray(group.options)
          ? group.options.map((option) => {
              const optionKey = optionSelectionKey(option.name || option.label || option.id || option.value);
              const mapKey = `${key}::${optionKey}`;
              if (!availabilityByOption.has(mapKey)) return option;
              const isAvailable = availabilityByOption.get(mapKey);
              return { ...option, isAvailable, is_available: isAvailable };
            })
          : group.options;
        if (groupAvailable === null) return { ...group, options };
        return { ...group, isAvailable: groupAvailable, is_available: groupAvailable, options };
      }),
    };
  };

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + customerLineNet(line), 0), [cart]);
  const loyaltyEligibleSubtotal = useMemo(
    () => cart.reduce((sum, line) => sum + loyaltyEligibleLineTotal(line, customerLineNet(line)), 0),
    [cart]
  );
  const itemCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);

  const onAddToCart = (line) => {
    setCart((prev) => {
      const editIndex = selectedItemForModal?.editIndex;
      if (editIndex !== undefined && editIndex !== null) {
        const updated = [...prev];
        updated[editIndex] = line;
        return updated;
      }
      return [...prev, line];
    });
    setSelectedItemForModal(null);
  };

  const removeLine = (cartItemId) => setCart((prev) => prev.filter((x) => x.cartItemId !== cartItemId));
  const changeQty = (cartItemId, delta) => {
    setCart((prev) =>
      prev.map((x) => (x.cartItemId === cartItemId ? { ...x, quantity: Math.max(1, x.quantity + delta) } : x))
    );
  };
  const clearCart = () => {
    setCart([]);
    setConfirmClear(false);
    setCartOpen(false);
  };

  const handleOpenCheckoutValidation = () => {
    if (!user?.id) return alert("❌ Session expired: Sign in to submit orders.");
    if (cart.length === 0) return alert("❌ Basket selection empty.");
    if (!selectedBranch) return alert("Please select a store before sending your order.");
    setConfirmationOpen(true);
  };

  const executeOrderSubmission = async (fulfillmentMetadata) => {
    setIsSubmitting(true);

    let paymentProofUrl = "";
    if (fulfillmentMetadata.paymentProof) {
      const ext = fulfillmentMetadata.paymentProof.name?.split(".").pop() || "jpg";
      const filePath = `${user.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(filePath, fulfillmentMetadata.paymentProof, { upsert: false });
      if (uploadError) {
        setIsSubmitting(false);
        alert(`Payment screenshot upload failed: ${uploadError.message}`);
        return;
      }
      const { data: publicUrl } = supabase.storage.from("payment-proofs").getPublicUrl(filePath);
      paymentProofUrl = publicUrl?.publicUrl || "";
    }

    const orderStatus = fulfillmentMetadata.isScheduled ? "scheduled" : "pending";
    const deliveryFee = fulfillmentMetadata.diningOption === "DELIVERY" ? Number(fulfillmentMetadata.deliveryFee || 0) : 0;
    const orderTotal = Number(subtotal) + deliveryFee;
    const orderPayload = {
      user_id: user.id,
      customer_name: member?.customer_name || user?.user_metadata?.full_name || "Web Customer",
      branch_id: selectedBranch,
      store_id: selectedBranch,
      order_source: "web",
      order_status: orderStatus,
      items: cart, 
      subtotal: Number(subtotal),
      total: orderTotal,
      status: orderStatus, 
      dining_option: webDiningOptionLabel(fulfillmentMetadata.diningOption),
      fulfillment_type: fulfillmentMetadata.diningOption,
      fulfillment_time: `${fulfillmentMetadata.fulfillmentDate} ${fulfillmentMetadata.fulfillmentTime}`,
      scheduled_for: fulfillmentMetadata.scheduledFor,
      schedule_label: fulfillmentMetadata.scheduleLabel,
      delivery_address: fulfillmentMetadata.deliveryAddress || "",
      delivery_latitude: fulfillmentMetadata.deliveryPin?.lat ? Number(fulfillmentMetadata.deliveryPin.lat) : null,
      delivery_longitude: fulfillmentMetadata.deliveryPin?.lng ? Number(fulfillmentMetadata.deliveryPin.lng) : null,
      delivery_provider: fulfillmentMetadata.diningOption === "DELIVERY" ? "lalamove" : "",
      delivery_status: fulfillmentMetadata.diningOption === "DELIVERY" ? "quoted" : "",
      delivery_service_level: fulfillmentMetadata.diningOption === "DELIVERY" ? fulfillmentMetadata.deliveryServiceLevel || "regular" : "regular",
      delivery_priority_fee: fulfillmentMetadata.diningOption === "DELIVERY" ? Number(fulfillmentMetadata.deliveryQuote?.priorityFee || 0) : 0,
      delivery_fee: deliveryFee || null,
      delivery_currency: fulfillmentMetadata.deliveryQuote?.currency || "PHP",
      delivery_quote_id: fulfillmentMetadata.deliveryQuote?.quoteId || "",
      delivery_distance_meters: fulfillmentMetadata.deliveryQuote?.distanceMeters || null,
      delivery_quoted_at: fulfillmentMetadata.diningOption === "DELIVERY" ? new Date().toISOString() : null,
      customer_contact: member?.Phone || member?.phone || "",
      payment_method: fulfillmentMetadata.diningOption === "DINEIN" ? "" : fulfillmentMetadata.paymentMethod,
      payment_status: fulfillmentMetadata.paymentMethod === "QRPH" ? "submitted" : "pending",
      payment_proof_url: paymentProofUrl,
      payment_review_note: fulfillmentMetadata.paymentMethod === "QRPH" ? "Cashier must verify screenshot amount against order total." : "",
    };

    try {
      const { data, error } = await supabase
        .from("web_orders")
        .insert([orderPayload])
        .select();

      if (error) throw error;
      const freshWebOrderRow = data[0];

      const alertBroadcastChannelInstance = supabase.channel(`store-alerts:${selectedBranch}`);
      alertBroadcastChannelInstance.subscribe((status, err) => {
        if (!err && status === "SUBSCRIBED") {
          alertBroadcastChannelInstance.send({
            type: "broadcast",
            event: "NEW_CUSTOMER_ORDER",
            payload: {
              ...freshWebOrderRow,
              order_id: freshWebOrderRow.id,
              store_id: freshWebOrderRow.store_id,
              customer_name: freshWebOrderRow.customer_name,
              subtotal: freshWebOrderRow.subtotal,
              item_count: itemCount,
              dining_option: freshWebOrderRow.dining_option,
              fulfillment_time: freshWebOrderRow.fulfillment_time,
              scheduled_for: freshWebOrderRow.scheduled_for,
              schedule_label: freshWebOrderRow.schedule_label,
              timestamp: new Date().toISOString()
            }
          }).then(() => {
            supabase.removeChannel(alertBroadcastChannelInstance);
          });
        }
      });

      fetch("/api/web-order-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: { ...freshWebOrderRow, items: cart },
          storeName: selectedStore?.name || selectedBranch,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const details = await res.json().catch(() => ({}));
            console.warn("Web order email notification failed:", details?.error || details?.publicError || res.status);
          }
        })
        .catch((emailError) => {
          console.warn("Web order email notification failed:", emailError);
        });

      alert(`🎉 Order sent to POS! Method: ${fulfillmentMetadata.diningOption} @ ${fulfillmentMetadata.fulfillmentTime}\nEstimated loyalty points: +${loyaltyPoints(loyaltyEligibleSubtotal).toFixed(2)} upon payment collection.`);
      setCart([]);
      setConfirmationOpen(false);
      setCartOpen(false);
      if (onCheckoutSuccess) onCheckoutSuccess();
    } catch (err) {
      console.error("Critical submission failure loop trace:", err);
      alert(`❌ Submission Error: ${err.message || "Network Connection Failure"}`);
    } finally {
      setConfirmationOpen(false);
      setIsSubmitting(false);
    }
  };

  const CartInnerListing = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="flex-1 space-y-3 overflow-y-auto max-h-[45vh] lg:max-h-[60vh] pr-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <span className="text-3xl mb-2">🛒</span>
            <p className="text-sm font-semibold">Your cart is empty</p>
          </div>
        ) : (
          cart.map((line, idx) => (
            <div
              key={line.cartItemId || idx}
              onClick={() => {
                const base = items.find((i) => i.id === line.id) || {};
                setSelectedItemForModal({ ...base, _promoVoucher: line.appliedVoucher || findVoucherForMenuItem(activeVouchers, base), editData: line, editIndex: idx });
              }}
              className="w-full text-left border border-slate-200 bg-white rounded-xl p-3 hover:border-rose-200 transition cursor-pointer flex flex-col justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex justify-between items-start gap-3">
                  <p className="min-w-0 flex-1 whitespace-normal break-words text-sm font-bold leading-snug text-slate-800">{line.name}</p>
                  <p className="shrink-0 text-right text-sm font-bold text-slate-800">{peso0(customerLineNet(line))}</p>
                </div>
                {line.variantDetails && <p className="text-xs text-slate-400 mt-0.5 italic">{line.variantDetails}</p>}
                {line.instructions && <p className="text-xs text-[#FC687D] font-medium mt-1">Note: {line.instructions}</p>}
                {line.appliedVoucher && (
                  <p className="mt-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                    Voucher: {line.appliedVoucher.code} • {voucherRewardText(line.appliedVoucher)}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-1 mt-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeLine(line.cartItemId); }}
                  className="text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-400/80 bg-red-300/80 px-1 py-1 rounded-lg"
                >
                  Remove
                </button>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => changeQty(line.cartItemId, -1)}
                    className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600"
                  >
                    −
                  </button>
                  <span className="text-xs font-bold text-slate-800 px-1">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.cartItemId, 1)}
                    className="w-5 h-5 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-600"
                  >
                     +
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {cart.length > 0 && (
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-4">
          <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1.5">
            Selected Store Branch
          </label>
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-semibold text-slate-700">
            {selectedStore?.name || "Selected branch"}
          </div>

          <div className="space-y-2 mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Subtotal Amount</span>
              <span className="font-bold text-slate-800 text-lg">{peso0(subtotal)}</span>
            </div>
            <button
              onClick={handleOpenCheckoutValidation}
              className="w-full h-11 rounded-xl bg-blue-300/80 text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-blue-400/80 transition"
            >
            {isSubmitting ? "Sending..." : "Place Order"}
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition"
            >
              Reset Basket
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
      <div className="space-y-5">
        <div className="bg-white border border-rose-50 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>            
            <h2 className="text-lg font-bold text-slate-800">Order Menu</h2>
            <p className="mt-1 text-[11px] text-cyan-700">{selectedStore?.name ? `Showing items for ${selectedStore.name}` : "Select a store to view available items"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setCart([]);
                setCartOpen(false);
              }}
              className="bg-slate-50 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 outline-none border border-cyan-100 pointer-events-auto cursor-pointer"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="bg-slate-50 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 outline-none border border-slate-200 pointer-events-auto cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {visibleCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <div className="relative flex-1 sm:flex-initial">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-slate-800 outline-none border border-slate-200 w-full sm:w-[150px]"
              />
            </div>
          </div>
        </div>

        {availabilityNotice ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900">
            {availabilityNotice}
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-100">
            ❌ No matching available products located.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-3">
            {filteredItems.map((item) => {
              const orderable = isItemOrderable(item);

              return (
              <button
                key={item.id}
                type="button"
                disabled={!orderable}
                onClick={() => {
                  if (!orderable) return;
                  const storeItem = itemWithStoreOptionGroupAvailability(item);
                  setSelectedItemForModal({ ...storeItem, _promoVoucher: findVoucherForMenuItem(activeVouchers, item) });
                }}
                className={`group relative flex h-full min-h-[230px] flex-col items-center justify-between rounded-[100px] border p-3 text-center shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all duration-300 ${
                  orderable
                    ? "border-cyan-100 bg-white/88 hover:-translate-y-1 hover:border-cyan-300 hover:bg-cyan-50/80 hover:shadow-[0_24px_60px_rgba(8,145,178,0.14)]"
                    : "cursor-not-allowed border-slate-200 bg-slate-100/85 opacity-75 grayscale"
                }`}
              >
                {!orderable && (
                  <span className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-slate-800 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-white shadow-sm">
                    Unavailable
                  </span>
                )}
                <div className="flex w-full flex-1 flex-col items-center text-center">
                  <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-cyan-100 bg-white">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl text-rose-200/40">📷</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-1 flex-col items-center text-center">
                    <span className="max-w-full truncate rounded-md bg-cyan-50 px-2 py-0.5 text-center text-[9px] font-normal uppercase tracking-wider text-cyan-700">
                      {item.category || "General"}
                    </span>
                    <p className="mt-1.5 text-center text-sm font-normal leading-tight text-slate-800">
                      {item.name}
                    </p>
                  </div>
                </div>
                <p className="mt-1 w-full border-t border-cyan-50 pt-2 text-center text-[18px] font-semibold text-slate-950">
                  {peso0(item.price)}
                </p>
                {hasMenuOptions(item) && (
                  <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Tap for options
                  </p>
                )}
              </button>
              );
            })}
          </div>
        )}
      </div>

      <aside className="hidden lg:block bg-white border border-rose-50 rounded-2xl p-5 shadow-sm sticky top-6 h-[calc(100vh-140px)]">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <span>🛒</span> Order Basket
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{itemCount} items configured</p>
        </div>
        <div className="h-[calc(100%-70px)]">
          <CartInnerListing />
        </div>
      </aside>

      {cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-[88px] left-4 right-4 z-40 bg-rose-950 text-white flex items-center justify-between px-5 py-4 rounded-xl shadow-xl lg:hidden"
        >
          <div className="text-left">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Current Order</p>
            <p className="text-sm font-bold">{itemCount} Selected Item(s)</p>
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-base font-extrabold text-[#FC687D]">{peso0(subtotal)}</span>
            <span className="text-xs bg-white/10 px-2.5 py-1 rounded-lg">View 🛒</span>
          </div>
        </button>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 lg:hidden"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-[24px] md:rounded-[20px] p-5 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Your Basket</h3>
                <p className="text-xs text-slate-400">{itemCount} items</p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <CartInnerListing />
            </div>
          </div>
        </div>
      )}

      {selectedItemForModal && (
        <AddToCartModal
          item={selectedItemForModal}
          onClose={() => setSelectedItemForModal(null)}
          onAdd={onAddToCart}
        />
      )}

      {confirmClear && (
        <ConfirmModal
          title="Reset Shopping Basket?"
          message="Are you certain you wish to discard items?"
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearCart}
        />
      )}

      <OrderConfirmationModal
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={executeOrderSubmission}
        subtotal={subtotal}
        loyaltyEligibleSubtotal={loyaltyEligibleSubtotal}
        cartItems={cart}
        isSubmitting={isSubmitting}
        selectedStore={selectedStore}
        selectedStoreName={selectedStore?.name}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    NEW DETACHED TAB MODULE: Tracker / Order Pipeline History 📦
────────────────────────────────────────────────────────────── */
function TrackerTab({ orders, loadingOrders }) {
  const getStatusColor = (status) => {
    switch (String(status).toLowerCase()) {
      case "pending": return "bg-amber-50 border-amber-200 text-amber-700";
      case "accepted": return "bg-emerald-50 border-emerald-200 text-emerald-700";
      case "ready": return "bg-sky-50 border-sky-200 text-sky-700";
      case "completed": return "bg-slate-100 border-slate-200 text-slate-600";
      case "rejected": return "bg-rose-50 border-rose-200 text-rose-700";
      default: return "bg-slate-50 border-slate-200 text-slate-600";
    }
  };

  const isDeliveryOrder = (order) =>
    String(order?.fulfillment_type || "").toUpperCase() === "DELIVERY" ||
    String(order?.dining_option || "").toLowerCase().includes("delivery");

  const deliveryStatusLabel = (status) => {
    const normalized = String(status || "").replace(/[_-]+/g, " ").trim();
    return normalized ? normalized.toUpperCase() : "WAITING FOR RIDER BOOKING";
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-100 p-5 shadow-sm animate-in fade-in duration-300">
      <div className="border-b border-slate-100 pb-3 mb-5">
        <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
          <span>📦</span> Live Order & Order History
        </h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Track your live orders and view points earned at Juja Brew & Bites.</p>
      </div>

      {loadingOrders ? (
        <div className="py-16 text-center flex justify-center">
          <div className="w-8 h-8 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 px-4 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <span className="text-3xl block mb-2">🍽️</span>
          <p className="text-sm font-semibold">No recent order records located.</p>
          <p className="text-xs text-slate-400 mt-1">Your orders will automatically appear here once submitted.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3 transition hover:border-rose-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800 font-mono">ORDER ID: #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{order.created_at ? formatDateTime(order.created_at) : ""}</p>
                </div>
                <span className={`px-2.5 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider ${getStatusColor(order.status)}`}>
                  {order.status || "Pending"}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                {Array.isArray(order.items) && order.items.map((line, idx) => (
                  <div key={line.cartItemId || idx} className="flex justify-between items-baseline font-medium">
                    <span className="truncate max-w-[80%] text-slate-700">{line.name} <span className="text-[#FC687D] font-bold">x{line.quantity}</span></span>
                    <span className="font-mono text-[11px]">{peso0(line.unitPrice * line.quantity)}</span>
                  </div>
                ))}
              </div>

              {isDeliveryOrder(order) && (
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/80 p-3 text-xs text-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-cyan-800">Delivery Tracking</p>
                      <p className="mt-1 font-bold text-slate-800">{deliveryStatusLabel(order.delivery_status)}</p>
                      {order.delivery_fee ? (
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">Delivery fee: {peso2(order.delivery_fee)}</p>
                      ) : null}
                    </div>
                    {(order.delivery_tracking_link || order.delivery_share_link) && (
                      <a
                        href={order.delivery_tracking_link || order.delivery_share_link}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-800 shadow-sm"
                      >
                        Track Rider
                      </a>
                    )}
                  </div>
                  {order.delivery_last_error ? (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">
                      {order.delivery_last_error}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pt-1">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-wide font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700 text-[10px]">{order.dining_option || "Takeout"}</span>
                  {(String(order.status).toLowerCase() === "accepted" || String(order.status).toLowerCase() === "completed") && (
                    <span className="text-emerald-700 font-black bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[10px]">
                      ⭐ +{loyaltyPoints(order.subtotal).toFixed(2)} pts Earned
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-800">Total Charged: {peso2(order.total || order.subtotal)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Loyalty Tab
────────────────────────────────────────────────────────────── */
function LoyaltyPerksPanel({ compact = false }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/78 shadow-[0_22px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="border-b border-cyan-100/70 bg-slate-600/90 px-5 py-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">Loyalty Program</p>
        <p className="mt-1 text-lg font-semibold ">JUJA Rewards Perks</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">
          Earn, redeem, and enjoy member-only rewards every time you visit.
        </p>
      </div>

      <div className="space-y-4 p-4 md:p-5">
        <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
          {loyaltyPerkSections.map((section) => (
            <section
              key={section.label}
              className="rounded-2xl border border-cyan-100/70 bg-white/82 p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/70 hover:bg-cyan-50/55"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200/70 bg-cyan-50 text-[10px] font-semibold tracking-wide text-cyan-700">
                  {section.accent}
                </span>
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-800">{section.label}</h4>
              </div>
              <ul className="space-y-2 text-xs leading-relaxed text-slate-600 md:text-[13px]">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-cyan-100/70 bg-white/82 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-800">Flavor Selection</h4>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
              Reward Choices
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {loyaltyFlavorSelections.map((group) => (
              <div key={group.label} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <span key={item} className="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[11px] text-slate-600 shadow-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Terms & Conditions</h4>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-700 md:text-[13px]">
            {loyaltyTerms.map((term) => (
              <li key={term} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{term}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LoyaltyTab({ member, setMember, user }) {
  const [mode, setMode] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState({ first_name: "", last_name: "", customer_name: "", Phone: "", City: "", Note: "" });

  const [vouchersActive, setVouchersActive] = useState([]);
  const [vouchersRedeemed, setVouchersRedeemed] = useState([]);
  const [vouchersExpired, setVouchersExpired] = useState([]);
  const [voucherView, setVoucherView] = useState("active");
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  const [nowTick, setNowTick] = useState(Date.now());

  const [checkingMatch, setCheckingMatch] = useState(false);
  const [matchChecked, setMatchChecked] = useState(false);
  const [matchedPreview, setMatchedPreview] = useState(null);
  const [sendingLinkRequest, setSendingLinkRequest] = useState(false);
  const [linkRequestSent, setLinkRequestSent] = useState(false);
  const [showPerksModal, setShowPerksModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ customer_name: "", Phone: "" });

  const available = Number(member?.["Available points"] || 0);
  const progress = ((available % 100) / 100) * 100;
  const nextReward = (Math.floor(available / 100) + 1) * 100;

  useEffect(() => {
    setDetailsForm({
      customer_name: member?.customer_name || "",
      Phone: member?.Phone || member?.phone || "",
    });
  }, [member?.customer_name, member?.Phone, member?.phone]);

  useEffect(() => {
    const d = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(d);
  }, []);

  const isBirthdayVoucher = (v) => {
    const rt = String(v?.reward_text || "").toLowerCase();
    const code = String(v?.code || "").toUpperCase();
    if (v?.reward_type) return v.reward_type === "birthday";
    return rt.includes("birthday") || code.startsWith("BDAY");
  };

  const isPointsVoucher = (v) => {
    const rt = String(v?.reward_text || "").toLowerCase();
    const code = String(v?.code || "").toUpperCase();
    return v?.reward_type === "points" || code.startsWith("PTS") || rt.includes("100 points");
  };

  const isUsablePointsVoucher = (v) => {
    if (!isPointsVoucher(v)) return false;
    const status = String(v?.status || "").toLowerCase();
    const expMs = v?.expires_at ? new Date(v.expires_at).getTime() : 0;
    if (status === "redeemed" || v?.redeemed_at) return false;
    if (status === "expired") return false;
    if (expMs && expMs <= Date.now()) return false;
    return true;
  };

  useEffect(() => {
    async function createBirthdayVoucherIfNeeded() {
      if (!member?.id || !member?.Note) return;
      const today = new Date();
      const todayStr = today.toISOString().slice(5, 10); 
      const birth = member.Note; 
      const [, mon, day] = birth.split("-");
      const monthIndex = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mon);
      if (monthIndex === -1) return;

      const bdayFormatted = `${String(monthIndex + 1).padStart(2, "0")}-${day}`;
      if (bdayFormatted !== todayStr) return;

      const year = today.getFullYear();
      const { data: existing } = await supabase.from("vouchers").select("id").eq("member_id", member.id);
      const alreadyHas = (existing || []).some(v => v.code?.startsWith(`BDAY${year}`));
      if (alreadyHas) return;

      await supabase.from("vouchers").insert({
        member_id: member.id,
        code: `BDAY${year}-${Math.floor(Math.random()*10000)}`,
        reward_text: "FREE 16oz Drink or Waffle (Birthday Reward)",
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), 
        status: "active",
        reward_type: "birthday",
      });
    }
    createBirthdayVoucherIfNeeded();
  }, [member]);

  useEffect(() => {
    async function createPointsVouchersIfNeeded() {
      if (!member?.id) return;
      if (!member?.user_id || String(member.user_id) !== String(user?.id)) return;
      const activeMember = applyAnnualPointResetToMember(member);
      const availablePoints = Number(activeMember?.["Available points"] || 0);
      if (availablePoints < 100) return;

      const { error } = await supabase.rpc("ensure_vouchers_for_member", { p_member_id: member.id });
      if (error) return;
      const { data: refreshedMember } = await supabase
        .from("loyalty_members")
        .select("*")
        .eq("id", member.id)
        .maybeSingle();
      if (refreshedMember?.id) setMember(applyAnnualPointResetToMember(refreshedMember));
      setNowTick(Date.now());
    }

    createPointsVouchersIfNeeded();
  }, [member?.id, member?.user_id, user?.id, member?.["Points balance"], member?.["Available points"]]);

  const computeStatus = (v) => {
    if (!v) return "active";
    if (String(v.status).toLowerCase() === "redeemed") return "redeemed";
    if (String(v.status).toLowerCase() === "expired") return "expired";
    if (String(v.status).toLowerCase() === "active") {
      const expMs = v.expires_at ? new Date(v.expires_at).getTime() : 0;
      if (expMs && expMs <= nowTick) return "expired";
      return "active";
    }
    return "active";
  };

  const manilaDateKey = (d) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  const expiryCountdownDetailed = (expires_at) => {
    if (!expires_at) return { text: "—", expiresTonight: false };
    const exp = new Date(expires_at);
    const ms = exp.getTime() - nowTick;
    if (ms <= 0) return { text: "Expired", expiresTonight: false };
    const days = Math.floor(ms / 86400000);
    const hrs = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return {
      text: days > 0 ? `Expires in ${days}d ${hrs}h` : `Expires in ${hrs}h ${mins}m`,
      expiresTonight: manilaDateKey(new Date()) === manilaDateKey(exp),
    };
  };

  useEffect(() => {
    async function fetchVouchers() {
      if (!member?.id) return;
      setLoadingVouchers(true);
      const { data } = await supabase.from("vouchers").select("*").eq("member_id", member.id).order("issued_at", { ascending: false });
      const rows = data || [];
      
      const normalized = rows.map((v) => ({ ...v, _computedStatus: computeStatus(v), _isBirthday: isBirthdayVoucher(v) }));
      setVouchersActive(normalized.filter(v => v._computedStatus === "active"));
      setVouchersRedeemed(normalized.filter(v => v._computedStatus === "redeemed"));
      setVouchersExpired(normalized.filter(v => v._computedStatus === "expired"));
      setLoadingVouchers(false);
    }
    fetchVouchers();
  }, [member?.id, nowTick]);

  const createMember = async () => {
    if (!user?.id) return;
    const b = normalizeBirthday(form.Note);
    if (!b.ok) { setNotice("⚠️ " + b.msg); return; }
    const firstName = String(form.first_name || "").trim();
    const lastName = String(form.last_name || "").trim();
    const fullName = [firstName, lastName].join(" ");
    if (!firstName || !lastName || !form.City || !form.Phone) { setNotice("⚠️ Please complete all fields."); return; }
    
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const response = await fetch("/api/customer/loyalty-member-register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          customer_name: fullName,
          Email: user.email,
          Phone: form.Phone,
          City: form.City,
          Note: b.value,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.duplicateMatch && payload?.existingMember) {
          setMatchedPreview(payload.existingMember);
          setMatchChecked(true);
          setNotice("A registered loyalty account already exists with this contact number and birthday. You can request to link that account instead.");
          setLoading(false);
          return;
        }
        throw new Error(payload?.error || "Unable to register loyalty member.");
      }
      setMember(payload?.member);
      setMode(null);
    } catch (err) { setNotice("❌ " + err.message); }
    setLoading(false);
  };

  const saveMemberDetails = async () => {
    if (!member?.id) return;
    const nextName = detailsForm.customer_name.trim();
    const nextPhone = detailsForm.Phone.trim();
    if (!nextName || !nextPhone) {
      setNotice("⚠️ Name and contact number are required.");
      return;
    }
    setSavingDetails(true);
    try {
      const { data, error } = await supabase
        .from("loyalty_members")
        .update({ customer_name: nextName, Phone: nextPhone })
        .eq("id", member.id)
        .select()
        .single();
      if (error) throw error;
      setMember(data);
      setEditingDetails(false);
      setNotice("");
    } catch (err) {
      setNotice("❌ " + (err?.message || "Unable to update membership details."));
    } finally {
      setSavingDetails(false);
    }
  };

  const checkMatchPreview = async () => {
    const b = normalizeBirthday(form.Note);
    if (!b.ok) { setNotice("⚠️ " + b.msg); return; }
    const firstName = String(form.first_name || "").trim();
    const lastName = String(form.last_name || "").trim();
    const fullName = [firstName, lastName].join(" ");
    if (!firstName || !lastName) { setNotice("⚠️ Please enter your first and last name."); return; }
    setNotice("");
    setCheckingMatch(true);
    const typedName = normalizeLoyaltyName(fullName);
    const { data, error } = await supabase.from("loyalty_members").select("*").eq("Note", b.value).limit(50);
    if (error) {
      setNotice("Unable to check loyalty records. Please send a manual link request.");
      setMatchedPreview(null);
      setMatchChecked(true);
      setCheckingMatch(false);
      return;
    }
    const rows = data || [];
    const exact = rows.find((row) => normalizeLoyaltyName(row.customer_name || row["customer_name"] || "") === typedName);
    const contains = rows.find((row) => {
      const savedName = normalizeLoyaltyName(row.customer_name || row["customer_name"] || "");
      return savedName && typedName && (savedName.includes(typedName) || typedName.includes(savedName));
    });
    setMatchedPreview(exact || contains || null);
    setMatchChecked(true);
    setCheckingMatch(false);
  };

  const requestLink = async () => {
    const b = normalizeBirthday(form.Note);
    const firstName = String(form.first_name || "").trim();
    const lastName = String(form.last_name || "").trim();
    const fullName = [firstName, lastName].join(" ");
    if (!firstName || !lastName) { setNotice("Please enter your first and last name."); return; }
    setSendingLinkRequest(true);
    setNotice("");
    if (!b.ok) {
      setNotice("Please select a valid birthday.");
      setSendingLinkRequest(false);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch("/api/loyalty-link-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          customerName: fullName,
          birthday: b.value,
          matchedMemberId: matchedPreview?.id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Unable to send link request.");

      setLinkRequestSent(true);
      if (json.emailSent) {
        setNotice("Request saved and email notification sent.");
      } else {
        setNotice("Request saved for admin review.");
      }
      alert("Authorization sync request logged effectively.");
    } catch (error) {
      setNotice(error?.message || "Unable to send link request. Please try again.");
    } finally {
      setSendingLinkRequest(false);
    }
  };
  if (!member && !mode) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-6 animate-in fade-in duration-300">
        <div className="bg-gradient-to-br from-[#FFF9FA] to-rose-50 border border-rose-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">⭐ Juja Rewards Program</h2>
          <p className="text-sm text-slate-600 mt-1">Earn points and enjoy exclusive rewards every time you grab bites or brews.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">🎯</span>
              <p className="text-xs font-bold text-slate-700">100 Points Voucher</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Created automatically at every 100 points and valid for 90 days.</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">🎂</span>
              <p className="text-xs font-bold text-slate-700">Birthday Perk</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Complementary reward allocated automatically during birthdates.</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-100/60">
              <span className="text-xl block mb-1">⚡</span>
              <p className="text-xs font-bold text-slate-700">Fast Accumulation</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Acquire 1 point per ₱25 currency allocation dynamically.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => setMode("new")} className="flex-1 h-12 bg-[#FC687D] text-white font-bold text-sm rounded-xl shadow-sm hover:bg-rose-500 transition">Sign Up Program</button>
          <button onClick={() => setMode("existing")} className="flex-1 h-12 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-50 transition">Link Existing Loyalty Card</button>
        </div>
      </div>
    );
  }

  if (!member && (mode === "new" || mode === "existing")) {
    return (
      <div className="max-w-md mx-auto bg-white p-6 border border-slate-100 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wide">{mode === "new" ? "Create Membership Account" : "Verify Profile Identity"}</h3>
        {notice && <p className="text-xs font-semibold text-rose-500 bg-rose-50 p-2.5 rounded-lg">{notice}</p>}
        <div className="space-y-3">
          <input
            placeholder="First Name"
            value={form.first_name}
            onChange={(e)=>{
              setForm({...form, first_name: e.target.value});
              setNotice("");
              setLinkRequestSent(false);
              setMatchChecked(false);
            }}
            className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none"
          />
          <input
            placeholder="Last Name"
            value={form.last_name}
            onChange={(e)=>{
              setForm({...form, last_name: e.target.value});
              setNotice("");
              setLinkRequestSent(false);
              setMatchChecked(false);
            }}
            className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none"
          />
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Birthday
            </label>
            <input
              type="date"
              max={todayISO()}
              value={birthdayToDateInput(form.Note)}
              onChange={(e)=>{
                setForm({...form, Note: dateInputToBirthday(e.target.value)});
                setNotice("");
                setLinkRequestSent(false);
                setMatchChecked(false);
              }}
              className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none"
            />
            <p className="text-[10px] text-slate-400">
              Select the same birthday registered on your loyalty card.
            </p>
          </div>
          {mode === "new" && (
            <>
              <input placeholder="City Location" value={form.City} onChange={(e)=>{
                setForm({...form, City: e.target.value});
                setNotice("");
                setLinkRequestSent(false);
                setMatchChecked(false);
              }} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none" />
              <input placeholder="Mobile Contact Number" value={form.Phone} onChange={(e)=>{
                setForm({...form, Phone: e.target.value});
                setNotice("");
                setLinkRequestSent(false);
                setMatchChecked(false);
              }} className="w-full border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none" />
            </>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={()=>setMode(null)} className="flex-1 py-3 bg-slate-50 border border-slate-100 text-slate-600 font-bold rounded-xl text-xs uppercase tracking-wider">Back</button>
          {mode === "new" ? (
            <button onClick={createMember} disabled={loading} className="flex-1 py-3 bg-[#FC687D] text-white font-bold rounded-xl text-xs uppercase tracking-wider">{loading ? "Saving..." : "Register Card"}</button>
          ) : (
            <button
              onClick={checkMatchPreview}
              disabled={checkingMatch}
              className="flex-1 py-3 bg-slate-800 !text-white font-bold rounded-xl text-xs uppercase tracking-wider disabled:bg-slate-300 disabled:!text-slate-700"
            >
              {checkingMatch ? "Checking..." : "Check System Match"}
            </button>
          )}
        </div>
        {matchChecked && (mode === "existing" || (mode === "new" && matchedPreview)) && (
          <div className="border border-slate-100 bg-slate-50 p-4 rounded-xl mt-2 text-center text-xs">
            {linkRequestSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <p className="font-bold">Link request sent.</p>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Admin will review your full name and birthday, then link your loyalty account.
                </p>
              </div>
            ) : matchedPreview ? (
              <div>
                {mode === "new" && (
                  <p className="mb-1 text-green-700 font-bold">
                    Registered loyalty account found with this contact number and birthday.
                  </p>
                )}
                {matchedPreview?.customer_code && (
                  <p className="mb-1 text-[11px] text-slate-500">{matchedPreview.customer_code}</p>
                )}
                <p className="text-green-600 font-bold">Profile identified matching criteria. ✅</p>
                <button
                  onClick={requestLink}
                  disabled={sendingLinkRequest}
                  className="mt-3 w-full py-2 bg-[#FC687D] text-white rounded-lg font-bold disabled:opacity-60"
                >
                  {sendingLinkRequest ? "Sending..." : "Submit Sync Authorization Link"}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-red-500 font-semibold">No pre-existing dynamic customer references located matching metrics.</p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  You can still send your full name and birthday to request manual account linking.
                </p>
                <button
                  onClick={requestLink}
                  disabled={sendingLinkRequest}
                  className="mt-3 w-full py-2 bg-[#FC687D] text-white rounded-lg font-bold disabled:opacity-60"
                >
                  {sendingLinkRequest ? "Sending..." : "Send Manual Link Request"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
      <div className="md:col-span-1 space-y-4">
        <div
          className="rounded-2xl p-5 text-white relative overflow-hidden shadow-md bg-rose-950 bg-cover bg-center bg-no-repeat aspect-[1.7/1]"
          style={{ backgroundImage: "url('/images/loyalty-card-bg.jpg')" }}
        >
          <div className="relative z-10 flex flex-col justify-between h-full min-h-[150px]">
            
            <div className="bg-white p-2 rounded-lg inline-block self-start shadow-md border border-slate-100 mt-auto">
              <Barcode value={member?.customer_code || "JUJA000000"} background="transparent" lineColor="#032a85" width={1.2} height={50} displayValue fontSize={11} margin={0} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm grid grid-cols-3 md:grid-cols-1 gap-2">
          <div className="p-2 bg-rose-50/40 border border-rose-100/50 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Balance</span>
            <span className="text-lg font-extrabold text-[#FC687D] block">{available.toFixed(2)} pts</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Total Points</span>
            <span className="text-sm font-bold text-slate-700 block">{Number(member?.["Points Balance"] ?? member?.["Points balance"] ?? 0).toFixed(2)}</span>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg text-center md:text-left md:flex md:justify-between md:items-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block md:inline">Visit</span>
            <span className="text-xs font-bold text-slate-700 block truncate max-w-[80px] md:max-w-none">{member?.["Total visits"] || "—"}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowPerksModal(true)}
            className="h-11 rounded-xl border border-cyan-100 bg-cyan-50 text-xs font-bold uppercase tracking-wider text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-100"
          >
            Perks
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingDetails(false);
              setShowDetailsModal(true);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
          >
            Details
          </button>
        </div>
      </div>

      <div className="md:col-span-2 space-y-6">
        <div className="bg-white border border-rose-50 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Reward Progress Milestone</h3>
            <span className="text-xs font-bold text-slate-400">{available.toFixed(2)} / {nextReward.toFixed(2)} pts</span>
          </div>
          <div className="w-full h-3 bg-slate-100 border border-slate-200/60 rounded-full overflow-hidden">
            <div className="h-full bg-[#FC687D] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs font-medium text-slate-500 mt-2.5">🎁 Only {Math.max(nextReward - available, 0).toFixed(2)} additional points required to qualify for subsequent product voucher allocation metrics.</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-slate-800 text-sm">System Voucher Passports</h3>
            <div className="flex gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-xl self-start sm:self-auto">
              {["active", "redeemed", "expired"].map((categoryKey) => (
                <button
                  key={categoryKey}
                  onClick={() => setVoucherView(categoryKey)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    voucherView === categoryKey ? "bg-white text-slate-800 shadow-sm border border-slate-200/40" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {categoryKey}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const currentArraySource = voucherView === "active" ? vouchersActive : voucherView === "redeemed" ? vouchersRedeemed : vouchersExpired;
            if (loadingVouchers) {
              return <div className="text-center py-8 text-xs text-slate-400">Loading values...</div>;
            }
            if (currentArraySource.length === 0) {
              return <div className="text-center py-8 text-slate-400 text-xs font-medium">No vouchers allocated inside this ledger.</div>;
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentArraySource.map((v) => {
                  const countdownObj = voucherView === "active" ? expiryCountdownDetailed(v.expires_at) : null;
                  return (
                    <div key={v.id} className={`border p-3.5 rounded-xl flex flex-col justify-between ${v._isBirthday ? "bg-rose-50/30 border-rose-100" : "bg-white border-slate-200/70"}`}>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">{v._isBirthday ? "🎂 Birthday Special" : "🎁 Points Reward"}</span>
                          {countdownObj?.expiresTonight && <span className="bg-amber-50 text-amber-700 text-[9px] font-extrabold uppercase border border-amber-200 px-1.5 rounded">Expiring</span>}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">{voucherRewardText(v)}</p>
                      </div>
                      <div className="border-t border-slate-50 pt-2.5 mt-3 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Code: {v.code}</span>
                        <span className="font-sans font-bold text-slate-500">{voucherView === "active" ? "Exp: " + fmtDate(v.expires_at) : voucherView === "redeemed" ? "Used" : "Expired"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

      </div>
    </div>
    {showPerksModal && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
        <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-700">Perks</p>
              <h3 className="text-xl font-bold text-slate-900">JUJA Rewards Perks</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowPerksModal(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-bold text-slate-700 shadow-sm"
              aria-label="Close perks"
            >
              ×
            </button>
          </div>
          <LoyaltyPerksPanel compact />
        </div>
      </div>
    )}
    {showDetailsModal && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl">
          <div className="relative px-6 pb-5 pt-5">
            <div className="mx-auto max-w-[290px] text-center">
              {editingDetails ? (
                <input
                  value={detailsForm.customer_name}
                  onChange={(e) => setDetailsForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-xl font-semibold text-slate-950 shadow-sm outline-none focus:border-cyan-600"
                  aria-label="Full name"
                />
              ) : (
                <h3 className="text-xl font-medium text-slate-950">{member?.customer_name || "Membership Account"}</h3>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDetailsModal(false);
                setEditingDetails(false);
              }}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-bold text-slate-700 shadow-sm"
              aria-label="Close account details"
            >
              ×
            </button>
          </div>

          <div className="space-y-5 px-6 pb-5 text-[12px] text-slate-900">
            <div className="grid grid-cols-[22px_1fr] items-center gap-4">
              <Phone className="h-4 w-4 text-slate-500" />
              {editingDetails ? (
                <input
                  value={detailsForm.Phone}
                  onChange={(e) =>
                    setDetailsForm((prev) => ({ ...prev, Phone: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-cyan-600"
                  aria-label="Contact number"
                />
              ) : (
                <span className="text-sm font-medium text-slate-900">
                  {member?.Phone || member?.phone || "-"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[22px_1fr] items-center gap-4">
              <MapPin className="h-4 w-4 text-slate-500" />
              <span>{member?.City || "-"}</span>
            </div>
            <div className="grid grid-cols-[22px_1fr] items-center gap-4">
              <BarcodeIcon className="h-4 w-4 text-slate-500" />
              <span>{member?.customer_code || member?.["Customer ID"] || "-"}</span>
            </div>
            <div className="grid grid-cols-[22px_1fr] items-center gap-4">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <span>{member?.Note || "-"}</span>
            </div>
          </div>

          <div className="flex gap-2 px-6 pb-5">
            {editingDetails ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDetails(false);
                    setDetailsForm({ customer_name: member?.customer_name || "", Phone: member?.Phone || member?.phone || "" });
                  }}
                  className="h-10 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-semibold uppercase tracking-wider text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveMemberDetails}
                  disabled={savingDetails}
                  className="h-10 flex-1 rounded-xl bg-cyan-700 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-cyan-900/15 disabled:bg-slate-200 disabled:text-slate-600"
                >
                  {savingDetails ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingDetails(true)}
                className="h-10 w-full rounded-xl bg-slate-100/78 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-slate-900/15"
              >
                Edit Name / Contact
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-slate-200 bg-slate-50 px-6 py-5 text-[12px] text-slate-900">
            {[
              {
                icon: CalendarDays,
                value: fmtDate(member?.["First visit"]),
                label: "First visit",
              },
              {
                icon: CalendarDays,
                value: member?.["Last visit"] ? formatDateTime(member["Last visit"], fmtDate(member["Last visit"])) : "-",
                label: "Last visit",
              },
              {
                icon: ShoppingBasket,
                value: Number(member?.["Total visits"] || 0).toLocaleString("en-PH"),
                label: "Visits",
              },
              {
                icon: DollarSign,
                value: `PHP ${Number(member?.["Total spent"] || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                label: "Total spent",
              },
              {
                icon: Star,
                value: Number(member?.["Points balance"] ?? member?.["Points Balance"] ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 }),
                label: "Points",
              },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="grid grid-cols-[22px_1fr] gap-3">
                <Icon className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="font-medium leading-tight text-slate-950">{value}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
    Clean Profile Tab
────────────────────────────────────────────────────────────── */
function ProfileTab({ user, onLogout }) {
  return (
    <div className="max-w-md mx-auto animate-in fade-in duration-300 py-4">
      <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center text-4xl mx-auto mb-4 border border-rose-100/50">
          👤
        </div>
        <h3 className="text-lg font-bold text-slate-800 truncate max-w-full mb-1">{user?.email}</h3>
        <span className="text-[10px] uppercase font-bold tracking-widest bg-rose-50 text-[#FC687D] px-3 py-1 rounded-full border border-rose-100/40">
          Juja Member Portal
        </span>

        <div className="border-t border-slate-100 my-6 pt-4 text-left space-y-3 text-xs text-slate-500 font-medium">
          <p className="flex justify-between"><span>User System ID:</span> <span className="font-mono text-slate-700">{user?.id?.slice(0, 12)}...</span></p>
          <p className="flex justify-between"><span>Session Authorization:</span> <span className="text-green-600 font-bold">Active Token</span></p>
        </div>

        <button
          onClick={onLogout}
          className="w-full h-11 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-100 transition"
        >
          Sign Out of Session
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
    Main Responsive Customer Hub Page Controller
────────────────────────────────────────────────────────────── */
export default function Customer() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const alertedOrderStatusRef = useRef(new Set());
  const orderStatusSnapshotRef = useRef(new Map());

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const readyAlertIntervalRef = useRef(null);

  // Application UI internal toast context states register caching memory
  const [toast, setToast] = useState(null);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchOrderHistory = async (userId, options = {}) => {
    if (!userId) return;
    const { silent = false, notifyChanges = false } = options;
    if (!silent) setLoadingOrders(true);
    try {
      const { data: webRows, error: webError } = await supabase
        .from("web_orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const { data: posRows, error: posError } = await supabase
        .from("orders")
        .select("id,created_at,status,items,subtotal,total,net_amount,dining_option,order_type,payment_method,source_system,receipt_number,order_number")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (webError || posError) throw webError || posError;

      let itemRows = [];
      const posOrderIds = (posRows || []).map((order) => order.id).filter(Boolean);
      if (posOrderIds.length) {
        const { data: lines, error: lineError } = await supabase
          .from("order_items")
          .select("id,order_id,name,item_name,quantity,unit_price,line_total,net_amount")
          .in("order_id", posOrderIds);
        if (lineError) throw lineError;
        itemRows = lines || [];
      }

      const itemsByOrder = new Map();
      itemRows.forEach((line) => {
        const key = String(line.order_id);
        if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
        const quantity = Number(line.quantity || 1);
        const net = Number(line.net_amount || line.line_total || 0);
        itemsByOrder.get(key).push({
          cartItemId: line.id,
          name: line.item_name || line.name || "Item",
          quantity,
          unitPrice: Number(line.unit_price || (quantity ? net / quantity : net)),
        });
      });

      const migratedRows = (posRows || []).map((order) => {
        const jsonItems = Array.isArray(order.items) ? order.items : [];
        const lineItems = itemsByOrder.get(String(order.id)) || jsonItems;
        return {
          ...order,
          items: lineItems,
          dining_option: order.dining_option || order.order_type || (order.source_system === "loyverse" ? "Historical" : "POS"),
          subtotal: Number(order.net_amount || order.total || order.subtotal || 0),
        };
      });

      const combinedRows = [...(webRows || []), ...migratedRows].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      combinedRows.forEach((order) => {
        const orderId = order?.id || order?.receipt_number || order?.order_number;
        if (!orderId) return;
        const key = String(orderId);
        const currentStatus = `${String(order?.status || "").toLowerCase()}:${String(order?.delivery_status || "").toLowerCase()}`;
        const previousStatus = orderStatusSnapshotRef.current.get(key);
        if (notifyChanges && previousStatus && previousStatus !== currentStatus) {
          notifyOrderStatus(order);
        }
        orderStatusSnapshotRef.current.set(key, currentStatus);
      });

      setOrders(combinedRows);
    } catch (err) {
      console.warn("Unable to sync log metrics:", err);
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  };

  // Native notification permission is requested only after install or standalone launch.
  useEffect(() => {
    registerCustomerServiceWorker();

    if (isNativeApp() || isCustomerPwaInstalled()) {
      requestCustomerNotificationPermission().then((permission) => {
        setShowNotificationBanner(permission === "default");
      });
    }
  }, []);

  // ================= PWA INTERACTIVE AUTO-UPDATE SYSTEM HOOK =================
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.update();

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.onstatechange = () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("⚡ New application package version detected. Executing background autoupdate...");
            window.location.reload();
          }
        };
      };
    });
  }, []);

  useEffect(() => {
    let link = document.querySelector("link[rel='manifest']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = "/manifest-customer.json";

    async function loadData() {
      try {
        const { session, error: sessionError } = await getStableSession(supabase);
        if (sessionError) throw sessionError;

        if (!session) {
          setLoading(false);
          router.replace(customerPortalPath("/login"));
          return;
        }

        setUser(session.user);
        await fetchOrderHistory(session.user.id);

        try {
          const { data: mData } = await supabase
            .from("loyalty_members")
            .select("*")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (mData) {
            try {
              const resetResult = await resetMemberPointsIfExpired(supabase, mData);
              setMember(resetResult.member || mData);
            } catch (resetErr) {
              console.warn("Annual loyalty point reset skipped:", resetErr);
              setMember(applyAnnualPointResetToMember(mData));
            }
          }
        } catch (e) {
          console.warn("No active member profiles registered.", e);
        }
      } catch (err) {
        console.warn("Customer session load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  useEffect(() => {
    if (!user?.id) return;

    const loyaltyChannel = supabase
      .channel("loyalty-live-update")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "loyalty_members" },
        (payload) => {
          if (payload?.new && String(payload.new.user_id) === String(user.id)) {
            setMember(applyAnnualPointResetToMember(payload.new));
          }
        }
      )
      .subscribe();

    // Upgraded: Broad non-filtered query listener loop to bypass Supabase server concatenation restrictions
    const ordersChannel = supabase
      .channel("customer-orders-live-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "web_orders" },
        (payload) => {
          // Client-side row verification validation
          const incomingUserId = payload.new?.user_id || payload.old?.user_id;
          if (String(incomingUserId) !== String(user.id)) return;

          if (payload.eventType === "INSERT") {
            if (payload.new?.id) {
              orderStatusSnapshotRef.current.set(String(payload.new.id), `${String(payload.new.status || "").toLowerCase()}:${String(payload.new.delivery_status || "").toLowerCase()}`);
            }
            setOrders((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            notifyOrderStatus(payload.new);
            if (payload.new?.id) {
              orderStatusSnapshotRef.current.set(String(payload.new.id), `${String(payload.new.status || "").toLowerCase()}:${String(payload.new.delivery_status || "").toLowerCase()}`);
            }
            setOrders((prev) =>
              prev.map((o) => (o.id === payload.new.id ? payload.new : o))
            );
          } else if (payload.eventType === "DELETE") {
            if (payload.old?.id) {
              orderStatusSnapshotRef.current.delete(String(payload.old.id));
            }
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(loyaltyChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    let pollInFlight = false;
    const pollCustomerOrders = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        await fetchOrderHistory(user.id, { silent: true, notifyChanges: true });
      } finally {
        pollInFlight = false;
      }
    };

    const pollTimer = window.setInterval(pollCustomerOrders, 3000);
    pollCustomerOrders();

    return () => window.clearInterval(pollTimer);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    registerNativeCustomerPush({ supabase, userId: user.id }).then((result) => {
      if (result?.supported && result?.granted === false) {
        setShowNotificationBanner(true);
      }
    });
  }, [user?.id]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      const isBannerDismissed = localStorage.getItem("juja_pwa_dismissed") === "true";
      if (!isBannerDismissed) {
        setShowInstallBanner(true);
      }
    };

    const handleAppInstalled = () => {
      localStorage.setItem("juja_customer_pwa_installed", "true");
      setShowInstallBanner(false);
      requestCustomerNotificationPermission().then((permission) => {
        setShowNotificationBanner(permission === "default");
      });
    };

    // Fix: Add listener directly using the initialized handler
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const triggerPwaInstallation = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`📦 Customer home installation choice logged: ${outcome}`);
    
    setDeferredPrompt(null);
    setShowInstallBanner(false);

    if (outcome === "accepted") {
      localStorage.setItem("juja_customer_pwa_installed", "true");
      await registerCustomerServiceWorker();
      const permission = await requestCustomerNotificationPermission();
      setShowNotificationBanner(permission === "default");
    }
  };

  const enableCustomerNotifications = async () => {
    await registerCustomerServiceWorker();
    const permission = await requestCustomerNotificationPermission();
    setShowNotificationBanner(permission === "default");
    if (permission === "granted") {
      showToast("success", "Notifications Enabled", "Order-ready alerts will appear in your device notification panel.");
    } else if (permission === "denied") {
      showToast("error", "Notifications Blocked", "Enable notifications in your browser or app settings to receive order alerts.");
    }
  };

  const closeInstallBannerForever = () => {
    localStorage.setItem("juja_pwa_dismissed", "true");
    setShowInstallBanner(false);
  };

  const stopReadyAlertSound = () => {
    if (readyAlertIntervalRef.current) {
      clearInterval(readyAlertIntervalRef.current);
      readyAlertIntervalRef.current = null;
    }
  };

  const startReadyAlertSound = () => {
    stopReadyAlertSound();
    playCustomerAlertSound("ready");
    readyAlertIntervalRef.current = setInterval(() => playCustomerAlertSound("ready"), 3000);
  };

  useEffect(() => {
    return () => stopReadyAlertSound();
  }, []);

  const notifyOrderStatus = async (order) => {
    const status = String(order?.status || "").toLowerCase();
    const deliveryStatus = String(order?.delivery_status || "").toLowerCase();
    const isReady = status === "ready";
    const isDelivered = status === "delivered" || status === "completed";
    const hasDeliveryUpdate =
      Boolean(deliveryStatus) &&
      !["quoted", "pending", "waiting", "waiting_for_payment"].includes(deliveryStatus);
    if (!isReady && !isDelivered && !hasDeliveryUpdate) return;

    const key = `${order.id}:${status}:${deliveryStatus}`;
    if (alertedOrderStatusRef.current.has(key)) return;
    alertedOrderStatusRef.current.add(key);

    const orderIdShort = order.id.slice(0, 8).toUpperCase();
    const points = loyaltyPoints(order.total || order.subtotal).toFixed(2);
    const orderLabel = `Order #${orderIdShort}`;
    const readableDeliveryStatus = deliveryStatus
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    const notificationTitle = "JUJA Brew & Bites";
    const notificationBody = isReady
      ? `Ready now - ${orderLabel} is ready for pickup or delivery.`
      : isDelivered
        ? `Completed - ${orderLabel} has been completed. Thank you!`
        : `Delivery update - ${orderLabel}: ${readableDeliveryStatus || "Rider status updated"}.`;
    const notificationLargeBody = isReady
      ? `Ready now - ${orderLabel} is ready for pickup or delivery. Tap to view your order status.`
      : isDelivered
        ? `Completed - ${orderLabel} has been completed. Loyalty points earned: +${points}.`
        : `Delivery update - ${orderLabel}: ${readableDeliveryStatus || "Rider status updated"}. Tap to view delivery tracking.`;

    if (isReady) {
      startReadyAlertSound();
    } else {
      stopReadyAlertSound();
      playCustomerAlertSound(isDelivered ? status : "delivery");
    }
    
    // 1. High Visibility In-App Toast Alert Layout Mutation Trigger
    showToast(
      "success",
      isReady ? "Order Ready" : isDelivered ? "Order Completed" : "Delivery Update",
      isReady
        ? `Order #${orderIdShort} is fresh and ready for pickup or delivery.`
        : isDelivered
          ? `Order #${orderIdShort} is delivered. Loyalty points earned: +${points}.`
          : `Order #${orderIdShort}: ${readableDeliveryStatus || "Rider status updated"}.`
    );

    await showCustomerPanelNotification({
      title: notificationTitle,
      body: notificationBody,
      largeBody: notificationLargeBody,
      summaryText: isReady ? "Order ready" : isDelivered ? "Order completed" : "Delivery update",
      group: `web-order:${order.id}`,
      tag: `${order.id}:${status}:${deliveryStatus}`,
      url: "/customer?tab=history",
      data: {
        type: "order_status",
        web_order_id: String(order.id),
        status: isReady || isDelivered ? status : deliveryStatus,
      },
    });
  };

  if (loading) {
    return (
      <div className="juja-page-bg min-h-screen flex items-center justify-center bg-[#FFF5F7]">
        <CustomerApkUpdatePrompt />
        <div className="w-9 h-9 border-4 border-rose-200 border-t-[#FC687D] animate-spin rounded-full" />
      </div>
    );
  }

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace(customerPortalPath("/login"));
  };

  return (
    <div className="juja-page-bg min-h-screen bg-[#FFF5F7] text-slate-800 antialiased flex flex-col lg:flex-row">
      <CustomerApkUpdatePrompt />
      {/* Visual In-App Notification System Render Slot */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[250] px-4 w-full max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-950 border border-rose-400/30 text-white rounded-2xl shadow-2xl p-4 flex items-start gap-3 relative overflow-hidden ring-1 ring-white/10">
            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#FC687D]" />
            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-300/20 flex items-center justify-center text-xl shrink-0">
              {toast.title?.toLowerCase().includes("completed") ? "✅" : "🛎️"}
            </div>
            <div className="text-sm flex-1 min-w-0">
              <p className="font-black text-rose-300 tracking-wide text-xs uppercase">{toast.title}</p>
              <p className="text-white/90 text-xs mt-1 font-medium leading-relaxed">{toast.message}</p>
            </div>
            <button 
              onClick={() => { stopReadyAlertSound(); setToast(null); }} 
              className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center text-xs font-bold text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <AppNavigation tab={tab} setTab={setTab} />

      <main className="flex-1 overflow-x-hidden min-h-screen pb-32 pt-4 md:pt-8 px-4 sm:px-6 lg:pl-72 lg:pr-8 max-w-7xl mx-auto w-full transition-all">
        {tab === "home" && <HomeTab member={member} user={user} setTab={setTab} />}
        {tab === "order" && (
          <OrderTab 
            user={user} 
            member={member} 
            onCheckoutSuccess={() => setTab("history")} 
          />
        )}
        {tab === "history" && <TrackerTab orders={orders} loadingOrders={loadingOrders} />}
        {tab === "loyalty" && <LoyaltyTab member={member} setMember={setMember} user={user} />}
        {tab === "booking" && <BookingTab user={user} member={member} />}
        {tab === "profile" && <ProfileTab user={user} onLogout={logout} />}
      </main>

      <ApkDownloadBanner
        manifestUrl="/app-updates/customer.json"
        storageKey="juja_customer_apk_download_dismissed"
        logo={LOGO}
        title="Download JUJA Customer Portal"
        description="Install the Android APP to order faster and manage your loyalty pass."
        className="fixed bottom-[84px] md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[90] bg-white border border-cyan-100 p-4 rounded-2xl shadow-[0_10px_30px_rgba(14,116,144,0.14)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300"
      />

      {showNotificationBanner && (
        <div className="fixed bottom-[84px] md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[95] bg-white border border-rose-100 p-4 rounded-2xl shadow-[0_10px_30px_rgba(252,104,125,0.14)] flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-300">
          <div>
            <p className="text-xs font-bold text-slate-800">Enable order alerts</p>
            <p className="text-[10px] text-slate-400 font-medium">Get ready and completed order updates in your device notification panel.</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={enableCustomerNotifications}
              className="px-3 py-1.5 bg-blue-300/50 hover:bg-blue-300/80 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition"
            >
              Enable
            </button>
            <button
              onClick={() => setShowNotificationBanner(false)}
              className="text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-600 font-bold text-center"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

