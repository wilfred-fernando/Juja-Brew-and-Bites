# Shared JUJA Bookings calendar

This is a one-way staff reference: bookings in JUJA control Google events. No customer invitations or emails are sent. Each event contains customer name, package, guest count, and start/end time in Asia/Manila. Set the calendar display timezone to Asia/Manila too.

Confirmed bookings sync; pending requests keep the last approved details. Approved changes update the same event. Final cancellations, rejections, expiry, and deleted bookings mark an existing event CANCELLED and make it free time. Cancellation requests alone do not cancel an event. Keep staff access read-only so manual Google changes do not conflict with JUJA.

## Activation

1. In the business Google account create a calendar named **JUJA Bookings**, timezone **Asia/Manila**. Share with cashier/admin Google accounts with **See all event details** access.
2. Enable the Google Calendar API in a Google Cloud project and create a service account. Share this calendar with that service account's email with **Make changes to events** access. Do not make the calendar public.
3. Set server-only production variables (never NEXT_PUBLIC):
   - `GOOGLE_BOOKINGS_CALENDAR_ID`: Calendar Settings → Integrate calendar → Calendar ID.
   - `GOOGLE_BOOKINGS_SERVICE_ACCOUNT_EMAIL`: service account email.
   - `GOOGLE_BOOKINGS_PRIVATE_KEY`: service account PEM private key, literal newlines or escaped `\n`.
   - `CRON_SECRET`: a random secret used by the scheduler; preserve the existing value if configured.
4. Apply `supabase/migrations/20260928120000_booking_google_calendar.sql`. It atomically installs capture and queues existing upcoming/ongoing confirmed bookings. It does not modify bookings.
5. Deploy the app. The Vercel cron runs every five minutes (requires a plan supporting sub-daily cron). If the hosting plan does not support that schedule, remove this cron entry and configure a trusted external scheduler to GET `/api/bookings/calendar-sync` every five minutes with `Authorization: Bearer <CRON_SECRET>`. Do not leave the scheduler unconfigured.
6. Invoke that authenticated endpoint once for initial sync; repeat to drain a backlog (up to 20 per call, time-bounded). The recurring scheduler continues draining automatically.
7. Confirm an event in Google Calendar, edit an approved booking, and cancel a test booking to verify the live flow. Verify cashier/admin visibility from their own accounts.

## Operations

`booking_google_calendar_sync` is service-role-only. Rows where `synced_revision < revision` are pending. Check `last_error`, `attempts`, `next_attempt_at`, and `synced_at` for diagnostics. Failures retry indefinitely with exponential delay capped at one hour, on the next scheduled run. A five-minute lease recovers interrupted workers. Revision checks preserve changes arriving during a sync. Stable per-project booking event IDs prevent duplicate insertion on retry. Keep calendar ID and Supabase project stable; changing destination does not migrate/delete old events.

Do not delete managed events manually in Google Calendar. Use JUJA to cancel them. Google edits do not sync back. A package name is refreshed on the next booking change; renaming a package alone does not enqueue bookings.

References: [Google event creation](https://developers.google.com/workspace/calendar/api/guides/create-events), [service account authentication](https://developers.google.com/identity/protocols/oauth2/service-account).
