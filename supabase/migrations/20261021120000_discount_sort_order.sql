begin;
create or replace function public.reorder_pos_discounts(p_ids text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  lock table public.pos_discounts in share row exclusive mode;
  if coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>1000
    or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id)
    or cardinality(p_ids) <> (select count(*) from public.pos_discounts)
    or exists(select 1 from unnest(p_ids) requested(id) where not exists(select 1 from public.pos_discounts d where d.id::text=requested.id)) then
    raise exception using errcode='22023',message='Discount list changed. Refresh and retry.';
  end if;
  update public.pos_discounts d set sort_order=requested.position-1
  from unnest(p_ids) with ordinality requested(id,position) where d.id::text=requested.id;
end $$;
revoke all on function public.reorder_pos_discounts(text[]) from public,anon,authenticated;
grant execute on function public.reorder_pos_discounts(text[]) to service_role;
commit;
