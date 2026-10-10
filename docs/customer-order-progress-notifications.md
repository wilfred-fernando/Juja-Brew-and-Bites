# Customer order progress notifications

The customer Android APK uses one notification per web order. Android 16 uses
`Notification.ProgressStyle` and requests Live Update promotion; earlier versions
show an expandable notification and a stage progress bar. Device settings decide
whether promotion, sound, vibration and lock-screen details are allowed.

Received and preparing changes quietly update the card. Ready, out for delivery,
completion and cancellation use the Customer Order Alerts channel. Completion
and cancellation end the ongoing card. Dismissing tracking suppresses later live
cards for that order, while important updates may still post a standard alert.
No notification changes the device's silent, vibration or Do Not Disturb settings.
No ETA is displayed because the existing order source does not supply one.

## Activate

1. Apply `supabase/migrations/20261010120000_customer_order_progress_push.sql`.
2. Configure the existing Firebase server credentials and `CRON_SECRET` in the
   production deployment. Keep `CRON_SECRET` out of browser environment variables.
3. Deploy the web app. The authenticated `/api/customer/order-notifications` worker
   runs every minute from `vercel.json`. This schedule requires Vercel Pro/Enterprise.
   For Hobby, remove that cron entry and use a Supabase Cron or other server scheduler
   to call the same HTTPS endpoint every minute with `Authorization: Bearer <CRON_SECRET>`.
   Do not put the secret in a public URL or frontend code.
4. Sync/build the **customer** APK with `CAPACITOR_APP_TARGET=customer`, using the
   existing customer signing key and an increased version code for upgrades.
5. Install the APK and sign in. Push registration marks that device as supporting
   native order progress. Older APKs retain ordinary FCM notifications.

Only native Android push registration is implemented here. Browser realtime
notifications remain available while the customer portal is running; background
browser push subscriptions are a separate feature.

## Delivery and retries

An order-row trigger queues customer status/delivery-status changes transactionally.
There is one pending row per order, so rapid changes coalesce into the latest state.
Scheduled future orders do not generate live cards. Existing POS calls drain the
matching queue immediately on acceptance, readiness and completion; the scheduler
covers the other changes and retries failures. Normal scheduler delay is up to one
minute, plus device/network delay; push delivery is not guaranteed or instantaneous.

Jobs have a five-minute lease and eight delivery attempts with bounded backoff.
Changes arriving during delivery are preserved by checking the queued version when
acknowledging. FCM acceptance is not proof that a customer saw a notification.
Android suppresses duplicates using order state, and ignores older timestamps.
Expired FCM tokens are disabled. Inspect `customer_order_push_outbox` as an admin
for exhausted attempts (`attempts >= 8`) and `last_error`; retry only after fixing
the underlying failure. No anonymous/customer access is granted to that table or
its claim RPC.

## Verification

- `node scripts/verify-customer-order-progress.mjs` checks stage mapping and FCM
  compatibility for new APKs, old APKs and voucher notifications.
- `node scripts/verify-customer-order-progress.mjs --database` additionally executes
  the migration against mock tables in a temporary schema inside a rollback-only
  transaction using `DATABASE_URL`; it does not apply the production migration.
- Run the production web build and Android customer Java/APK build.
- On a real Android device, allow notification permission, place a customer order,
  background the app and advance through preparation, ready, delivery and completion.
  Check that the same card updates, tapping opens order history, dismissed live cards
  are not promoted again, and important updates use normal alerts afterward.
- Repeat in sound, vibrate, silent and Do Not Disturb modes; verify Android 16 and
  an earlier version. Also test denied permission, delayed delivery, two concurrent
  orders, a scheduled future order, and an older APK.

Repository builds and rollback-only SQL checks do not prove device delivery or the
actual appearance of the notification on Samsung/other OEM devices.
