// Redemption rows are per entitlement (food/drink/dessert), not per purchase.
export async function loadBeneficiaryUsage(admin, beneficiaryIds) {
  const receipts = new Map(beneficiaryIds.map((id) => [id, new Set()]));
  if (!beneficiaryIds.length) return new Map();
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from("pos_discount_redemptions")
      .select("beneficiary_id, receipt_number, store_id, business_date, order_id, claim_key")
      .in("beneficiary_id", beneficiaryIds).eq("status", "completed")
      .order("id").range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data || []) {
      // Receipt identity survives archiving, which clears order_id.
      const receipt = row.receipt_number
        ? JSON.stringify([row.store_id, row.business_date, row.receipt_number])
        : row.order_id || row.claim_key;
      if (receipt) receipts.get(row.beneficiary_id)?.add(receipt);
    }
    if (!data || data.length < pageSize) break;
  }
  return new Map([...receipts].map(([id, entries]) => [id, entries.size]));
}
