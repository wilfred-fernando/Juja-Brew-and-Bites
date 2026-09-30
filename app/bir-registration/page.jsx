import Image from "next/image";
import Link from "next/link";
import { PublicFooter } from "@/components/PublicFooter";

export const metadata = {
  title: "BIR Registration | JUJA Brew & Bites",
  description: "View JUJA Brew & Bites' BIR Registration Seal Badge.",
};

export default function BirRegistrationPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex-1 px-5 py-12 sm:px-8">
        <article className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-12">
          <Link href="/" className="text-sm font-semibold text-sky-700 hover:underline">
            Back to JUJA
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">JUJA Brew &amp; Bites</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">BIR Registration</h1>
          <p className="mt-4 leading-7 text-slate-600">
            Scan the QR code on our BIR Registration Seal Badge to verify our business registration with the Bureau of Internal Revenue.
          </p>
          <a href="/compliance/bir-registration-seal-2026.jpg" target="_blank" rel="noopener noreferrer" className="mt-8 block rounded-xl border border-slate-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700" aria-label="View the BIR Registration Seal Badge at full size in a new tab">
            <Image src="/compliance/bir-registration-seal-2026.jpg" alt="BIR Registration Seal Badge for 2026, with a QR code for business registration verification" width={1280} height={412} unoptimized className="h-auto w-full rounded-xl" />
          </a>
          <a href="/compliance/bir-registration-seal-2026.jpg" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-sky-700 underline underline-offset-4">
            View full-size badge (opens in a new tab)
          </a>
          <p className="mt-6 text-sm leading-6 text-slate-600">
            Before relying on the QR result, check that the verification address begins with https://verify.bir.gov.ph/correspondence/.
          </p>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
