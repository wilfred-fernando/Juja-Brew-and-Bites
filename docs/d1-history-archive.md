# D1 Historical Archive

Supabase remains the operational database. Cloudflare D1 stores read-heavy,
terminal history and cached report summaries. The archive sync is additive and
does not delete or mutate source records.

## Archived data

- Completed, paid, delivered, refunded, voided, and closed orders
- Receipt/order items
- Closed and end-day cashier shift records
- Daily inventory snapshots and historical inventory transactions
- Audit and notification history
- Daily sales and payment summaries

Converted web orders are de-duplicated through `orders.source_web_order_id`.
Open orders, active shifts, current inventory state, authentication, loyalty,
bookings, and all other operational workflows stay in Supabase.

## Cloudflare setup

1. Create the D1 database:

   ```powershell
   npx wrangler d1 create juja-history-archive
   ```

2. Put its ID in `cloudflare/d1-archive/wrangler.toml`.
3. Create the schema:

   ```powershell
   npx wrangler d1 execute juja-history-archive --remote --file=cloudflare/d1-archive/schema.sql
   ```

4. Set a long random Worker secret and deploy:

   ```powershell
   npx wrangler secret put ARCHIVE_API_TOKEN --config cloudflare/d1-archive/wrangler.toml
   npx wrangler deploy --config cloudflare/d1-archive/wrangler.toml
   ```

5. Add these server-only values to Vercel:

   ```text
   D1_ARCHIVE_API_URL=https://juja-history-archive.jujabrewandbites.workers.dev
   D1_ARCHIVE_API_TOKEN=<same Worker secret>
   ```

Never prefix the archive token with `NEXT_PUBLIC_`.

## Initial migration

Preview counts without writing:

```powershell
npm run archive:sync:dry-run
```

Optionally specify a boundary:

```powershell
node scripts/sync-supabase-to-d1.js --dry-run --through=2026-07-30
```

After reviewing the counts:

```powershell
npm run archive:sync
```

The default boundary is yesterday in Asia/Manila. Re-running the sync is safe:
rows use source IDs and D1 upserts.

## Validation and rollback

- Compare D1 `/v1/validate` order counts and gross/discount/refund/net totals
  against Supabase for the same date range.
- Keep all Supabase records during the observation period.
- If D1 is unavailable, the admin reports automatically use their existing
  Supabase path.
- Rollback requires only removing `D1_ARCHIVE_API_URL` and
  `D1_ARCHIVE_API_TOKEN` from Vercel; no data restoration is necessary.
