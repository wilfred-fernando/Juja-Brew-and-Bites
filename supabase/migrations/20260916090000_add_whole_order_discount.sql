begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

update public.pos_discounts
set type = 'percent',
    scope = 'receipt',
    value = 0,
    is_variable = true,
    requires_discount_beneficiary = false,
    is_active = true,
    updated_at = now()
where lower(trim(name)) = lower('Whole Order Discount');

insert into public.pos_discounts (
  store_id, name, type, scope, value, is_variable,
  requires_discount_beneficiary, is_active, sort_order
)
select null, 'Whole Order Discount', 'percent', 'receipt', 0, true,
       false, true, (select coalesce(max(sort_order), 0) + 1 from public.pos_discounts)
where not exists (
  select 1 from public.pos_discounts
  where lower(trim(name)) = lower('Whole Order Discount')
);

notify pgrst, 'reload schema';
commit;
