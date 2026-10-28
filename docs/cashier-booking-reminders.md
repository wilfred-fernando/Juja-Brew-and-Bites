# Cashier booking reminders

While POS is open and signed in, the booking reminder component checks its clock every 15 seconds and refreshes the branch schedule every minute, on focus/reconnect, and on booking realtime events. Only confirmed, upcoming, unsettled Pasong Tamo function-room bookings qualify. The server returns at most the next four hours of bookings to staff at that branch.

The cashier receives a popup and looping notification sound at the 3-hour, 2-hour and 1-hour thresholds. The popup shows the customer name, actual start time in Philippine time, package, guests and event. Acknowledge stops the sound. Play sound allows a user gesture to enable playback if a browser blocks autoplay. Actual speaker volume and device/browser sound permissions still apply.

Acknowledgements persist in browser storage by branch, booking ID, start time and threshold. Multiple tabs coordinate through Web Locks and expiring storage leases where supported. Reloading does not replay acknowledged reminders. Rescheduling creates a new reminder key; changing only extension hours does not. Opening or resuming POS late shows the latest due reminder rather than replaying older missed thresholds. Stale schedules older than 90 seconds do not generate alerts until refreshed.

This is an open-POS reminder, not a server push or an alarm guaranteed to run after closing the browser/app. Browser/OS background suspension can delay a reminder until POS resumes. An online schedule refresh is required to verify changes. Test real device audio with Play sound after deployment; automated checks verify threshold calculations, RPC permissions/filtering, storage deduplication and ringtone lifecycle, not physical speaker output.

Checks: `node scripts/verify-booking-reminders.mjs`; `node scripts/verify-pos-booking-reminder-rpc.cjs` (rollback-only), or append `--apply` to install the migration after fixtures roll back.
