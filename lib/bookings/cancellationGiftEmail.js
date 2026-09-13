import { giftCertificateValidUntil } from "./giftCertificateDates.js";

export function cancellationGiftEmail(batch, certificates) {
  if (!batch.purchase_id) return bookingCancellationEmail(batch, certificates);
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


function bookingCancellationEmail(batch, certificates) {
  const money = value => `₱${Number(value).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
  const validUntil = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(new Date(batch.expires_at).getTime() - 1));
  const markdown = `Hi ${batch.customer_name || "Customer"},

Your **JUJA Brew & Bites® function room booking** with Booking Reference **${batch.booking_id}** has been successfully cancelled.

Your **${money(batch.amount)} reservation fee** has been converted into **${certificates.length} JUJA e-Gift Certificates worth ₱100 each**, as approved by our admin team.

### Your JUJA e-Gift Certificates

${certificates.map(gc => `${gc.code} — **₱100**`).join("\n")}

**Total e-Gift Certificate Value:** ${money(batch.amount)}
**Valid Until:** ${validUntil}

Your individual e-Gift Certificate images are included below. Please open or save the full-size images so the barcode can be scanned properly upon redemption.

### How to Redeem

Your JUJA e-Gift Certificates may be redeemed **in-store** or through **online ordering via the JUJA Customer Portal**.

For **in-store redemption**, present the **e-Gift Certificate barcode or certificate code** together with a **valid ID** to our cashier before payment.

For **online orders**, enter or apply your eligible JUJA e-Gift Certificate code during checkout through the **JUJA Customer Portal**.

Each certificate:

- Is worth **₱100**
- Can be redeemed **once only**
- Can be combined with other JUJA e-Gift Certificates up to the total amount of your bill
- Can be redeemed **in-store or through online ordering via the JUJA Customer Portal**
- Any remaining balance can be paid using an available payment method
- Cannot be exchanged or converted into cash
- Does not provide cash change for any unused amount
- **Valid ID is required for in-store redemption**

Please keep your certificate codes private and secure. If you experience any issue with your e-Gift Certificates, feel free to contact us and our team will be happy to assist you.

Thank you for choosing **JUJA Brew & Bites®**. We look forward to welcoming you again soon!

Warm regards,

**JUJA Brew & Bites®**`;
  // Escape all interpolated content before adding the template's limited formatting.
  const escaped = markdown.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const strong = value => value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const html = escaped.split("\n\n").map(block => {
    if (block.startsWith("### ")) return `<h3>${strong(block.slice(4))}</h3>`;
    if (block.startsWith("- ")) return `<ul>${block.split("\n").map(line => `<li>${strong(line.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${strong(block).replaceAll("\n", "<br />")}</p>`;
  }).join("");
  return { subject: "Your JUJA e-Gift Certificates", text: markdown.replaceAll("**", "").replace(/^### /gm, ""), html };
}
