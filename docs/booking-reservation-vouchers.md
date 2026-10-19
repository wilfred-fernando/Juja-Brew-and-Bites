# VIP booking reservation credits

## Cashier flow

1. Open an online POS shift. Select **VIP Booking** as the dining option.
2. Choose a confirmed booking by customer, date, time and package. Pending,
   cancelled and already-settled bookings cannot be charged through this flow.
3. If the fee has not been recorded, select Cash, Card or QRPH and choose
   **Record fee & issue voucher**. Confirm only payments actually received or
   verified in this shift. The booking's configured reservation amount is used.
4. Add the complete final bill to the POS ticket. Saving the ticket preserves its
   booking reference. A saved VIP ticket keeps its selected booking.
5. Charge the ticket. Payment shows the full bill, reservation credit and remaining
   amount to collect. The bill printout and final receipt also show the credit.

Example: a PHP 5,000 final bill with a PHP 1,000 reservation voucher collects
PHP 4,000 at checkout. Checkout atomically saves the sale and items, consumes the
reservation credit and completes any applicable loyalty-voucher/discount claims.

The voucher is a private booking payment credit, not a transferable promotional
voucher or cancellation e-GC. Each booking has at most one collection and one final
settlement. Retrying a collection or the same checkout does not issue credit twice.

## Reporting

- The original collection appears in that shift's activity as **Reservation Fee
  Collected**, with its voucher reference and actual payment method.
- Shift summaries and Admin shift details show reservation collections separately.
  Cash collections enter expected drawer cash. Card and QRPH enter their collection
  channels. Shift closure refreshes the ledger values at the database boundary.
- Merchandise sales revenue is recorded on the full final bill. The original fee
  collection is not inserted as another merchandise sale.
- The final receipt payment split shows **Reservation Fee Applied** separately from
  new Cash/Card/QRPH/Gcash payment. Finance excludes that credit from new receivables
  and includes the original fee on its collection day.

## Boundaries

- Online operation and an online open shift are required for collection/settlement.
- There is no automatic historical conversion or bulk issuance. Previously counted
  fees must not be recorded again as new collections; historical reconciliation
  needs a separate reviewed process.
- Waived/zero fees provide no credit. The final bill must cover a positive voucher
  completely; no voucher cash change or partial carry-forward is supported.
- The remaining balance supports Cash, Card, QRPH and Gcash, including splits.
  Combining this flow with transferable e-GCs is not supported.
- Unsettled cancellations retain the existing approval/e-GC process. A settled
  booking cannot also cancel/convert its fee into another certificate.
- Ordinary POS refunds and Admin financial receipt edits are blocked for these
  settled receipts. A dedicated booking-payment reversal workflow is not included.

## Installation and validation

New migrations:

- `20261019090000_booking_reservation_vouchers.sql`
- `20261019091000_reservation_shift_collections.sql`

After live database installation has been authorized, run
`node scripts/apply-reservation-vouchers.cjs --apply`, deploy the frontend and fully
reopen POS. Installing migrations alone does not update the hosted POS interface.

Local payment-math checks: `node scripts/verify-reservation-payment.mjs`.

Before installation, `node scripts/verify-reservation-vouchers.cjs` installs the
definitions and exercises real tables inside a single rolled-back transaction.
It leaves no bookings, shifts, payments, vouchers or receipts behind. After
installation, use `--installed` to exercise installed definitions without
attempting to recreate the tables. Both forms require `DATABASE_URL` and perform
only rollback-based fixture verification.
