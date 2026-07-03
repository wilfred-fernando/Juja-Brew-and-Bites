-- Allow selected POS discounts to ask the cashier for the discount value at use time.
-- Existing discounts remain fixed-value discounts unless an admin enables this flag.

alter table public.pos_discounts
  add column if not exists is_variable boolean not null default false;
