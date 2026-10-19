export function reservationBookingName(receipt) {
  if (receipt?.source_metadata?.transaction_kind !== 'booking_reservation_fee') return '';
  return String(receipt.customer_name || receipt.source_metadata.reservation_booking_name || '').trim();
}

export function reservationReceiptItems(receipt, items) {
  const name = reservationBookingName(receipt);
  return name ? items.map(item => ({ ...item, instructions: 'Booking ' + name })) : items;
}
