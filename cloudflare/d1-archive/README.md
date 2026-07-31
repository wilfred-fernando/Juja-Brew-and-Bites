# JUJA D1 History Archive

This Worker stores immutable/read-heavy history while Supabase remains the operational source.
No source rows are deleted by the sync.

## Setup

```powershell
npx wrangler d1 create juja-history-archive
```

Copy the returned database ID into `wrangler.toml`, then:

```powershell
npx wrangler d1 execute juja-history-archive --remote --file=cloudflare/d1-archive/schema.sql
npx wrangler secret put ARCHIVE_API_TOKEN --config cloudflare/d1-archive/wrangler.toml
npx wrangler deploy --config cloudflare/d1-archive/wrangler.toml
```

Add the deployed Worker URL and the same token to Vercel:

```text
D1_ARCHIVE_API_URL=https://juja-history-archive.jujabrewandbites.workers.dev
D1_ARCHIVE_API_TOKEN=<long random secret>
ARCHIVE_SYNC_SECRET=<different long random secret>
```

Run `npm run archive:sync:dry-run`, then `npm run archive:sync`.
