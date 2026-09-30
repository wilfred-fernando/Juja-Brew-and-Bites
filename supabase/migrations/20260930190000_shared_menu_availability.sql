create or replace function public.set_shared_menu_availability(item_key text, available boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists (select 1 from public.profiles where id=auth.uid() and replace(lower(role),'-','_') in ('admin','super_admin','cashier','kitchen','kds')) then
  raise exception using errcode='42501', message='Staff access required.';
 end if;
 if available is null then raise exception 'Availability is required.'; end if;
 update public.menu_items set is_available=available where id::text=item_key;
 if not found then raise exception 'Menu item not found.'; end if;
end;
$$;
revoke all on function public.set_shared_menu_availability(text,boolean) from public,anon;
grant execute on function public.set_shared_menu_availability(text,boolean) to authenticated;
