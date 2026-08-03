-- Repair proof URLs saved while the R2 public URL environment value included its key name.
update public.function_room_bookings
set payment_proof_url = regexp_replace(
  payment_proof_url,
  '^CLOUDFLARE_R2_PUBLIC_URL=',
  '',
  'i'
)
where payment_proof_url ~* '^CLOUDFLARE_R2_PUBLIC_URL=https?://';
