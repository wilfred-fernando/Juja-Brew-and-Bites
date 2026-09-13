export function certificateState(certificate, now = Date.now()) {
  const batch = certificate.booking_gc_batches;
  if (batch?.status === "rejected") return "rejected";
  if (certificate.status === "redeemed") return "redeemed";
  if (new Date(batch?.expires_at).getTime() <= now) return "expired";
  if (batch?.status === "approved" && certificate.status === "active") return "available";
  return "pending_approval";
}

export function monitorCertificates(certificates, { search = "", source = "", status = "", email = "", page = 1 } = {}, now = Date.now()) {
  const totals = { total: 0, available: 0, pending_approval: 0, redeemed: 0, expired: 0, rejected: 0 };
  const values = { ...totals };
  const query = search.trim().toLowerCase();
  const rows = certificates.map(certificate => ({ ...certificate, state: certificateState(certificate, now) })).filter(certificate => {
    const batch = certificate.booking_gc_batches;
    return (!source || (batch?.purchase_id ? "purchase" : "booking") === source)
      && (!email || batch?.email_status === email)
      && (!query || [certificate.code, batch?.customer_name, batch?.customer_email, batch?.booking_id, batch?.purchase_id].some(value => String(value || "").toLowerCase().includes(query)));
  });
  for (const row of rows) {
    totals.total++; totals[row.state]++;
    values.total += Number(row.amount); values[row.state] += Number(row.amount);
  }
  const filtered = rows.filter(row => !status || row.state === status);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(pages, Math.max(1, Number(page) || 1));
  return { rows: filtered.slice((currentPage - 1) * 25, currentPage * 25), totals, values, count: filtered.length, page: currentPage, pages };
}
