-- Add cashier visibility control for Finance reference item names and item categories.

begin;

alter table public.finance_references
  add column if not exists show_to_cashier boolean not null default true;

create index if not exists idx_finance_references_cashier_visibility
  on public.finance_references (ref_type, show_to_cashier)
  where ref_type in ('item', 'item_category');

drop policy if exists "finance_references_cashier_select" on public.finance_references;
create policy "finance_references_cashier_select"
  on public.finance_references
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'cashier'
    )
    and (
      ref_type not in ('item', 'item_category')
      or show_to_cashier is true
    )
  );

commit;
