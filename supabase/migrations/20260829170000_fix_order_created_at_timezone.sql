-- The original POS and web-order defaults applied timezone('utc', now()) to
-- timestamptz columns. In Asia/Manila this stored default-generated values
-- eight hours early. Repair existing app-created rows once and use now()
-- directly for all future rows.

begin;

alter table public.orders
  alter column created_at set default now();

alter table public.web_orders
  alter column created_at set default now();

update public.orders
set created_at = created_at + interval '8 hours'
where coalesce(source_system, 'app') <> 'loyverse';

update public.web_orders
set created_at = created_at + interval '8 hours';

commit;
