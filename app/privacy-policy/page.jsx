import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | JUJA Brew & Bites",
  description: "Privacy policy for JUJA Brew & Bites websites and the JujaBot Messenger assistant.",
};

const sections = [
  {
    title: "Information we receive",
    content: "When you message our Facebook Page, Meta may provide your Page-scoped Messenger identifier, public profile name, first name, language or timezone information, message text, attachments, postbacks, and delivery-related event data. If you use our ordering, booking, loyalty, or contact services, we may also receive the information you submit, such as contact, order, reservation, and payment-status details.",
  },
  {
    title: "How we use information",
    content: "We use this information to answer questions through JujaBot, personalize replies, route conversations to our Live Chat team, prevent duplicate messages, maintain conversation context, provide customer support, process requested services, protect our systems, and comply with applicable obligations. Automated replies may use current menu and function-room information from our business database.",
  },
  {
    title: "AI-assisted replies",
    content: "Message text and limited conversation context may be sent securely to OpenAI to generate a response. We do not send payment card numbers, government identification, raw Messenger access tokens, or unrelated booking-customer records to the AI service. A Live Chat agent can take over a conversation, and automated replies pause for two hours after the agent responds.",
  },
  {
    title: "Service providers and disclosure",
    content: "We may use service providers including Meta, OpenAI, Supabase, Vercel, payment providers, delivery providers, and storage or email services where necessary to operate the requested service. We do not sell personal information. We may disclose information when required by law, to protect users or our business, or during a legitimate business transfer subject to appropriate safeguards.",
  },
  {
    title: "Retention and security",
    content: "We retain information only for as long as reasonably necessary for customer service, transaction records, security, dispute handling, and legal or accounting requirements. We use reasonable administrative and technical safeguards, but no internet service can guarantee absolute security.",
  },
  {
    title: "Your choices and rights",
    content: "You may stop messaging the Page at any time, request human assistance, or ask us to access, correct, or delete personal information, subject to applicable legal exceptions. You may also manage Facebook permissions and messages through your Meta account settings.",
  },
  {
    title: "Children",
    content: "Our services are not directed to children under 13, and we do not knowingly collect personal information from children under 13 without appropriate authorization.",
  },
  {
    title: "Policy updates",
    content: "We may update this policy when our services or legal obligations change. The revised date shown here indicates the latest version.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">JUJA Brew & Bites</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-500">Effective and last updated: August 20, 2026</p>
        <p className="mt-8 leading-7 text-slate-700">
          JUJA Brew & Bites (collectively “JUJA,” “we,” “our,” or “us”) respects your privacy. This policy explains how we handle information through our websites, customer services, Facebook Pages, and the JujaBot Messenger assistant.
        </p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-700">{section.content}</p>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl bg-sky-50 p-6">
          <h2 className="text-xl font-bold text-slate-900">Contact and deletion requests</h2>
          <p className="mt-3 leading-7 text-slate-700">
            Email <a className="font-semibold text-sky-700 underline" href="mailto:jujabrewandbites@gmail.com">jujabrewandbites@gmail.com</a> for privacy questions or requests. For deletion steps, visit our <Link className="font-semibold text-sky-700 underline" href="/data-deletion">Data Deletion Instructions</Link>.
          </p>
        </section>

        <div className="mt-10 border-t border-slate-200 pt-6">
          <Link className="font-semibold text-sky-700 hover:underline" href="/">← Back to JUJA Brew & Bites</Link>
        </div>
      </article>
    </main>
  );
}
