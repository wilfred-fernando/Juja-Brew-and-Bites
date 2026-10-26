export function excludesFunctionRoomLoyalty(order) {
  const metadata = order?.source_metadata || {};
  return metadata.exclude_loyalty === true || Boolean(metadata.booking_id || metadata.reservation_fee_booking_id)
    || metadata.transaction_kind === 'booking_reservation_fee'
    || [order?.dining_option, order?.order_type].some(value => /^(vip\s*(room|booking)|function\s*room|reservation\s*fee)\b/i.test(String(value || '').trim()));
}
