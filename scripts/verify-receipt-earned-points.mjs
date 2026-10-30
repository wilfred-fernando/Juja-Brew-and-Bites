import assert from 'node:assert/strict';
import { receiptPointsEarned } from '../lib/loyalty/receiptPoints.mjs';

for (const order of [{ total: 3281 }, { loyalty_points_awarded: null, total: 3281 }, { loyalty_points_awarded: '' },
  { loyaltyPointsAwarded: null, raw: { loyalty_points_awarded: null } }, { loyalty_points_awarded: 'invalid' },
  { loyalty_points_awarded: -5 }]) assert.equal(receiptPointsEarned(order), 0);
assert.equal(receiptPointsEarned({ loyalty_points_awarded: '12.34' }), 12.34);
assert.equal(receiptPointsEarned({ loyaltyPointsAwarded: 0, raw: { loyalty_points_awarded: 12 } }), 0);
assert.equal(receiptPointsEarned({ raw: { points_earned: 5.25 } }), 5.25);
for (const label of ['VIP Booking booking-id', 'VIP ROOM 1', 'Function Room', 'Reservation Fee']) {
  assert.equal(receiptPointsEarned({ dining_option: label, loyalty_points_awarded: 40 }), 0);
  assert.equal(receiptPointsEarned({ orderType: label, raw: { loyalty_points_awarded: 40 } }), 0);
}
assert.equal(receiptPointsEarned({ raw: { source_metadata: { exclude_loyalty: true }, points_earned: 40 } }), 0);
assert.equal(receiptPointsEarned({ raw: { source_metadata: { booking_id: 'dhoren-booking' } }, net: 2281 }), 0);
console.log('Receipt display uses recorded awards only; null/missing/invalid/zero awards show zero; room/reservation receipts always show zero; ordinary recorded awards retained.');
