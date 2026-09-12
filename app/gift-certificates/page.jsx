import Link from "next/link";
import GiftCertificatePurchaseForm from "@/components/GiftCertificatePurchaseForm";

export const metadata = { title: "Buy e-Gift Certificates | JUJA Brew & Bites" };

export default function GiftCertificatesPage() {
  return <main className="min-h-screen bg-[#fff8ef] px-4 py-10 text-stone-800">
    <div className="mx-auto max-w-xl">
      <Link href="/" className="text-sm text-green-800 underline">JUJA Brew & Bites</Link>
      <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-[#9c5b40]">A little JUJA to share</p>
      <h1 className="mt-2 text-3xl font-bold">Buy e-Gift Certificates</h1>
      <p className="mt-3 text-stone-600">₱100 each · Valid for six months from creation. Enter the customer’s full name and email, then submit payment for admin approval.</p>
      <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><GiftCertificatePurchaseForm /></div>
    </div>
  </main>;
}
