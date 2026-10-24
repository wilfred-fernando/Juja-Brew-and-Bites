import assert from 'node:assert/strict';
import { bookingPaymentMethod, reservationPayment } from '../lib/bookings/reservationPayment.mjs';
for (const [label, expected] of [['CASH','Cash'],['CARD','Card'],['GCASH','Gcash'],['QRPH - Bukupay','QRPH'],['QRPH - GrabPay','QRPH']]) {
  assert.equal(bookingPaymentMethod(label),expected);
  const splits=reservationPayment(3681,1000,[{method:label,amount:2681}]);
  assert.deepEqual(splits,[{method:'Reservation Fee Applied',amount:1000},{method:expected,amount:2681}]);
}
assert.deepEqual(reservationPayment(3681,1000,[{method:'CASH',amount:3000}],319),[
  {method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:2681},
]);
assert.deepEqual(reservationPayment(3681,1000,[{method:'CASH',amount:1000},{method:'QRPH - Bukupay',amount:1681}]),[
  {method:'Reservation Fee Applied',amount:1000},{method:'Cash',amount:1000},{method:'QRPH',amount:1681},
]);
for(const method of ['GIFT CERTIFICATE','GRABFOOD','SHOPEEFOOD','GRAB DINE OUT']) {
  assert.equal(bookingPaymentMethod(method),'');
  assert.throws(()=>reservationPayment(3681,1000,[{method,amount:2681}]),/Use Cash/);
}
assert.deepEqual(reservationPayment(1000,1000,[]),[{method:'Reservation Fee Applied',amount:1000}]);
console.log('PASS: configured uppercase methods, QRPH providers, cash change, split balance, excluded methods, fully covered bill');
