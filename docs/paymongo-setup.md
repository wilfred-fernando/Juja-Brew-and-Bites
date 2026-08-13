# PayMongo Payments

The customer portal supports PayMongo Checkout for function-room reservation fees and online food orders.

## Required Vercel variables

Add these as server-only variables for Production, Preview, and Development as needed:

```text
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_WEBHOOK_SECRET=whsk_...
PAYMONGO_PAYMENT_METHODS=card,gcash,paymaya,qrph
```

Do not prefix either secret with `NEXT_PUBLIC_` and do not commit the values to Git.

Use test keys first. Replace `PAYMONGO_SECRET_KEY` and the webhook secret with live values only after the test checkout, webhook, and order-release flows pass.

## Webhook

1. Deploy the application so the webhook route is publicly available.
2. In the PayMongo dashboard, create a webhook for `checkout_session.payment.paid`.
3. Set the webhook URL to:

```text
https://customer.jujabrewandbites.com/api/payments/paymongo/webhook
```

4. Copy the webhook signing secret into `PAYMONGO_WEBHOOK_SECRET` and redeploy.

The webhook verifies the raw payload signature, rejects stale signatures, validates the paid amount against the local payment ledger, and records every event for idempotent processing.

## Expected behavior

- Booking: the customer pays the reservation fee, the booking is marked paid, and the admin receives the payment notification. Admin approval remains a separate step.
- Online order: the order remains hidden from POS while payment is pending. A verified paid webhook changes it to pending or scheduled, which releases it to POS.
- Cancelled checkout: the customer returns to the portal and can start payment again.
- Repeated webhook: the stored PayMongo event ID prevents duplicate processing.

## Database

Migration: `supabase/migrations/20260813090000_add_paymongo_payment_ledger.sql`

- `paymongo_payments` stores the entity, expected amount, checkout session, payment status, and PayMongo identifiers.
- `paymongo_webhook_events` stores webhook payloads and processing results for audit and retry safety.

## Acceptance test

1. Create a test booking and select PayMongo.
2. Complete a test checkout and confirm the booking payment status becomes `paid`.
3. Create a test online order and confirm POS cannot see it before payment.
4. Complete payment and confirm the order appears once in POS with the correct store and schedule.
5. Replay the same webhook and confirm no duplicate order or notification is created.
6. Cancel one checkout and confirm no booking/order is released.

