import Link from "next/link";

export const metadata = {
  title: "Data Deletion Instructions | JUJA Brew & Bites",
  description: "How to request deletion of data associated with JUJA Brew & Bites and JujaBot.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">JUJA Brew & Bites</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Data Deletion Instructions</h1>
        <p className="mt-6 leading-7 text-slate-700">
          You may request deletion of personal information associated with your JUJA Brew & Bites website or Messenger interaction.
        </p>

        <ol className="mt-8 space-y-5 text-slate-700">
          <li className="rounded-2xl border border-slate-200 p-5"><strong className="text-slate-900">1. Email us.</strong><br />Send your request to <a className="font-semibold text-sky-700 underline" href="mailto:jujabrewandbites@gmail.com?subject=Data%20Deletion%20Request">jujabrewandbites@gmail.com</a> with the subject “Data Deletion Request.”</li>
          <li className="rounded-2xl border border-slate-200 p-5"><strong className="text-slate-900">2. Identify the account.</strong><br />Include the name used to contact our Facebook Page and identify whether the request concerns Messenger, an online account, or both. Do not email passwords, payment-card details, or government IDs.</li>
          <li className="rounded-2xl border border-slate-200 p-5"><strong className="text-slate-900">3. Complete verification.</strong><br />We may reply with a limited verification step so that we do not delete another person’s information.</li>
          <li className="rounded-2xl border border-slate-200 p-5"><strong className="text-slate-900">4. Receive confirmation.</strong><br />After verification, we will delete or de-identify eligible records and confirm completion. Some transaction, security, or legal records may be retained where required or permitted by law.</li>
        </ol>

        <p className="mt-8 leading-7 text-slate-700">
          You can also remove permissions or delete conversations through your Facebook or Meta account settings. This does not automatically delete records that JUJA must retain for completed transactions or legal obligations.
        </p>

        <div className="mt-10 flex flex-wrap gap-5 border-t border-slate-200 pt-6">
          <Link className="font-semibold text-sky-700 hover:underline" href="/privacy-policy">Privacy Policy</Link>
          <Link className="font-semibold text-sky-700 hover:underline" href="/">JUJA home</Link>
        </div>
      </article>
    </main>
  );
}
