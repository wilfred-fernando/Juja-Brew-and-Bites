# JUJA digital tumbler stamps

Promo period: **November 15, 2026, 12:00 AM through January 15, 2027, 11:59:59 PM, Asia/Manila**. Enrollment and qualifying purchase timestamps are restricted server-side to this window. The banner shows the dates and changes to upcoming or ended messaging outside the period. Previously earned vouchers remain redeemable after the earning period ends.

The customer Home tab has a JUJA Digital Stamps banner. Customers must link a loyalty account and explicitly tap **Join now** before earning stamps. Enrollment is idempotent and is verified against the authenticated account on the server.

Each purchased drink earns one stamp. Five slots require **LATTE (SIGNATURE)**; twenty slots require other categories marked `drink` in the menu's discount entitlement groups. Signature purchases fill only signature slots. Category eligibility is snapshotted in `juja_stamp_categories` when the migration is applied; new drink categories need to be added there. Food, add-ons, unpaid/cancelled orders, and booking collections are excluded. Purchases dated before enrollment do not count.

The card completes only at 5 signature + 20 other drink stamps (25 total). Checkout creates one free 26oz JUJA tumbler `juja_tumbler` voucher in the existing voucher wallet. Existing POS voucher redemption handles claiming the physical tumbler. This campaign awards one tumbler per loyalty member; it does not reset automatically. Stamps and the reward have no expiry, and no loyalty points are consumed.

The stamp ledger keeps archived receipts from erasing progress. Refunds of active receipts recalculate quantities and expire an unredeemed reward if the card no longer qualifies. Re-qualifying restores that same voucher. A redeemed voucher stays redeemed.

The frontend and database migration must be released together later. Without the migration, the banner reports that the card is temporarily unavailable and cannot enroll customers.

## Local verification

```powershell
npm install --prefix tmp/juja-stamp-tests --no-package-lock --ignore-scripts @electric-sql/pglite
node scripts/verify-juja-stamps.mjs
npx eslint --ext .jsx components/JujaStampBanner.jsx
npm run build
```

The database tests use an isolated PostgreSQL-compatible engine and schema fixtures. They do not change the live database. Authenticated portal/POS testing remains for a later test deployment.
