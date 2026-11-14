# JUJA digital tumbler stamps

Promo period: **November 20, 2026, 12:00 AM through January 15, 2027, 11:59:59 PM, Asia/Manila**. Enrollment and qualifying purchase timestamps are restricted server-side to this window. The banner shows the dates and changes to upcoming or ended messaging outside the period. Previously earned vouchers remain redeemable after the earning period ends.

The customer Home tab has a JUJA Digital Stamps banner. Customers must link a loyalty account and explicitly tap **Join now** before earning stamps. Enrollment is idempotent and is verified against the authenticated account on the server.

Each purchased drink earns one stamp. Five slots require **LATTE (SIGNATURE)**; twenty slots require other categories marked `drink` in the menu's discount entitlement groups. Signature purchases fill only signature slots. Category eligibility is snapshotted in `juja_stamp_categories` when the migration is applied; new drink categories need to be added there. Food, add-ons, unpaid/cancelled orders, and booking collections are excluded. Purchases dated before enrollment do not count.

The card completes only at 5 signature + 20 other drink stamps (25 total). Checkout creates one free 26oz JUJA tumbler `juja_tumbler` voucher in the existing voucher wallet. Existing POS voucher redemption handles claiming the physical tumbler. This campaign awards one tumbler per loyalty member; it does not reset automatically. Stamps and the reward have no expiry, and no loyalty points are consumed.

Drinks earning stamps do not also earn loyalty points. The POS and web award RPCs cap points to eligible non-stamp items in mixed baskets. Customers who have not joined, purchases before joining, and purchases outside the promo dates retain the usual point rules. Zero-point stamp purchases are recorded with an award timestamp so retries cannot issue points later. Customer checkout estimates apply the same category exclusion after enrollment. Historical awards are not recalculated.

The stamp ledger keeps archived receipts from erasing progress. Refunds of active receipts recalculate quantities and expire an unredeemed reward if the card no longer qualifies. Re-qualifying restores that same voucher. A redeemed voucher stays redeemed.

Free, fully discounted, and voucher/reward-redeemed items are excluded even if a price is retained in metadata. Mixed-quantity lines count paid units only, after free/redemption quantities and refunds. Partial refund quantities use the discounted paid unit value. A web refund also invalidates stamps on its POS copies. Once normalized receipt items exist, deleting them cannot restore stamps from stale order JSON.

Canonical purchase identities merge web/POS copies, offline checkout retries, and duplicate store/receipt numbers. Receipt-number edits retain the initial identity; a later web link merges the identities. Repeated cart-line IDs count once, while distinct lines of the same drink remain eligible. Ledger upserts, per-card locks, canonical advisory locks, and a unique active-owner index prevent duplicate awards across refreshes and accounts. Sources without any shared transaction identifier cannot be inferred to be duplicates purely from matching drink names or prices.

The frontend and database migration must be released together later. Without the migration, the banner reports that the card is temporarily unavailable and cannot enroll customers.

## Local verification

```powershell
npm install --prefix tmp/juja-stamp-tests --no-package-lock --ignore-scripts @electric-sql/pglite
node scripts/verify-juja-stamps.mjs
npx eslint --ext .jsx components/JujaStampBanner.jsx
npm run build
```

The database tests use an isolated PostgreSQL-compatible engine and schema fixtures. They do not change the live database. Authenticated portal/POS testing remains for a later test deployment.
