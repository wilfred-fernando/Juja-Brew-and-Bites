# Android POS booking calendar

Available only in the installed `com.jujabrewandbites.pos` APK, version 2.3/build 19 or later. The Customer Portal APK and browser/PWA installations do not register this widget.

After updating the APK, open POS and sign in. Long-press an empty area of the Android home screen, choose **Widgets → JUJA Pos → JUJA Booking Calendar**, and drag it onto the home screen. It can be resized on phones and tablets.

The month calendar marks days with confirmed upcoming/ongoing bookings. Tap a date to view customer names, times and payment status. Month arrows cover the current month and next three months. Today returns to the current day; refresh requests an update; tapping a booking opens POS. More bookings than fit are indicated in the footer. Times use Asia/Manila. Cancelled, expired, completed/settled and ended bookings are excluded.

The app refreshes while POS is open and uses Android JobScheduler for background refresh approximately every 30 minutes. Android battery/network scheduling can delay refresh. The footer shows the last update and labels old data as a saved schedule. Offline data can remain until the next successful refresh; it is not a real-time availability guarantee.

The native bridge is registered only in the POS APK. A scoped opaque device token is encrypted with Android Keystore along with cached booking data, excluded from backup, and never contains the staff Supabase refresh token. Server storage contains only the token hash. Every read rechecks the staff role, cashier branch, POS session and token expiry. Sign-out immediately clears the local cache, cancels jobs and revokes the token when online. Revoking the underlying login session also revokes widget access. Tokens expire after 30 days and reconnect automatically when POS is reopened. The endpoint exposes no contact details, payment proofs or loyalty data.

Verification: signed POS/customer Android builds and unit tests, rollback-only database authorization/projection tests, and API tests. Launcher placement and background timing still require a physical device or emulator check; build success alone does not prove those behaviors.
