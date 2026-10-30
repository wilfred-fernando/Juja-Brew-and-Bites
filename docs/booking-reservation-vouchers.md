# VIP booking reservation credits

Admin manual booking creation has an explicit **Payment Status: Pending / Approved** selector, separate from the booking status. Waived fees keep their waived status. Confirmed upcoming bookings with pending payment also have a separate **Save payment** control on their booking card. Explicit approval records the positive fee in the branch's open shift once; a closed shift rolls the entire approval back. Repeated approval and schedule/extension-only edits do not create another receipt. Previously issued historical-credit vouchers remain voucher-only. Paid reservations cannot be reset to Pending through this control; use the reversal process instead. Saving payment status does not send or resend a customer email.

Cashier-created bookings start pending Admin approval. Admin receives the new-booking email; the customer receives confirmation only after approval, or a rejection email after rejection. Approval creates the reservation-fee receipt in the open branch shift. Pending and rejected cashier requests do not create a sale. Email delivery failures are reported without undoing the saved booking or decision. Existing bookings are not reclassified by this change.

## Cashier flow

1. Open an online POS shift. Select **VIP Booking** as the dining option.
2. Choose a confirmed booking by customer, date, time and package. Pending, past (ended), expired,
   cancelled and already-settled bookings cannot be charged through this flow.
3. Approving a positive paid reservation fee now automatically creates its normal numbered POS receipt and booking voucher in the branch’s open shift. Unpaid/waived fees do not create sales. If a confirmed fee has not yet been received, select Cash, Card or QRPH and choose
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

- The original collection appears in ordinary Sales and Receipts as **Reservation Fee**, with a normal receipt number, voucher reference and actual payment method.
- Shift summaries and Admin shift details show reservation collections separately.
  Cash collections enter expected drawer cash. Card and QRPH enter their collection
  channels. Shift closure refreshes the ledger values at the database boundary.
- The reservation fee is recognized on its own receipt. The final receipt recognizes only the remaining amount, and retains the full bill and reservation credit for printing/reprints. A PHP 1,000 fee plus a PHP 4,000 remaining bill therefore records PHP 5,000 across both receipts.
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
- `20261019120000_booking_fee_receipts.sql`

After live database installation has been authorized, run
`node scripts/apply-reservation-vouchers.cjs --apply`, deploy the frontend and fully
reopen POS. Installing migrations alone does not update the hosted POS interface.

Local payment-math checks: `node scripts/verify-reservation-payment.mjs`.

For the current receipt flow use `node scripts/verify-booking-fee-receipts.cjs` before installation, or add `--installed` after installation. It checks approval, receipt generation, sales recognition, cash/QRPH, retries, cancellation certificates and full-credit final bills.

`node scripts/verify-vip-booking-render.cjs --selected` renders the actual POS VIP selection branch through React without network/native effects.

The original baseline verifier `node scripts/verify-reservation-vouchers.cjs` installs the
definitions and exercises real tables inside a single rolled-back transaction.
It leaves no bookings, shifts, payments, vouchers or receipts behind. After
installation, use `--installed` to exercise installed definitions without
attempting to recreate the tables. Both forms require `DATABASE_URL` and perform
only rollback-based fixture verification.

To install the receipt follow-up after the base migrations, run `node scripts/apply-booking-fee-receipts.cjs --apply`. Only add `--repair-booking <UUID>` for a specific audited booking approved today whose receipt is missing. The helper is idempotent and does not bulk-convert older bookings. Approval requires an online open shift in the booking branch; if none exists, approval rolls back with a clear error.

VIP Booking purchases, reservation-fee receipts and final bills do not earn loyalty points, even when a loyalty customer is attached. The database award RPC returns the member unchanged for these receipts.
