import GiftCertificateMonitoring from "@/components/GiftCertificateMonitoring";

export default function GiftCertificatePurchasesPage() {
  return <main className="space-y-5 p-4 sm:p-6"><h1 className="text-2xl font-semibold">e-GC monitoring</h1>
    <p className="mt-2 text-sm text-slate-600">Track purchases, approvals, email delivery and redemption. Generate unsold physical stock, download it for printing, and activate each certificate after a verified sale.</p>
    <GiftCertificateMonitoring />
  </main>;
}
