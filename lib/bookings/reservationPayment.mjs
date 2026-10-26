export const RESERVATION_PAYMENT = 'Reservation Fee Applied';
export function bookingPaymentMethod(value) {
  const name = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name === 'cash') return 'Cash';
  if (name === 'card') return 'Card';
  if (name === 'gcash') return 'Gcash';
  if (name === 'qrph' || name === 'qrphbukupay' || name === 'qrphgrabpay') return 'QRPH';
  return '';
}
export const VIP_BOOKING_OPTION = { id: '__vip_booking', name: 'VIP Booking', is_active: true };
export function withVipBookingOption(options = []) {
  return options.some(option => option.name === 'VIP Booking') ? options : [...options, VIP_BOOKING_OPTION];
}
export function reservationPayment(bill, credit, payments = [], cashChange = 0) {
  const cents = value => Math.round(Number(value) * 100);
  const total = cents(bill), applied = cents(credit);
  if (!Number.isFinite(total) || !Number.isFinite(applied) || applied < 0 || total < applied) {
    throw new Error('The final bill must cover the reservation voucher in full.');
  }
  let remainingChange = cents(cashChange);
  if (!Number.isFinite(remainingChange) || remainingChange < 0) throw new Error('Invalid cash change.');
  const entries = payments.filter(payment => Number(payment.amount) > 0)
    .map(payment => {
      const amount = cents(payment.amount);
      const method = bookingPaymentMethod(payment.method);
      if (!method) throw new Error('Use Cash, Card, QRPH, or Gcash for the remaining booking balance.');
      const change = method === 'Cash' ? Math.min(remainingChange, amount) : 0;
      remainingChange -= change;
      return { method, amount: (amount - change) / 100 };
    }).filter(payment => payment.amount > 0);
  if (remainingChange) throw new Error('Change must come from cash tendered.');
  if (entries.some(payment => !['Cash', 'Card', 'QRPH', 'Gcash'].includes(payment.method))) {
    throw new Error('Use Cash, Card, QRPH, or Gcash for the remaining booking balance.');
  }
  if (entries.reduce((sum, payment) => sum + cents(payment.amount), 0) !== total - applied) {
    throw new Error('Payment amounts must equal the remaining booking balance.');
  }
  return [...(applied ? [{ method: RESERVATION_PAYMENT, amount: applied / 100 }] : []), ...entries];
}
export function reservationCollectionSummary(rows = []) {
  const payments = { Cash: 0, Card: 0, QRPH: 0 };
  for (const row of rows) payments[row.payment_method] = (payments[row.payment_method] || 0) + Number(row.amount || 0);
  return { total: Object.values(payments).reduce((sum, value) => sum + value, 0), cash: payments.Cash, payments };
}

export function reservationQrphCollected(summary = {}) {
  if (Array.isArray(summary.reservationCollections)) {
    return reservationCollectionSummary(summary.reservationCollections).payments.QRPH;
  }
  return Number(summary.reservationQrphCollected ?? summary.reservationCollectionPayments?.QRPH ?? 0);
}
