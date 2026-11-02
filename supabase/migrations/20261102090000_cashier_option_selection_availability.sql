begin;

-- POS cashiers can manage option selections only for their assigned branch.
-- Keep existing public reads and kitchen/admin policies unchanged.
drop policy if exists "Cashiers insert own branch option selections" on public.option_selection_store_availability;
create policy "Cashiers insert own branch option selections"
on public.option_selection_store_availability for insert to authenticated
with check (exists (
  select 1 from public.profiles p where p.id=(select auth.uid())
    and lower(trim(coalesce(p.role,'')))='cashier'
    and p.store_id::text=option_selection_store_availability.store_id::text
));

drop policy if exists "Cashiers update own branch option selections" on public.option_selection_store_availability;
create policy "Cashiers update own branch option selections"
on public.option_selection_store_availability for update to authenticated
using (exists (
  select 1 from public.profiles p where p.id=(select auth.uid())
    and lower(trim(coalesce(p.role,'')))='cashier'
    and p.store_id::text=option_selection_store_availability.store_id::text
))
with check (exists (
  select 1 from public.profiles p where p.id=(select auth.uid())
    and lower(trim(coalesce(p.role,'')))='cashier'
    and p.store_id::text=option_selection_store_availability.store_id::text
));

notify pgrst,'reload schema';
commit;
