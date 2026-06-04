"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LOGO = "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";
const ABOUT_IMAGE = "https://images.jujabrewandbites.com/juja%205.png";

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
    ["about", "About Us", "/about"],
  ];

  const mobileLinks = [
    ["Home", "/"],
    ["Menu", "/menu"],
    ["Promos", "/promos"],
    ["Function Room", "/function-room"],
    ["About Us", "/about"],
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled ? "bg-white/95 backdrop-blur-2xl shadow-[0_1px_30px_rgba(0,0,0,0.05)]" : "bg-transparent"
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between h-20">
        <Link href="/" className="flex-shrink-0">
          <img src={LOGO} alt="Juja" className="h-12 sm:h-14 md:h-16 w-auto object-contain transition-all duration-300 hover:scale-105 drop-shadow-sm" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              className={`relative text-[11px] lg:text-[12px] font-semibold uppercase tracking-[0.18em] transition-all duration-300 group pb-1 ${
                active === id ? "text-[#FC687D]" : "text-slate-600 hover:text-slate-900"
              }`}
            >
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

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-2 md:py-3 px-6 flex-none">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5 mb-2 md:mb-3">
        <div className="flex flex-col justify-center">
          <p className="text-slate-400 mb-2 leading-relaxed max-w-sm">
            ROMANS 15:13
          </p>
          <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
            May the God of hope fill you with all joy and peace...
          </p>
        </div>

        <div className="text-xs">
          <p className="text-[#FC687D] font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">
            Pasong Tamo Branch
          </p>
          <div className="space-y- text-slate-400 leading-relaxed">
            <p>📍 36D Visayas Ave., Pasong Tamo, QC</p>
            <p>📞 0939-9228383</p>
            <p className="text-slate-500 text-[11px]">Store: 10AM–12MN · Function Room: 10AM–2AM</p>
          </div>
        </div>

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

      <div className="max-w-7xl mx-auto pt-2 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center text-slate-500 text-[10px] tracking-wider uppercase">
        <p>© {new Date().getFullYear()} Juja Brew &amp; Bites® · All rights reserved</p>
        <p>Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

export default function About() {
  return (
    <div className="juja-page-bg flex min-h-screen flex-col bg-transparent md:h-screen md:overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav active="about" />

      <main className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-28 sm:px-6 md:flex md:items-center md:px-8 md:pb-6 md:pt-20 lg:px-10">
        <img
          src={ABOUT_IMAGE}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-50 md:hidden"
        />
        <div className="absolute inset-0 bg-white/25 md:hidden" />

        <section className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[0.46fr_0.54fr] md:items-center md:gap-8 lg:gap-10 xl:max-w-7xl">
          <div className="hidden overflow-hidden rounded-[28px] border border-white/60 bg-white/20 shadow-[0_24px_55px_rgba(15,23,42,0.12)] md:block md:h-[min(56vh,620px)] lg:h-[min(60vh,700px)]">
            <img
              src={ABOUT_IMAGE}
              alt="Juja mascot holding milk tea"
              className="h-full w-full scale-[1.08] object-cover object-center"
            />
          </div>

          <div className="flex flex-col justify-center text-black md:min-h-0">
            <section className="mb-7 border-b border-[#087830]/20 pb-6 md:mb-3 md:pb-3 lg:mb-4 lg:pb-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#087830] md:mb-1 md:text-[10px] lg:mb-2">
                About Juja
              </p>
              <h1 className="mb-5 max-w-xl text-3xl font-semibold leading-tight text-black sm:text-4xl md:mb-2 md:text-[clamp(1.85rem,3.2vw,3.05rem)] lg:mb-3">
                <span className="block">Welcome to</span>
                <span className="block text-[#087830]">JUJA Brew &amp; Bites</span>
              </h1>
              <p className="mb-5 max-w-2xl text-justify text-[15px] leading-8 text-zinc-800 sm:text-base md:mb-2 md:text-xs md:leading-5 lg:mb-3 lg:text-[13px] lg:leading-6 xl:text-sm xl:leading-7">
                At JUJA Brew &amp; Bites, we believe that great food and drinks bring people together. Founded with a passion for creating memorable dining experiences, we serve a wide variety of handcrafted beverages, comfort food, and delightful snacks in a warm and welcoming environment.
              </p>
              <p className="max-w-2xl text-justify text-[15px] leading-8 text-zinc-800 sm:text-base md:text-xs md:leading-5 lg:text-[13px] lg:leading-6 xl:text-sm xl:leading-7">
                Whether you're stopping by for your daily coffee, enjoying our milk tea selections, sharing a meal with friends, or celebrating a special occasion, our goal is to provide quality products and exceptional service every time you visit.
              </p>
            </section>

            <div className="space-y-6 md:space-y-2.5 lg:space-y-3">
              {[
                {
                  title: "Our Story",
                  body: [
                    "What started as a simple vision to create a cozy destination for food and beverage lovers has grown into a community-focused cafe and gathering place. We continuously innovate our menu while maintaining the quality and consistency our customers have come to love.",
                    "Every drink is carefully prepared, every meal is made with attention to detail, and every guest is treated like family.",
                  ],
                },
                {
                  title: "Our Mission",
                  body: [
                    "To create enjoyable food and beverage experiences by serving high-quality products, providing outstanding customer service, and building meaningful connections within our community.",
                  ],
                },
                {
                  title: "Our Vision",
                  body: [
                    "To become one of the most trusted and loved food and beverage destinations, known for quality, and unforgettable customer experiences.",
                  ],
                },
              ].map((item) => (
                <section key={item.title} className="relative pl-5 md:pl-4 lg:pl-5">
                  <span className="absolute left-0 top-1.5 h-[calc(100%-0.35rem)] w-[3px] rounded-full bg-[#087830]" />
                  <h2 className="mb-2 text-2xl font-semibold leading-tight text-black sm:text-[1.7rem] md:mb-1 md:text-[1.05rem] lg:mb-1.5 lg:text-lg xl:text-xl">
                    {item.title}
                  </h2>
                  <div className="space-y-4 md:space-y-1.5 lg:space-y-2">
                    {item.body.map((paragraph) => (
                      <p key={paragraph} className="text-justify text-[15px] leading-8 text-zinc-800 sm:text-base md:text-xs md:leading-5 lg:text-[13px] lg:leading-6 xl:text-sm xl:leading-7">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
