export function gcPaymentBreakdown(total, certificateCount, payments = []) {
  const cents = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid payment amount.");
    return Math.round(amount * 100);
  };
  const totalCents = cents(total);
  if (!Number.isInteger(certificateCount) || certificateCount < 1 || certificateCount > 100) throw new Error("Choose between 1 and 100 certificates.");
  const gcCents = certificateCount * 10000;
  if (gcCents > totalCents) throw new Error("Certificate value cannot exceed the bill.");
  const rows = payments.map((p) => ({ method: String(p.method || "").trim(), amount: cents(p.amount) }));
  if (rows.some((p) => !p.method || p.method === "JUJA e-GC")) throw new Error("Select a payment method for the remaining balance.");
  const due = totalCents - gcCents;
  const tender = rows.reduce((sum, p) => sum + p.amount, 0);
  if (tender < due) throw new Error("Payment does not cover the remaining balance.");
  const cash = rows.filter((p) => p.method.toLowerCase() === "cash").reduce((sum, p) => sum + p.amount, 0);
  let over = tender - due;
  if (over > cash) throw new Error("Only cash overpayment can receive change. Enter the exact amount for other payments.");
  const change = over;
  const applied = rows.map((p) => {
    const deduction = p.method.toLowerCase() === "cash" ? Math.min(over, p.amount) : 0;
    over -= deduction;
    return { method: p.method, amount: (p.amount - deduction) / 100 };
  }).filter((p) => p.amount > 0);
  return { payments: [{ method: "JUJA e-GC", amount: gcCents / 100 }, ...applied], gcCashTendered: cash / 100, gcCashChange: change / 100 };
}
