export function validateGcPurchase(input, userId, publicStorageUrl) {
  const data = {
    request_key: String(input.request_key || ""),
    customer_name: String(input.customer_name || "").trim(),
    customer_email: String(input.customer_email || "").trim().toLowerCase(),
    quantity: Number(input.quantity), source: input.source,
    store_id: input.source === "pos" ? String(input.store_id || "") : null,
    payment_method: input.payment_method, payment_proof_url: null,
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.request_key)) throw new Error("Invalid purchase reference.");
  if (data.customer_name.length < 2 || data.customer_name.length > 150 || /[\r\n\x00-\x1f]/.test(data.customer_name)) throw new Error("Enter the customer's full name (2–150 characters).");
  if (data.customer_email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(data.customer_email)) throw new Error("Enter a valid customer email address.");
  if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 10) throw new Error("Choose 1–10 certificates per purchase.");
  if (!["website", "pos"].includes(data.source)) throw new Error("Invalid purchase channel.");
  if (!["Cash", "QRPH"].includes(data.payment_method) || (data.source === "website" && data.payment_method !== "QRPH")) throw new Error("Choose an available payment method.");
  if (data.source === "pos" && !data.store_id) throw new Error("Select a POS branch first.");
  if (data.payment_method === "Cash" && input.cash_received !== true) throw new Error("Confirm that the full cash payment was received.");
  if (data.payment_method === "QRPH") {
    if (!publicStorageUrl) throw new Error("Payment proof storage is not configured.");
    const base = new URL(publicStorageUrl.replace(/\/+$/, "") + "/");
    const proof = new URL(String(input.payment_proof_url || ""));
    if (proof.origin !== base.origin || proof.username || proof.password || proof.search || proof.hash ||
      !proof.pathname.startsWith(`${base.pathname}payment-proofs/${userId}/`) ||
      !/\.(jpg|jpeg|png|webp|pdf)$/i.test(proof.pathname)) throw new Error("Upload your payment proof using this form.");
    data.payment_proof_url = proof.href;
  }
  return data;
}
