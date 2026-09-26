export const EXPENSE_TAX_TYPES = ["Non-VAT", "VAT", "AR"];

export function expenseVatBreakdown(total, taxType) {
  const totalCents = Math.round((Number(total) || 0) * 100);
  const vatableCents = taxType === "VAT" ? Math.round(totalCents * 100 / 112) : 0;
  return {
    vatableSales: vatableCents / 100,
    vatAmount: taxType === "VAT" ? (totalCents - vatableCents) / 100 : 0,
  };
}
