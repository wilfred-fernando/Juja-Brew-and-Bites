import { giftCertificateValidUntil } from "./giftCertificateDates.js";

export function cancellationGiftEmail(batch, certificates) {
  const subject = 'Your JUJA e-Gift Certificates';
  const text = `Hi ${batch.customer_name || 'Customer'},

${batch.purchase_id ? `Your e-GC purchase (${batch.purchase_id}) has been approved. You purchased ${certificates.length} JUJA e-Gift Certificates worth PHP 100 each.` : `Your function room booking (${batch.booking_id}) has been cancelled. Your reservation fee of PHP ${Number(batch.amount).toLocaleString('en-PH')} has been converted into ${certificates.length} JUJA e-Gift Certificates worth PHP 100 each, approved by our admin team.`}

Your e-Gift Certificates:
${certificates.map((gc) => `${gc.code} — PHP 100`).join('\n')}

Total certificate value: PHP ${Number(batch.amount).toLocaleString('en-PH')}
Valid until: ${giftCertificateValidUntil(batch.expires_at)} (Philippine time)

Your individual certificate images are included below. Open or save the full-size image to scan its barcode.

Please present this email and your certificate codes to our team when redeeming at JUJA Brew & Bites. Each certificate can be used once for PHP 100 at POS. Apply certificates up to your bill total and pay any remaining balance using an available payment method. Certificates cannot be exchanged for cash and do not give cash change. Keep your codes private and contact us if you need help with your certificates.

We look forward to welcoming you again!

JUJA Brew & Bites`;
  return { subject, text };
}
