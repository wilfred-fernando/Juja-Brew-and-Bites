-- Keep canonical instants in timestamptz. UI and D1 render them in Asia/Manila.

alter table if exists public.saved_ticket_audit_logs
  alter column created_at set default now();

alter table if exists public.pos_cart_audit_logs
  alter column created_at set default now();

