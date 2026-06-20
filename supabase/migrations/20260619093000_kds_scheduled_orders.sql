alter table public.web_orders
  add column if not exists scheduled_for timestamp with time zone,
  add column if not exists schedule_label text;

alter table public.kds_tickets
  add column if not exists scheduled_for timestamp with time zone,
  add column if not exists fulfillment_time text,
  add column if not exists fulfillment_type text,
  add column if not exists schedule_label text;

alter table public.kds_tickets
  drop constraint if exists kds_tickets_status_check;

alter table public.kds_tickets
  add constraint kds_tickets_status_check
  check (status in ('pending', 'scheduled', 'accepted', 'preparing', 'ready', 'completed', 'voided', 'rejected'));

grant delete on public.kds_tickets to authenticated;

drop policy if exists "kds_tickets_staff_delete" on public.kds_tickets;
create policy "kds_tickets_staff_delete"
on public.kds_tickets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        lower(coalesce(p.role, '')) in ('admin', 'super_admin')
        or (
          lower(coalesce(p.role, '')) in ('cashier', 'kds', 'kitchen')
          and (p.store_id::text = kds_tickets.store_id or kds_tickets.store_id is null)
        )
      )
  )
);
