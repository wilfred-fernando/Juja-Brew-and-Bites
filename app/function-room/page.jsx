"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

// ✅ Reuse booking system availability UI (must be exported from BookingForm.jsx)
import { BookingAvailabilityOnly } from "@/components/BookingForm";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

/* ─────────────────────────────────────────────────────────────
    Shared Modal Shell (matches BookingForm look & feel)
───────────────────────────────────────────────────────────── */
function ModalShell({ open, onClose, title, subtitle, children, z = 140 }) {
  if (!open) return null;
  return (
    <div
      style={{ zIndex: z }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-normal">
              {title}
            </p>
            {subtitle ? (
              <h3 className="text-lg font-normal text-slate-800 mt-1 truncate">
                {subtitle}
              </h3>
            ) : null}
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
    Shared Nav (softened typography to match BookingForm panels)
───────────────────────────────────────────────────────────── */
function Nav({ active }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginUrl, setLoginUrl] = useState("https://customer.jujabrewandbites.com/login");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setLoginUrl(isLocal ? "http://customer.localhost:3000/login" : "https://customer.jujabrewandbites.com/login");
    }
    
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    ["home", "Home", "/"],
    ["menu", "Menu", "/menu"],
    ["promo", "Promos", "/promos"],
    ["function room", "Function Room", "/function-room"],
    ["about", "About Us", "/about"]
  ];

  const mobileLinks = [
    ["Home", "/"],
    ["Menu", "/menu"],
    ["Promos", "/promos"],
    ["Function Room", "/function-room"],
    ["About Us", "/about"]
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-white/95 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.05)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-12 sm:h-14 md:h-16 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow-sm" />
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link key={id} href={href}
              className={`relative text-[11px] lg:text-[12px] font-semibold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#FC687D]" : "text-slate-600 hover:text-slate-900"
              }`}>
              {label}
              <span className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-[#FC687D] to-rose-400 transition-all duration-350 ${
                active === id ? "w-full" : "w-0 group-hover:w-full"
              }`} />
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href={loginUrl}
            className="text-[11px] font-semibold uppercase tracking-widest px-5 py-2.5 rounded-full border border-slate-200 text-slate-500 hover:border-[#FC687D] hover:text-[#FC687D] transition-colors"
          >
            Login
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-slate-800"
          onClick={() => setOpen(!open)}
          aria-label="Toggle Menu"
          type="button"
        >
          <div className="w-5 space-y-[5px]">
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "opacity-0" : ""}`} />
            <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-6 flex flex-col gap-3">
          {mobileLinks.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="text-slate-800 font-medium tracking-wide text-sm py-2 border-b border-slate-50"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/order"
            onClick={() => setOpen(false)}
            className="mt-4 py-3.5 rounded-full bg-[#FC687D] text-white font-semibold text-sm text-center"
          >
            Order Now →
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
    Shared Footer (kept consistent with your current style)
───────────────────────────────────────────────────────────── */
function Footer() {
  return (
    // Replaced large margin-top and padding-top with tight, proportional paddings suitable for a viewport container
    <footer className="bg-slate-900 text-slate-400 py-6 md:py-8 px-6 flex-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mb-4 md:mb-6">
        {/* Brand Block */}
        <div className="flex flex-col justify-center">
          <img
            src={LOGO}
            alt="Juja"
            className="h-10 w-auto object-contain mb-3 brightness-0 invert opacity-60 self-start"
          />
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
            Your premier destination for specialty brews and artisan bites in Quezon City.
          </p>
        </div>

        {/* Branch 1: Pasong Tamo */}
        <div className="text-xs">
          <p className="text-[#FC687D] font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">
            Pasong Tamo Branch
          </p>
          <div className="space-y- text-slate-400 leading-relaxed">
            <p>📍 36D Visayas Ave., Pasong Tamo, QC</p>
            <p>📞 0939-9228383</p>
            <p className="text-slate-500 text-[11px]">Store: 10AM–12MN · Function: 10AM–2AM</p>
          </div>
        </div>

        {/* Branch 2: Diliman */}
        <div className="text-xs">
          <p className="text-[#FC687D] font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">
            Diliman Branch
          </p>
          <div className="space-y-1 text-slate-400 leading-relaxed">
            <p>📍 8 Visayas Ave., Diliman, QC</p>
            <p>📞 0961-6320909</p>
            <p className="text-slate-500 text-[11px]">Mon-Wed: 8AM–10PM · Thu-Sat: 10AM–10PM</p>
          </div>
        </div>
      </div>

      {/* Footer Bottom Metadata Bar */}
      <div className="max-w-7xl mx-auto pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-slate-500 text-[10px] tracking-wider uppercase">
        <p>© {new Date().getFullYear()} Juja Brew &amp; Bites® · All rights reserved</p>
        <p>Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
    Main Page
───────────────────────────────────────────────────────────── */
export default function FunctionRoomPage() {
  const supabase = getSupabaseClient();

  const [selectedPackage, setSelectedPackage] = useState("consumable");
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  const [sessionUser, setSessionUser] = useState(null);
  const [customerBase, setCustomerBase] = useState("https://customer.jujabrewandbites.com");
  const [loginUrl, setLoginUrl] = useState("https://customer.jujabrewandbites.com/login");
  const [bookingUrl, setBookingUrl] = useState("https://customer.jujabrewandbites.com/?tab=booking");

  const [pickedSlot, setPickedSlot] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSessionUser(session?.user || null);
    })();

    if (typeof window !== "undefined") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      const base = isLocal
        ? "http://customer.localhost:3000"
        : "https://customer.jujabrewandbites.com";

      setCustomerBase(base);
      setLoginUrl(`${base}/login`);
      setBookingUrl(`${base}/?tab=booking`);
    }
  }, []);

  const keySpecs = [
    { icon: "👥", title: "Capacity", desc: "Up to 60 guests" },
    { icon: "⚡", title: "Amenities", desc: "Wi‑Fi, sound system, smart TV & KTV ready" },
    { icon: "⏰", title: "Hours", desc: "10:00 AM up to 2:00 AM daily" },
    { icon: "❄️", title: "Comfort", desc: "Fully air‑conditioned private space" },
  ];

  const packages = {
    consumable: [
      {
        title: "Package 1",
        rate: "₱3,000",
        hours: "3 Hours Exclusive Use",
        subtitle: "₱2,500 consumable for food & drinks.",
        features: [          
          "Capacity: up to 15 Guests ",  
          "Private use of function room",
          "Order from the full menu catalog",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "₱250 per succeeding extension hour",
        ],
      },
      {
        title: "Package 2",
        rate: "₱7,000",
        hours: "3 Hours Exclusive Use",
        subtitle: "₱5,500 consumable for food & drinks.",
        features: [
          "Capacity: up to 30 Guests ",  
          "Private use of function room",
          "Order from the full menu catalog",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "₱750 per succeeding extension hour",
        ],
      },
      {
        title: "Package 3",
        rate: "₱15,000",
        hours: "3 Hours Exclusive Use",
        subtitle: "₱12,000 consumable for food & drinks.",
        features: [
          "Capacity: up to 60 Guests ",
          "Exclusive use of the entire store",
          "Order from the full menu catalog",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "₱1,500 per succeeding extension hour",
        ],
      },
    ],
    celebration: [
      {
        title: "Package 4",
        rate: "₱2,500",
        hours: "3 Hours Exclusive Use",
        subtitle: "Room rental only",
        features: [
          "Capacity: up to 15 Guests",
          "Private use of function room",
          "Inclusive of corkage for food and drinks",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "Extension: ₱1,000 per hour",
        ],
      },
      {
        title: "Package 5",
        rate: "₱3,500",
        hours: "3 Hours Exclusive Use",
        subtitle: "Room rental only",
        features: [
          "Capacity: up to 30 Guests",
          "Private use of function room",
          "Inclusive of corkage for food and drinks",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "Extension: ₱1,500 per hour",
        ],
      },
      {
        title: "Package 6",
        rate: "₱8,000",
        hours: "3 Hours Exclusive Use",
        subtitle: "Room rental only",
        features: [
          "Capacity: up to 60 Guests",
          "Exclusive use of the entire store",
          "Inclusive of corkage for food and drinks",
          "Use of entertainment amenities: Videoke, YouTube & Netflix",
          "Extension: ₱2,500 per hour",
        ],
      },
    ],
  };

  function handleSelectSlot({ dateISO, hour }) {
    const payload = { dateISO, hour };
    setPickedSlot(payload);

    if (typeof window !== "undefined") {
      localStorage.setItem("fr_pending_booking", JSON.stringify(payload));
      localStorage.setItem("fr_return_url", window.location.href);
    }

    if (!sessionUser) {
      window.location.href = loginUrl;
      return;
    }

    window.location.href = bookingUrl;
  }

  return (
    // Locked master layout boundaries to screen viewport metrics (h-screen w-screen overflow-hidden)
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white">
      <Nav active="function room" />

      {/* ─── SCROLLABLE MAIN APPARATUS WORKSPACE FIELD ─── */}
      {/* flex-1 absorbs leftover size, overflow-y-auto traps internal scrolling, pt-20 clears fixed nav */}
      <main className="flex-1 min-h-0 overflow-y-auto pt-20 pb-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6 md:space-y-8">
          
          {/* Header (Adjusted paddings for better vertical optimization) */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <p className="text-xs text-rose-500 font-semibold">Private Bookings</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">
                Function Room
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Check availability and reserve your slot.
              </p>
            </div>

            <button
              onClick={() => {
                setPickedSlot(null);
                setBookingModalOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#FC687D] hover:bg-rose-500 text-white text-[11px] font-bold uppercase tracking-widest shadow-md shadow-rose-100 active:scale-[0.99] transition-transform"
              type="button"
            >
              Check Availability
            </button>
          </div>

          {/* Hero Specs Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 md:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-slate-800">
              Host your event at Juja
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              Ideal for birthdays, meetings, private gatherings, and milestone celebrations.
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
              {keySpecs.map((s) => (
                <div
                  key={s.title}
                  className="bg-slate-50 border border-slate-100 rounded-xl p-3.5"
                >
                  <div className="text-xl">{s.icon}</div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800 mt-1.5">
                    {s.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rates & Packages Block (Untouched internally as requested) */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Rates & Packages</h3>
                <p className="text-sm text-slate-500 mt-1">Choose the package that fits your event.</p>
              </div>

              <div className="inline-flex bg-slate-50 border border-slate-200/60 p-1 rounded-full shadow-inner">
                <button
                  onClick={() => setSelectedPackage("consumable")}
                  className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${
                    selectedPackage === "consumable"
                      ? "bg-[#FC687D] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  type="button"
                >
                  Consumable
                </button>
                <button
                  onClick={() => setSelectedPackage("celebration")}
                  className={`px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${
                    selectedPackage === "celebration"
                      ? "bg-[#FC687D] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  type="button"
                >
                  Room Only
                </button>
              </div>
            </div>

            {/* 3-Column Grid View for Balanced Desktop Layout */}
            <div className="mt-6 grid md:grid-cols-3 gap-6">
              {packages[selectedPackage].map((pkg, index) => (
                <div 
                  key={index} 
                  className="bg-slate-50 border border-slate-100 rounded-3xl p-5 sm:p-6 flex flex-col justify-between items-start min-h-[420px]"
                >
                  <div className="w-full">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-[#FC687D] bg-rose-50 border border-rose-100 px-3 py-1 rounded-full">
                      {pkg.hours}
                    </span>

                    <h4 className="text-lg font-semibold text-slate-800 mt-3">
                      {pkg.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2">
                      {pkg.subtitle}
                    </p>

                    <ul className="mt-4 space-y-2">
                      {pkg.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                          <span className="text-[#FC687D] mt-[1px]">✔</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="w-full pt-4 mt-6 border-t border-slate-200/60">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Base Rate
                    </div>
                    <div className="text-2xl font-semibold text-[#FC687D] mt-1">
                      {pkg.rate}
                    </div>

                    <button
                      onClick={() => {
                        setPickedSlot(null);
                        setBookingModalOpen(true);
                      }}
                      className="w-full mt-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-widest shadow-md active:scale-[0.99] transition-transform"
                      type="button"
                    >
                      Check Availability
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* Availability Popup Modal Layer Block */}
      <ModalShell
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title="Function Room"
        subtitle="Check Availability"
        z={160}
      >
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-rose-50 shadow-sm p-4">
            <p className="text-[11px] text-slate-500 font-normal">
              Select a date and choose an available time slot.
            </p>
            <p className="text-[11px] text-slate-400 mt-1 font-normal">
              Booking requires login and continues in the customer portal.
            </p>
          </div>

          <div className="bg-white rounded-2xl md:rounded-[28px] border border-rose-50 shadow-sm p-5 md:p-6 space-y-4">
            <BookingAvailabilityOnly onSelectSlot={handleSelectSlot} />
          </div>

          {pickedSlot && (
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-normal">
              <div className="text-slate-800 font-normal">Selected Slot</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5 font-normal">
                Date: {pickedSlot.dateISO} · Hour Code: {pickedSlot.hour}
              </div>
              <div className="mt-2 text-xs text-slate-500 normal-case tracking-normal font-normal">
                This selection will continue after login
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!sessionUser ? (
              <button
                onClick={() => (window.location.href = loginUrl)}
                className="w-full py-3 rounded-2xl bg-[#FC687D] text-white text-xs tracking-wider font-normal"
              >
                Login to Book Now
              </button>
            ) : (
              <button
                onClick={() => (window.location.href = bookingUrl)}
                className="w-full py-3 rounded-2xl bg-slate-900 text-white text-xs tracking-wider font-normal"
              >
                Continue to Booking
              </button>
            )}

            <button
              onClick={() => setBookingModalOpen(false)}
              className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 text-xs font-normal"
            >
              Close
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center font-normal">
            Need help? Call/text 0939-9228383
          </p>
        </div>
      </ModalShell>

      <Footer />
    </div>
  );
}