// expires_at is exclusive: the certificate remains valid through the previous Manila date.
export function giftCertificateValidUntil(expiresAt) {
  const cutoff = new Date(expiresAt).getTime();
  if (!Number.isFinite(cutoff)) throw new Error("Certificate expiry is missing or invalid.");
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric",
  }).format(new Date(cutoff - 1));
}
