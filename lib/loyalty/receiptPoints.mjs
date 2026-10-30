import { excludesFunctionRoomLoyalty } from '../bookings/loyaltyEligibility.mjs';

// Receipt displays show recorded awards, never an estimate based on spending.
export function receiptPointsEarned(order) {
  if (excludesFunctionRoomLoyalty(order)) return 0;
  for (const value of [order?.loyaltyPointsAwarded, order?.loyalty_points_awarded,
    order?.raw?.loyalty_points_awarded, order?.points_earned, order?.raw?.points_earned]) {
    if (value === null || value === undefined || value === '') continue;
    const points = Number(value);
    if (Number.isFinite(points)) return Math.max(0, Math.round(points * 100) / 100);
  }
  return 0;
}
