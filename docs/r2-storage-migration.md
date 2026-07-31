# R2 Storage Migration

## Current State

- New web-order and booking payment proofs upload only to Cloudflare R2.
- Public files are served through `https://files.jujabrewandbites.com`.
- POS and Customer APK manifests point to R2.
- Selected large public images point to R2.
- Supabase Storage copies remain temporarily for rollback and are not used for new uploads.

## Verification

Run:

```powershell
npm run storage:audit
npm run storage:migrate:verify
```

The audit inspects every Supabase Storage bucket and all public database columns
that may contain file URLs. The migration verification checks that migrated
objects are present in R2 and publicly accessible.

## Legacy Exceptions

Five old `function_room_bookings.payment_proof_url` values still point to
Supabase Storage because the referenced source objects no longer exist there.
They are intentionally not rewritten to nonexistent R2 URLs:

- `8aa6f16f-8876-4052-9c8b-73342c1d43db`
- `021b7dd0-62d1-4e8b-b803-465ba8078381`
- `5665871d-91b7-4eb7-a8dd-66c63b1e5edd`
- `a537fb29-2749-4304-bd76-df2770f3f825`
- `1951d145-2e5d-4d4f-ae2e-82f8617881f5`

If backups of those files are recovered, restore them under their original
bucket paths and run `npm run storage:migrate` again.

## Cleanup Hold

Do not delete the old Supabase buckets yet. Keep them through a backup period,
then run both verification commands before removing any source objects.
