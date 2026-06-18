"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

const coffeeFlavors = [
  "Spanish Latte",
  "Iced Latte",
  "Sea Salt Latte",
  "Caramel Macchiato",
  "White Mocha",
  "Mocha",
  "Americano",
];

const premiumCoffeeFlavors = [
  "Biscoff Latte",
  "Dirty Matcha Latte",
  "Sea Salt Spanish Latte",
  "Double Shot Latte",
  "Dark Mocha",
  "Vanilla Latte",
  "Hazelnut Latte",
];

const milkTeaFlavors = [
  "Black Pearl Milk Tea",
  "Panda Milk Tea",
  "Cheesecake Milk Tea",
  "Oreo Sea Salt Milk Tea",
  "Juja Trio Milk Tea",
  "Taro Milk Tea",
];

const premiumMilkTeaFlavors = [
  "Oreo Sea Salt Milk Tea",
  "Cheesecake Milk Tea",
  "Milo Dinosaur",
  "Brown Sugar Milk Tea",
  "Matcha Milk Tea",
  "Juja Trio Milk Tea",
];

const coffeePackages = [
  {
    name: "Coffee Package A",
    cups: "100 Cups",
    price: "₱16,999",
    meta: ["Good for 100 cups", "16oz iced coffee", "2 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 4 coffee flavors",
      "Uniformed barista/service staff",
      "Cups, straws, ice, and complete serving supplies",
      "1 hour setup before event",
    ],
  },
  {
    name: "Coffee Package B",
    cups: "150 Cups",
    price: "₱23,999",
    meta: ["Good for 150 cups", "16oz iced coffee", "2 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 5 coffee flavors",
      "Uniformed barista/service staff",
      "Cups, straws, ice, and complete serving supplies",
      "Free event menu display",
      "1 hour setup before event",
    ],
  },
  {
    name: "Coffee Package C",
    cups: "200 Cups",
    price: "₱30,999",
    meta: ["Good for 200 cups", "16oz iced coffee", "3 hours service time"],
    includes: [
      "Mobile coffee cart setup",
      "Custom cup stickers",
      "Choice of 6 coffee flavors",
      "2 uniformed service staff",
      "Cups, straws, ice, and complete serving supplies",
      "Free event menu display",
      "1 hour setup before event",
    ],
  },
];

