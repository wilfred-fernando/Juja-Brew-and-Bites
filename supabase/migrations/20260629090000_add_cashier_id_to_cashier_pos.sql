-- Scope POS shift state to the cashier account that opened or closed the shift.
-- Existing records remain valid with a null cashier_id, but new POS records store auth.uid().
alter table public.cashier_pos
  add column if not exists cashier_id uuid;

create index if not exists idx_cashier_pos_store_cashier_created_at
  on public.cashier_pos (store_id, cashier_id, created_at desc);
