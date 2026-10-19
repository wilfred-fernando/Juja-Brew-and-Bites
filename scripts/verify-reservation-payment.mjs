import assert from 'node:assert/strict';
import { reservationPayment, reservationCollectionSummary, withVipBookingOption } from '../lib/bookings/reservationPayment.mjs';
assert.deepEqual(reservationPayment(5000,1000,[{method:'Cash',amount:4000}]), [
  {method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:4000},
]);
assert.deepEqual(reservationPayment(1000,1000),[{method:'Reservation Fee Applied',amount:1000}]);
assert.deepEqual(reservationPayment(1000.01,1000,[{method:'QRPH',amount:0.01}]),[
  {method:'Reservation Fee Applied',amount:1000},{method:'QRPH',amount:0.01},
]);
assert.throws(()=>reservationPayment(999,1000),/cover/);
assert.throws(()=>reservationPayment(5000,1000,[{method:'Cash',amount:5000}]),/remaining/);
assert.throws(()=>reservationPayment(5000,1000,[{method:'JUJA e-GC',amount:4000}]),/Use Cash/);
assert.deepEqual(reservationPayment(5000,1000,[{method:'Cash',amount:2500},{method:'Cash',amount:2000}],500),[
  {method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:2000},{method:'Cash',amount:2000},
]);
assert.throws(()=>reservationPayment(5000,1000,[{method:'QRPH',amount:4500}],500),/cash tendered/);
assert.deepEqual(reservationCollectionSummary([{payment_method:'Cash',amount:1000},{payment_method:'Card',amount:500}]),
  {total:1500,cash:1000,payments:{Cash:1000,Card:500,QRPH:0}});
assert.equal(withVipBookingOption(withVipBookingOption([])).length,1);
console.log('Reservation payment math passed: split, full credit, cent rounding, overpayment, invalid method, and collections.');
