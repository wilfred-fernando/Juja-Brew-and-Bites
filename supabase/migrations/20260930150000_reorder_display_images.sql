create or replace function public.reorder_order_display_images(image_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode='42501', message='Admin API access required.';
  end if;
  lock table public.order_display_images in share row exclusive mode;
  if image_ids is null or cardinality(image_ids) <> (select count(*) from public.order_display_images)
    or cardinality(image_ids) <> (select count(distinct id) from unnest(image_ids) id)
    or exists (select 1 from unnest(image_ids) as requested(id) where not exists (select 1 from public.order_display_images d where d.id = requested.id)) then
    raise exception using errcode='22023', message='The image list changed. Refresh and try again.';
  end if;
  update public.order_display_images d set sort_order = ordered.position::integer - 1
    from unnest(image_ids) with ordinality as ordered(id, position) where d.id=ordered.id;
end;
$$;
revoke all on function public.reorder_order_display_images(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_order_display_images(uuid[]) to service_role;
