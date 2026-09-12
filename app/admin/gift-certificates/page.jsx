import BookingGiftCertificates from "@/components/BookingGiftCertificates";

export default function GiftCertificatePurchasesPage() {
  return <main className="p-4 sm:p-6"><h1 className="text-2xl font-semibold">e-GC purchases</h1>
    <p className="mt-2 text-sm text-slate-600">Verify payment and customer details before approving. Purchased certificates are valid for six months from creation.</p>
    <BookingGiftCertificates source="purchase" />
  </main>;
}
