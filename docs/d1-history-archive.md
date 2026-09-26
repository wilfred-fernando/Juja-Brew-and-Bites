# D1 Historical Archive

Supabase remains the operational database. Cloudflare D1 stores read-heavy,
terminal history and cached report summaries. The archive sync is additive and
does not delete or mutate source records.

## Archived data

### Finance mirror

Finance uses a separate continuous mirror; it is not restricted to terminal
sales or yesterday's records. Supabase remains the operational source.

The seven covered tables are `finance_expenses`, `finance_petty_cash_entries`,
`finance_petty_cash_funds`, `finance_references`, `finance_delete_requests`,
`finance_daily_inventory_entries`, and `finance_inventory_transfers`.
Full JSON rows preserve every receipt line and all item/supplier fields.
This does not mirror unrelated application tables such as payroll or auth.

The `20260926090000_finance_cloudflare_outbox.sql` migration queues existing
records and captures later inserts, updates, and deletes transactionally.
The archive Worker's five-minute cron copies up to 1,000 events per invocation.
The source queue is acknowledged only after a successful D1 transaction.
Failed deliveries stay queued; repeated and out-of-order deliveries cannot
overwrite newer versions. D1 `finance_records` holds the latest row/tombstone;
`finance_events` retains each captured version, including deleted rows.
The outbox contains financial data and is restricted to the service role.

Deployment (existing Cloudflare account login required):

```powershell
node scripts/verify-finance-cloudflare.mjs
node scripts/finance-cloudflare-ops.mjs --apply
npx wrangler d1 execute juja-history-archive --remote --config cloudflare/d1-archive/wrangler.toml --file cloudflare/d1-archive/finance-schema.sql
node scripts/configure-finance-cloudflare.mjs
npx wrangler deploy --config cloudflare/d1-archive/wrangler.toml
```

`configure-finance-cloudflare.mjs` pipes the Supabase URL and service key into
Worker secrets without exposing them in command arguments or writing a file.
Never use a public environment variable for the service key.
The authenticated `POST /v1/finance/sync` endpoint runs a backfill/retry;
`GET /v1/finance/status` reports D1 record/deletion counts and last sync times.
Both require the existing archive bearer token. Use
`node scripts/finance-cloudflare-ops.mjs` to inspect source counts and backlog.
Cron failures are recorded in Worker logs; a growing/old queue needs attention.
If delivery must be paused, remove the finance cron; keep the source outbox
and triggers so changes accumulate for retry. Never truncate/reset its identity
sequence, since event IDs also identify versions already stored in D1.

### Sales and audit archive

- Completed, paid, delivered, refunded, voided, and closed orders
- Receipt/order items
- Closed and end-day cashier shift records
- Daily inventory snapshots and historical inventory transactions
- Generic audit history, saved-ticket audit history, POS cart add/remove history, and notifications
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

To back up only audit records without reading or resending sales data:

```powershell
node scripts/sync-supabase-to-d1.js --audit-only --through=YYYY-MM-DD
```

Current POS cart and saved-ticket audit events are also included in the verified
shift-close archive. Failed shift archives remain in the existing retry queue.

## Validation and rollback

- Compare D1 `/v1/validate` order counts and gross/discount/refund/net totals
  against Supabase for the same date range.
- Keep all Supabase records during the observation period.
- If D1 is unavailable, the admin reports automatically use their existing
  Supabase path.
- Rollback requires only removing `D1_ARCHIVE_API_URL` and
  `D1_ARCHIVE_API_TOKEN` from Vercel; no data restoration is necessary.
