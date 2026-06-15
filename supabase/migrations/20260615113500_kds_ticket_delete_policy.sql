grant delete on public.kds_tickets to authenticated;

drop policy if exists "kds_tickets_staff_delete" on public.kds_tickets;
create policy "kds_tickets_staff_delete"
on public.kds_tickets
for delete
to authenticated
using (
  status in ('voided', 'rejected')
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        replace(lower(coalesce(p.role, '')), '-', '_') in ('admin', 'super_admin', 'kitchen')
        or (
          replace(lower(coalesce(p.role, '')), '-', '_') = 'cashier'
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);
