begin;
alter table public.pos_receipt_settings
  add column if not exists print_kitchen_order_slips boolean not null default false;
notify pgrst, 'reload schema';
commit;
