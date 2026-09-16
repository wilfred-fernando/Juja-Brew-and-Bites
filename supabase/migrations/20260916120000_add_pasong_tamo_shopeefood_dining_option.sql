begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_store_id uuid;
  v_sort_order integer;
begin
  select id
    into v_store_id
  from public.stores
  where lower(name) like '%pasong tamo%'
  order by name, id
  limit 1;

  if v_store_id is null then
    raise exception 'Pasong Tamo store was not found';
  end if;

  select coalesce(max(sort_order), -1) + 1
    into v_sort_order
  from public.pos_dining_options
  where store_id = v_store_id;

  update public.pos_dining_options
  set name = 'ShopeeFood',
      is_active = true,
      print_kitchen = true,
      print_labels = true,
      is_takeout = true
  where store_id = v_store_id
    and regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = 'shopeefood';

  if not found then
    insert into public.pos_dining_options (
      store_id,
      name,
      is_active,
      sort_order,
      print_kitchen,
      print_labels,
      is_takeout,
      is_table,
      table_status
    ) values (
      v_store_id,
      'ShopeeFood',
      true,
      v_sort_order,
      true,
      true,
      true,
      false,
      'free'
    );
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
