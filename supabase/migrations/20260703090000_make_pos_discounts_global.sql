-- POS discounts are shared across all stores.
-- Existing store-scoped discounts are converted to global rows so POS branches
-- load the same discount options from the admin discount settings.

alter table public.pos_discounts
  alter column store_id drop not null;

update public.pos_discounts
set store_id = null
where store_id is not null;
