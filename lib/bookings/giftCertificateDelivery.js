import { cancellationGiftEmail } from "./cancellationGiftEmail.js";
import { renderGiftCertificateImage } from "./giftCertificateImage.js";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function buildGiftCertificateDelivery(batch, certificates) {
  const draft = cancellationGiftEmail(batch, certificates);
  const attachments = [];
  // Generate one at a time to bound the memory used by full-size raster images.
  for (const certificate of certificates) {
    attachments.push({
      filename: `${certificate.code}.png`, contentType: "image/png", cid: `gc-${certificate.id}@juja`,
      content: await renderGiftCertificateImage({ code: certificate.code, amount: certificate.amount, expiresAt: batch.expires_at }),
    });
  }
  const images = certificates.map((certificate) => `<p style="margin:24px 0"><img src="cid:gc-${certificate.id}@juja" alt="JUJA PHP 100 e-GC ${escapeHtml(certificate.code)}" width="680" style="display:block;width:100%;max-width:680px;height:auto"/></p>`).join("");
  return {
    subject: draft.subject,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:680px;margin:auto"><h2>Your JUJA e-Gift Certificates</h2><div style="white-space:pre-wrap">${escapeHtml(draft.text)}</div>${images}</div>`,
    attachments,
  };
}
