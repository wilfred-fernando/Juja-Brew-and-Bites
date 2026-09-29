"use client";

import { PublicNav as Nav } from "@/components/PublicNav";
import { PublicFooter as Footer } from "@/components/PublicFooter";


const ABOUT_IMAGE = "https://images.jujabrewandbites.com/juja%205.png";





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

          <div className="flex flex-col justify-center text-slate-950 md:min-h-0">
            <section className="mb-7 border-b border-[#087830]/20 pb-6 md:mb-3 md:pb-3 lg:mb-4 lg:pb-4">
              
              <h1 className="mb-5 max-w-xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl md:mb-2 md:text-[clamp(1.85rem,3.2vw,3.05rem)] lg:mb-3">
                <span className="block">Welcome to</span>
                <span className="block text-[#087830]">JUJA Brew &amp; Bites®</span>
              </h1>
              <p className="mb-5 max-w-2xl text-justify text-[15px] leading-8 text-zinc-800 sm:text-base md:mb-1 md:text-xs md:leading-5 lg:mb-1 lg:text-[13px] lg:leading-6 xl:text-sm xl:leading-7">
                At JUJA Brew &amp; Bites, we believe that great food and drinks bring people together. Founded with a passion for creating memorable dining experiences, we serve a wide variety of handcrafted beverages, comfort food, and delightful snacks in a warm and welcoming environment.
              </p>
              <p className="max-w-2xl text-justify text-[15px] leading-8 text-zinc-800 sm:text-base md:text-xs md:leading-5 lg:text-[13px] lg:leading-6 xl:text-sm xl:leading-7">
                Whether you&apos;re stopping by for your daily coffee, enjoying our milk tea selections, sharing a meal with friends, or celebrating a special occasion, our goal is to provide quality products and exceptional service every time you visit.
              </p>
            </section>

            <div className="space-y-6 md:space-y-2.5 lg:space-y-2">
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
                  <h2 className="mb-2 text-2xl font-semibold leading-tight text-slate-950 sm:text-[1.7rem] md:mb-1 md:text-[1.05rem] lg:mb-1.5 lg:text-lg xl:text-xl">
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
