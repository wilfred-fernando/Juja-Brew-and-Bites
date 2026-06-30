-- Saved/open ticket line items stored per row.
-- Keeps open_tickets as the header record and uses open_ticket_items for line-level cart state.

create table if not exists public.open_ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.open_tickets(id) on delete cascade,
  line_index integer not null default 0,
  item_data jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists open_ticket_items_ticket_id_idx
  on public.open_ticket_items(ticket_id, line_index);

create or replace function public.set_open_ticket_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_open_ticket_items_updated_at on public.open_ticket_items;
create trigger set_open_ticket_items_updated_at
before update on public.open_ticket_items
for each row
execute function public.set_open_ticket_items_updated_at();

alter table public.open_ticket_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.open_tickets'::regclass
      and polname = 'Allow authenticated update open_tickets'
  ) then
    create policy "Allow authenticated update open_tickets"
      on public.open_tickets
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.open_ticket_items'::regclass
      and polname = 'Allow authenticated select open_ticket_items'
  ) then
    create policy "Allow authenticated select open_ticket_items"
      on public.open_ticket_items
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.open_ticket_items'::regclass
      and polname = 'Allow authenticated insert open_ticket_items'
  ) then
    create policy "Allow authenticated insert open_ticket_items"
      on public.open_ticket_items
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.open_ticket_items'::regclass
      and polname = 'Allow authenticated update open_ticket_items'
  ) then
    create policy "Allow authenticated update open_ticket_items"
      on public.open_ticket_items
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.open_ticket_items'::regclass
      and polname = 'Allow authenticated delete open_ticket_items'
  ) then
    create policy "Allow authenticated delete open_ticket_items"
      on public.open_ticket_items
      for delete
      to authenticated
      using (true);
  end if;
end $$;

grant select, insert, update, delete on public.open_ticket_items to authenticated;

insert into public.open_ticket_items (ticket_id, line_index, item_data)
select t.id, (line.ordinality - 1)::integer, line.value
from public.open_tickets t
cross join lateral jsonb_array_elements(t.items) with ordinality as line(value, ordinality)
where not exists (
  select 1
  from public.open_ticket_items oti
  where oti.ticket_id = t.id
);
