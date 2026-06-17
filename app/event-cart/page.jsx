"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LOGO =
  "https://media.base44.com/images/public/69f505cc3d136c1f10ee80e0/9dedf6c22_SIGNAGElightwithkoreanletters3.png";

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

  const mobileLinks = [
    ["Home", "/"],
    ["Menu", "/menu"],
    ["Promos", "/promos"],
    ["Function Room", "/function-room"],
    ["Event Cart", "/event-cart"],
    ["About Us", "/about"],
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

        <div className="hidden items-center gap-8 md:flex">
          {links.map(([id, label, href]) => (
            <Link
              key={id}
              href={href}
              className={`group relative pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-300 lg:text-[12px] ${
                active === id
                  ? "text-[#FC687D]"
                  : "text-slate-600 hover:text-slate-900"
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

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={loginUrl}
            className="rounded-full border border-slate-200 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 transition-colors hover:border-[#FC687D] hover:text-[#FC687D]"
          >
            Login
          </Link>
        </div>

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
          {mobileLinks.map(([label, href]) => (
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
            href="/order"
            onClick={() => setOpen(false)}
            className="mt-4 rounded-full bg-[#FC687D] py-3.5 text-center text-sm font-semibold text-white"
          >
            Order Now →
          </Link>

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
            <p>📍 36D Visayas Ave., Pasong Tamo, QC</p>
            <p>📞 0939-9228383</p>
            <p className="text-[11px] text-slate-500">
              Store: 10AM–12MN · Function Room: 10AM–2AM
            </p>
          </div>
        </div>

        <div className="text-xs">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FC687D]">
            Diliman Branch
          </p>
          <div className="space-y-1 leading-relaxed text-slate-400">
            <p>📍 8 Visayas Ave., Diliman, QC</p>
            <p>📞 0961-6320909</p>
            <p className="text-[11px] text-slate-500">
              Mon-Wed: 8AM–10PM · Thu-Sat: 10AM–10PM
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

const milkTeaFlavors = [
  "Black Pearl Milk Tea",
  "Panda Milk Tea",
  "Cheesecake Milk Tea",
  "Oreo Sea Salt Milk Tea",
  "Juja Trio Milk Tea",
  "Taro Milk Tea",
];

const premiumFlavors = [
  "Oreo Sea Salt Milk Tea",
  "Cheesecake Milk Tea",
  "Milo Dinosaur",
  "Brown Sugar Milk Tea",
  "Matcha Milk Tea",
  "Juja Trio Milk Tea",
];

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

const drinkPackages = [
  {
    group: "100 Cups Packages",
    packages: [
      {
        name: "Package A — Classic Milk Tea 100",
        price: "₱14,999",
        details: ["Good for 100 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 milk tea flavors",
          "Uniformed service staff",
          "Cups, straws, ice, sinkers, and serving supplies",
        ],
        flavorsTitle: "Flavor Options",
        flavors: milkTeaFlavors,
      },
      {
        name: "Package B — Premium Milk Tea 100",
        price: "₱17,999",
        details: [
          "Good for 100 cups",
          "16oz premium drinks",
          "2 hours service time",
        ],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 premium flavors",
          "Premium sinker options",
          "Uniformed service staff",
          "Complete serving supplies",
        ],
        flavorsTitle: "Premium Flavor Options",
        flavors: premiumFlavors,
      },
      {
        name: "Package C — Milk Tea + Coffee 100",
        price: "₱18,999",
        details: ["Good for 100 cups", "16oz drinks", "2 hours service time"],
        allocation: ["50 cups Milk Tea", "50 cups Iced Coffee"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 3 milk tea flavors",
          "Choice of 3 coffee flavors",
          "Uniformed service staff",
          "Complete serving supplies",
        ],
        flavorsTitle: "Coffee Options",
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "150 Cups Packages",
    packages: [
      {
        name: "Package D — Classic Milk Tea 150",
        price: "₱20,999",
        details: ["Good for 150 cups", "16oz drinks", "2 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 5 milk tea flavors",
          "Uniformed service staff",
          "Complete serving supplies",
        ],
        flavorsTitle: "Flavor Options",
        flavors: milkTeaFlavors,
      },
      {
        name: "Package E — Premium Milk Tea 150",
        price: "₱25,999",
        details: [
          "Good for 150 cups",
          "16oz premium drinks",
          "2 hours service time",
        ],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 5 premium flavors",
          "Premium sinker options",
          "Uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavorsTitle: "Premium Flavor Options",
        flavors: premiumFlavors,
      },
      {
        name: "Package F — Milk Tea + Coffee 150",
        price: "₱26,999",
        details: ["Good for 150 cups", "16oz drinks", "2 hours service time"],
        allocation: ["75 cups Milk Tea", "75 cups Iced Coffee"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 4 milk tea flavors",
          "Choice of 4 coffee flavors",
          "Uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavorsTitle: "Coffee Options",
        flavors: coffeeFlavors,
      },
    ],
  },
  {
    group: "200 Cups Packages",
    packages: [
      {
        name: "Package G — Classic Milk Tea 200",
        price: "₱26,999",
        details: ["Good for 200 cups", "16oz drinks", "3 hours service time"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 6 milk tea flavors",
          "2 uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavorsTitle: "Flavor Options",
        flavors: milkTeaFlavors,
      },
      {
        name: "Package H — Premium Milk Tea 200",
        price: "₱33,999",
        details: [
          "Good for 200 cups",
          "16oz premium drinks",
          "3 hours service time",
        ],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 6 premium flavors",
          "Premium sinker options",
          "2 uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavorsTitle: "Premium Flavor Options",
        flavors: premiumFlavors,
      },
      {
        name: "Package I — Milk Tea + Coffee 200",
        price: "₱34,999",
        details: ["Good for 200 cups", "16oz drinks", "3 hours service time"],
        allocation: ["100 cups Milk Tea", "100 cups Iced Coffee"],
        includes: [
          "Mobile drink cart setup",
          "Custom cup stickers",
          "Choice of 5 milk tea flavors",
          "Choice of 5 coffee flavors",
          "2 uniformed service staff",
          "Free event menu display",
          "Complete serving supplies",
        ],
        flavorsTitle: "Coffee Options",
        flavors: coffeeFlavors,
      },
    ],
  },
];

const coffeePackages = [
  {
    name: "Coffee Package A — 100 Cups",
    price: "₱16,999",
    details: ["Good for 100 cups", "16oz iced coffee", "2 hours service time"],
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
    name: "Coffee Package B — 150 Cups",
    price: "₱23,999",
    details: ["Good for 150 cups", "16oz iced coffee", "2 hours service time"],
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
    name: "Coffee Package C — 200 Cups",
    price: "₱30,999",
    details: ["Good for 200 cups", "16oz iced coffee", "3 hours service time"],
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

const addOns = [
  "Additional Classic Milk Tea cups: ₱130/cup",
  "Additional Premium Milk Tea cups: ₱160/cup",
  "Additional Coffee cups: ₱160/cup",
  "Premium coffee upgrade: ₱20–₱30/cup",
  "Extra service hour: ₱1,500/hour",
  "Additional barista: ₱1,000",
  "Premium sinkers: ₱500–₱1,000",
  "Custom event menu board: ₱500",
  "Coffee machine setup upgrade: ₱2,000",
  "Travel fee: depends on event location",
];

const perfectFor = [
  "Birthdays",
  "Weddings",
  "Corporate Events",
  "School Events",
  "Private Parties",
  "Baptisms",
  "Debuts",
  "Family Celebrations",
  "Office Meetings",
  "Grand Openings",
  "Community Events",
];

function PackageCard({ pkg }) {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/60 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-[0_24px_55px_rgba(15,23,42,0.12)]">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#FC687D]">
          JUJA Event Cart
        </p>

        <h3 className="mt-2 text-2xl font-semibold text-slate-950">
          {pkg.name}
        </h3>

        <p className="mt-3 text-4xl font-semibold text-[#087830]">
          {pkg.price}
        </p>
      </div>

      <div className="mb-5 space-y-2">
        {pkg.details.map((item) => (
          <p
            key={item}
            className="rounded-full bg-white/75 px-4 py-2 text-sm text-zinc-700"
          >
            {item}
          </p>
        ))}
      </div>

      {pkg.allocation && (
        <div className="mb-5 rounded-2xl bg-[#087830]/10 p-4">
          <h4 className="mb-2 font-semibold text-slate-950">
            Suggested Allocation
          </h4>

          <ul className="space-y-1 text-sm text-zinc-700">
            {pkg.allocation.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-5">
        <h4 className="mb-2 font-semibold text-slate-950">Includes</h4>

        <ul className="space-y-2 text-sm leading-relaxed text-zinc-700">
          {pkg.includes.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>

      {pkg.flavors && (
        <div className="rounded-2xl border border-white/60 bg-white/65 p-4">
          <h4 className="mb-2 font-semibold text-slate-950">
            {pkg.flavorsTitle}
          </h4>

          <div className="flex flex-wrap gap-2">
            {pkg.flavors.map((flavor) => (
              <span
                key={flavor}
                className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs text-zinc-700"
              >
                {flavor}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoffeePackageCard({ pkg }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/15">
      <h3 className="text-2xl font-semibold">{pkg.name}</h3>

      <p className="mt-3 text-4xl font-semibold text-[#FC687D]">
        {pkg.price}
      </p>

      <div className="mt-5 space-y-2">
        {pkg.details.map((item) => (
          <p
            key={item}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white"
          >
            {item}
          </p>
        ))}
      </div>

      <div className="mt-5">
        <h4 className="mb-2 font-semibold">Includes</h4>

        <ul className="space-y-2 text-sm leading-relaxed text-slate-200">
          {pkg.includes.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function EventCartPage() {
  return (
    <div
      className="juja-page-bg flex min-h-screen flex-col bg-transparent"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Nav active="event-cart" />

      <main className="relative flex-1 overflow-hidden px-4 pb-10 pt-28 sm:px-6 md:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-white/20" />
        <div className="pointer-events-none absolute left-[-12%] top-[-10%] h-[420px] w-[420px] rounded-full bg-[#FC687D]/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[8%] right-[-12%] h-[420px] w-[420px] rounded-full bg-[#087830]/10 blur-3xl" />

        <section className="relative z-10 mx-auto max-w-7xl pb-14 pt-4">
          <div className="rounded-[34px] border border-white/60 bg-white/55 p-6 shadow-[0_24px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-8 md:p-12">
            <div className="max-w-3xl">
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.35em] text-[#FC687D]">
                JUJA Brew &amp; Bites® Event Service
              </p>

              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl md:text-6xl">
                JUJA Drink Cart Packages
              </h1>

              <p className="mt-5 text-lg font-medium leading-relaxed text-[#087830]">
                Milk Tea • Premium Milk Tea • Coffee
              </p>

              <p className="mt-5 max-w-2xl text-[15px] leading-8 text-zinc-800">
                Bring the JUJA experience to your celebration with our mobile
                drink cart packages. Perfect for birthdays, weddings, corporate
                events, school events, private parties, grand openings, and
                special gatherings.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="tel:09399228383"
                  className="rounded-full bg-[#FC687D] px-8 py-4 text-center text-sm font-semibold text-white shadow-lg shadow-[#FC687D]/25 transition hover:-translate-y-0.5 hover:bg-rose-500"
                >
                  Call 0939-922-8383
                </a>

                <a
                  href="https://fb.com/jujabrewandbites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[#087830]/30 bg-white/80 px-8 py-4 text-center text-sm font-semibold text-[#087830] transition hover:-translate-y-0.5 hover:border-[#087830] hover:bg-white"
                >
                  Message Us on Facebook
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-7xl py-8">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              "Classic Milk Tea",
              "Premium Milk Tea",
              "Milk Tea + Coffee",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[28px] border border-white/60 bg-white/55 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/75"
              >
                <h2 className="text-xl font-semibold text-slate-950">
                  {item}
                </h2>

                <p className="mt-3 text-sm leading-6 text-zinc-700">
                  Includes mobile drink cart setup, custom cup stickers,
                  service staff, and complete serving supplies.
                </p>
              </div>
            ))}
          </div>
        </section>

        {drinkPackages.map((group) => (
          <section
            key={group.group}
            className="relative z-10 mx-auto max-w-7xl py-10"
          >
            <div className="mb-7 border-b border-[#087830]/20 pb-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#FC687D]">
                Drink Cart
              </p>

              <h2 className="mt-2 text-3xl font-semibold text-slate-950 md:text-4xl">
                {group.group}
              </h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {group.packages.map((pkg) => (
                <PackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>
          </section>
        ))}

        <section className="relative z-10 mx-auto max-w-7xl py-12">
          <div className="rounded-[34px] border border-white/10 bg-slate-950/95 p-8 text-white shadow-[0_24px_55px_rgba(15,23,42,0.20)] backdrop-blur-xl md:p-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FC687D]">
              Coffee Cart
            </p>

            <h2 className="mt-3 text-4xl font-semibold md:text-5xl">
              JUJA Coffee Cart Packages
            </h2>

            <p className="mt-5 max-w-3xl leading-8 text-slate-300">
              Make your event more special with JUJA Coffee Cart. Perfect for
              morning events, meetings, weddings, corporate gatherings, private
              parties, birthdays, and celebrations that deserve café-quality
              coffee service.
            </p>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {coffeePackages.map((pkg) => (
                <CoffeePackageCard key={pkg.name} pkg={pkg} />
              ))}
            </div>

            <div className="mt-10 rounded-[28px] border border-white/60 bg-white p-6 text-slate-950">
              <h3 className="text-2xl font-semibold">Coffee Flavor Options</h3>

              <div className="mt-4 flex flex-wrap gap-2">
                {coffeeFlavors.map((flavor) => (
                  <span
                    key={flavor}
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-zinc-700"
                  >
                    {flavor}
                  </span>
                ))}
              </div>

              <h3 className="mt-8 text-2xl font-semibold">
                Premium Coffee Upgrade
              </h3>

              <p className="mt-3 text-sm leading-7 text-zinc-700">
                Upgrade your coffee cart with more premium flavors for an
                additional ₱2,000 to ₱4,000, depending on cup quantity and
                selected drinks.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {premiumCoffeeFlavors.map((flavor) => (
                  <span
                    key={flavor}
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-zinc-700"
                  >
                    {flavor}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 mx-auto grid max-w-7xl gap-6 py-10 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/60 bg-white/55 p-8 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <h2 className="text-3xl font-semibold text-slate-950">
              Optional Add-ons
            </h2>

            <ul className="mt-6 space-y-3 text-zinc-700">
              {addOns.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-[28px] border border-white/60 bg-white/55 p-8 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <h2 className="text-3xl font-semibold text-slate-950">
              Perfect For
            </h2>

            <div className="mt-6 flex flex-wrap gap-2">
              {perfectFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/70 bg-white/75 px-4 py-2 text-sm text-zinc-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 mx-auto max-w-7xl py-12">
          <div className="rounded-[34px] border border-white/60 bg-white/65 p-8 text-center shadow-[0_24px_55px_rgba(15,23,42,0.10)] backdrop-blur-xl md:p-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#FC687D]">
              Book Your Event Cart
            </p>

            <h2 className="mt-3 text-4xl font-semibold text-slate-950 md:text-5xl">
              Book JUJA Drink Cart
            </h2>

            <p className="mx-auto mt-5 max-w-2xl leading-8 text-zinc-700">
              Make your event more exciting with JUJA Brew &amp; Bites. Book
              early to secure your preferred event date.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="tel:09399228383"
                className="rounded-full bg-[#FC687D] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#FC687D]/25 transition hover:-translate-y-0.5 hover:bg-rose-500"
              >
                Call 0939-922-8383
              </a>

              <a
                href="https://fb.com/jujabrewandbites"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[#087830]/30 bg-white/80 px-8 py-4 text-sm font-semibold text-[#087830] transition hover:-translate-y-0.5 hover:border-[#087830] hover:bg-white"
              >
                fb.com/jujabrewandbites
              </a>
            </div>

            <div className="mt-8">
              <Link
                href="/"
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}