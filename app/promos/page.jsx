import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Coffee } from "lucide-react";
import { PublicNav as Nav } from "@/components/PublicNav";
import { PublicFooter as Footer } from "@/components/PublicFooter";
import CommunityPromoBanners from "@/components/CommunityPromoBanners";

export default function PromoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#faf8f4] text-stone-900">
      <Nav active="promo" />
      <main className="flex-1 px-4 pb-16 pt-32 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-800">A little more to love at JUJA</p>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Good food.<br />Even sweeter perks.</h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-stone-600">Your next coffee break comes with a little extra. Explore our in-store offers and make your JUJA visit a treat.</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-900"><BadgeCheck size={16} aria-hidden="true" /> Bring your valid ID. We’ll take care of the rest.</div>
          </header>
          <CommunityPromoBanners detailed />
          <section className="mt-10 flex flex-col items-start justify-between gap-6 rounded-3xl bg-[#163c30] p-7 text-white sm:flex-row sm:items-center sm:p-9" aria-label="Plan your JUJA visit">
            <div>
              <Coffee className="mb-3 text-emerald-200" size={26} aria-hidden="true" />
              <h2 className="text-2xl font-semibold text-white">Make a little time for a treat.</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-100">Find your next favorite before dropping by.</p>
            </div>
            <Link href="/menu" className="inline-flex shrink-0 items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold !text-emerald-950 transition hover:bg-emerald-100">Explore the menu <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </section>
          <p className="mt-7 text-center text-sm text-stone-500">A treat worth sharing. <Link href="/gift-certificates" className="font-semibold text-emerald-800 underline underline-offset-4">Discover JUJA e-Gift Certificates</Link></p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