const drinkPackages = [
  {
    group: "100 Cups Packages",
    items: [
      {
        name: "Package A",
        label: "Classic Milk Tea 100",
        price: "₱14,999",
        meta: ["Good for 100 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 milk tea flavors",
          "Uniformed service staff",
          "Cups, straws, ice, sinkers, and serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package B",
        label: "Premium Milk Tea 100",
        price: "₱17,999",
        meta: ["Good for 100 cups", "16oz premium drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 premium flavors",
          "Premium sinker options",
          "Uniformed service staff",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package C",
        label: "Milk Tea + Coffee 100",
        price: "₱18,999",
        meta: ["50 cups Milk Tea", "50 cups Iced Coffee", "2 hours service time"],
        includes: [
          "Choice of 3 milk tea flavors",
          "Choice of 3 coffee flavors",
          "Mobile drink cart setup",
          "Custom cup stickers",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "150 Cups Packages",
    items: [
      {
        name: "Package D",
        label: "Classic Milk Tea 150",
        price: "₱20,999",
        meta: ["Good for 150 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 5 milk tea flavors",
          "Uniformed service staff",
          "Complete serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package E",
        label: "Premium Milk Tea 150",
        price: "₱25,999",
        meta: ["Good for 150 cups", "16oz premium drinks", "2 hours service time"],
        includes: [
          "Choice of 5 premium flavors",
          "Premium sinkers",
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Free event menu display",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package F",
        label: "Milk Tea + Coffee 150",
        price: "₱26,999",
        meta: ["75 cups Milk Tea", "75 cups Iced Coffee", "2 hours service time"],
        includes: [
          "Choice of 4 milk tea flavors",
          "Choice of 4 coffee flavors",
          "Mobile cart setup",
          "Custom cup stickers",
          "Free event menu display",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "200 Cups Packages",
    items: [
      {
        name: "Package G",
        label: "Classic Milk Tea 200",
        price: "₱26,999",
        meta: ["Good for 200 cups", "16oz drinks", "3 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 6 milk tea flavors",
          "2 uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavors: milkTeaFlavors,
      },
      {
        name: "Package H",
        label: "Premium Milk Tea 200",
        price: "₱33,999",
        meta: ["Good for 200 cups", "16oz premium drinks", "3 hours service time"],
        includes: [
          "Choice of 6 premium flavors",
          "Premium sinkers",
          "Custom cup stickers",
          "Mobile cart setup",
          "2 service staff",
          "Free event menu display",
        ],
        flavors: premiumMilkTeaFlavors,
      },
      {
        name: "Package I",
        label: "Milk Tea + Coffee 200",
        price: "₱34,999",
        meta: ["100 cups Milk Tea", "100 cups Iced Coffee", "3 hours service time"],
        includes: [
          "Choice of 5 milk tea flavors",
          "Choice of 5 coffee flavors",
          "Mobile drink cart setup",
          "Custom cup stickers",
          "2 service staff",
          "Free event menu display",
        ],
        flavors: coffeeFlavors,
      },
    ],
  },
];

const addOns = [
  "Classic Milk Tea additional cups: ₱130/cup",
  "Premium Milk Tea additional cups: ₱160/cup",
  "Coffee additional cups: ₱160/cup",
  "Premium coffee upgrade: ₱20 to ₱30/cup",
  "Extra service hour: ₱1,500/hour",
  "Additional barista: ₱1,000",
  "Premium sinkers: ₱500 to ₱1,000",
  "Custom event menu board: ₱500",
  "Coffee machine setup upgrade: ₱2,000",
  "Travel fee depends on event location",
];

function Nav({ active }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [loginUrl, setLoginUrl] = useState(
    "https://customer.jujabrewandbites.com/login"
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      setLoginUrl(
        isLocal
          ? "http://customer.localhost:3000/login"
          : "https://customer.jujabrewandbites.com/login"
      );
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
    ["event-cart", "Event Cart", "/event-cart"],
    ["about", "About Us", "/about"],
  ];

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-500 ${
        scrolled
          ? "bg-white/95 shadow-[0_1px_30px_rgba(0,0,0,0.05)] backdrop-blur-2xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
        <Link href="/" className="flex-shrink-0">
          <img
            src={LOGO}
            alt="Juja"
            className="h-12 w-auto object-contain drop-shadow-sm transition-all duration-300 hover:scale-105 sm:h-14 md:h-16"
          />
        </Link>

        <div className="hidden items-center gap-5 md:flex lg:gap-8">
          {links.map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              className={`group relative pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-300 lg:text-[12px] ${
                active === id
                  ? "text-[#FC687D]"
                  : "text-slate-700 hover:text-slate-950"
              }`}
            >
              {label}
              <span
                className={`absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-[#FC687D] to-rose-400 transition-all duration-350 ${
                  active === id ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </Link>
          ))}
        </div>

        <Link
          href={loginUrl}
          className="hidden rounded-full border border-[#087830]/50 bg-white/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-[#087830] transition-colors hover:bg-white md:block"
        >
          Login
        </Link>

        <button
          className="p-2 text-slate-800 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle Menu"
          type="button"
        >
          <div className="w-5 space-y-[5px]">
            <span
              className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${
                open ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-[2px] rounded-full bg-current transition-all duration-300 ${
                open ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </div>
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-6 md:hidden">
          {links.map(([, label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="border-b border-slate-50 py-2 text-sm font-medium tracking-wide text-slate-800"
            >
              {label}
            </Link>
          ))}
          <Link
            href={loginUrl}
            onClick={() => setOpen(false)}
            className="rounded-full border border-[#087830]/50 bg-white/80 py-3.5 text-center text-sm font-semibold text-[#087830]"
          >
            Login
          </Link>
        </div>
      )}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="flex-none bg-slate-900 px-6 py-2 text-slate-400 md:py-3">
      <div className="mx-auto mb-2 grid max-w-7xl grid-cols-1 gap-3 md:mb-3 md:grid-cols-3 md:gap-5">
        <div className="flex flex-col justify-center">
          <p className="mb-2 max-w-sm leading-relaxed text-slate-400">
            ROMANS 15:13
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-slate-400">
            May the God of hope fill you with all joy and peace...
          </p>
        </div>

        <div className="text-xs">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FC687D]">
            Pasong Tamo Branch
          </p>
          <div className="space-y-1 leading-relaxed text-slate-400">
            <p>36D Visayas Ave., Pasong Tamo, QC</p>
            <p>0939-9228383</p>
            <p className="text-[11px] text-slate-500">
              Store: 10AM-12MN · Function Room: 10AM-2AM
            </p>
          </div>
        </div>

        <div className="text-xs">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FC687D]">
            Diliman Branch
          </p>
          <div className="space-y-1 leading-relaxed text-slate-400">
            <p>8 Visayas Ave., Diliman, QC</p>
            <p>0961-6320909</p>
            <p className="text-[11px] text-slate-500">
              Mon-Wed: 8AM-10PM · Thu-Sat: 10AM-10PM
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between border-t border-white/10 pt-2 text-[10px] uppercase tracking-wider text-slate-500 sm:flex-row">
        <p>
          © {new Date().getFullYear()} Juja Brew &amp; Bites® · All rights
          reserved
        </p>
        <p>Quezon City · Philippines</p>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-6 border-b border-[#087830]/15 pb-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#FC687D]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-900 md:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function FlavorPills({ items }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-[#087830]/15 bg-white/75 px-3 py-1.5 text-xs text-slate-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PackageCard({ pkg }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-white/70 bg-white/78 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:bg-white/90">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#087830]">
          {pkg.name}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">
            {pkg.label || pkg.cups}
          </h3>
          <p className="text-2xl font-semibold text-[#FC687D]">{pkg.price}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {pkg.meta.map((item) => (
          <p
            key={item}
            className="rounded-2xl bg-[#087830]/8 px-4 py-2 text-sm text-slate-700"
          >
            {item}
          </p>
        ))}
      </div>

      <div className="mt-5 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Includes
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {pkg.includes.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#087830]">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {pkg.flavors ? <FlavorPills items={pkg.flavors} /> : null}
    </article>
  );
}

export default function EventCartPage() {
  return (
    <div
      className="juja-page-bg flex min-h-screen flex-col bg-transparent pb-16 pt-24 md:pt-28 lg:h-screen lg:overflow-hidden lg:pb-0"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Nav active="event-cart" />

      <main className="relative min-h-0 flex-1 px-4 pb-12 sm:px-6 lg:overflow-y-auto lg:px-10">
        <section className="mx-auto grid max-w-7xl items-center gap-8 rounded-[34px] border border-white/65 bg-white/62 p-5 shadow-[0_24px_55px_rgba(15,23,42,0.10)] backdrop-blur-md sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#FC687D]">
              JUJA Brew &amp; Bites Event Service
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Event Cart
            </h1>
            <p className="mt-4 text-lg font-medium text-[#087830]">
              Coffee Cart · Drink Cart · Picapica Packages
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-8 text-slate-700">
              Bring JUJA to your celebration with mobile cart packages for milk
              tea, premium drinks, espresso-based iced coffee, and party snacks.
              Built for birthdays, weddings, corporate events, school events,
              debuts, private parties, and family gatherings.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href="tel:09399228383"
                className="rounded-full bg-[#087830] px-7 py-3.5 text-center text-xs font-semibold uppercase tracking-widest text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-[#076a2b]"
              >
                Call 0939-922-8383
              </a>
              <a
                href="https://fb.com/jujabrewandbites"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[#087830]/30 bg-white/80 px-7 py-3.5 text-center text-xs font-semibold uppercase tracking-widest text-[#087830] transition hover:-translate-y-0.5 hover:bg-white"
              >
                Message Us
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <img
              src="/images/event-cart-milk-tea.jpg"
              alt="Juja Milk Tea Package poster"
              className="h-full max-h-[520px] w-full rounded-[28px] object-cover shadow-[0_20px_45px_rgba(15,23,42,0.16)]"
            />
            <img
              src="/images/event-cart-picapica.jpg"
              alt="Juja Picapica Package poster"
              className="h-full max-h-[520px] w-full rounded-[28px] object-cover shadow-[0_20px_45px_rgba(15,23,42,0.16)]"
            />
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-7xl rounded-[34px] border border-white/65 bg-white/62 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-8">
          <SectionHeading
            eyebrow="Drink Cart Packages"
            title="Milk Tea · Premium Milk Tea · Coffee"
            subtitle="Choose from 100, 150, and 200-cup packages. Each package includes mobile drink cart setup, custom cup stickers, trained service staff, and complete serving supplies."
          />

          <div className="space-y-10">
            {drinkPackages.map((group) => (
              <div key={group.group}>
                <h3 className="mb-4 rounded-full border border-[#087830]/20 bg-white/70 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#087830]">
                  {group.group}
                </h3>
                <div className="grid gap-5 lg:grid-cols-3">
                  {group.items.map((pkg) => (
                    <PackageCard key={`${group.group}-${pkg.name}`} pkg={pkg} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-7xl rounded-[34px] border border-white/65 bg-white/62 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-8">
          <SectionHeading
            eyebrow="Coffee Cart Packages"
            title="Premium Iced Coffee · Espresso-Based Drinks"
            subtitle="Coffee cart packages include iced coffee service, mobile cart setup, custom cup stickers, staff, cups, straws, ice, and setup before the event."
          />

          <div className="grid gap-5 lg:grid-cols-3">
            {coffeePackages.map((pkg) => (
              <PackageCard key={pkg.name} pkg={pkg} />
            ))}
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/70 bg-white/78 p-5 backdrop-blur-md">
              <h3 className="text-xl font-semibold text-slate-900">
                Suggested Coffee Flavors
              </h3>
              <FlavorPills items={coffeeFlavors} />
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/78 p-5 backdrop-blur-md">
              <h3 className="text-xl font-semibold text-slate-900">
                Premium Coffee Upgrade
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                Add ₱2,000 to ₱4,000 depending on cup quantity if you want to
                offer more premium coffee choices.
              </p>
              <FlavorPills items={premiumCoffeeFlavors} />
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[34px] border border-white/65 bg-white/62 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-8">
            <SectionHeading eyebrow="Picapica" title="Picapica Package" />
            <p className="text-4xl font-semibold text-[#FC687D]">₱9,999</p>
            <div className="mt-5 grid gap-2 text-sm text-slate-700">
              {[
                "100 servings",
                "2 hours service time",
                "10 varieties to choose from",
              ].map((item) => (
                <p key={item} className="rounded-2xl bg-white/75 px-4 py-2">
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-white/65 bg-white/62 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-8">
            <SectionHeading eyebrow="Optional" title="Add-ons" />
            <div className="grid gap-2 sm:grid-cols-2">
              {addOns.map((item) => (
                <p
                  key={item}
                  className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm text-slate-700"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
