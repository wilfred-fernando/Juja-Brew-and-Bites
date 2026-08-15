begin;

alter table public.pos_discounts
  add column if not exists requires_discount_beneficiary boolean not null default false;

update public.pos_discounts
set requires_discount_beneficiary = true
where lower(coalesce(name, '')) like '%senior%'
   or lower(coalesce(name, '')) like '%pwd%'
   or lower(trim(coalesce(name, ''))) = 'sc'
   or lower(coalesce(name, '')) like 'sc |%';

alter table public.menu_categories
  add column if not exists discount_entitlement_group text;

alter table public.menu_categories
  drop constraint if exists menu_categories_discount_entitlement_group_check;
alter table public.menu_categories
  add constraint menu_categories_discount_entitlement_group_check
  check (discount_entitlement_group is null or discount_entitlement_group in ('drink', 'food', 'dessert'));

update public.menu_categories
set discount_entitlement_group = case
  when upper(name) in ('JUICE', 'SEASONAL DRINKS', 'SHAKE', 'SODA', 'TIRAMISU (LATTE)')
    or upper(name) like 'FRAPPE%'
    or upper(name) like 'LATTE%'
    or upper(name) like 'MILK TEA%'
    then 'drink'
  when upper(name) in ('COOKIES', 'CROFFLE', 'EGG BUBBLE WAFFLE', 'MINI DONUT', 'PARFAIT', 'TIRAMISU (CAKE)', 'WAFFLE')
    then 'dessert'
  when upper(name) in ('ALL DAY BREAKFAST', 'BENTO', 'CHICKEN', 'GROUP TRAY', 'PASTA', 'RICE IN A BOX', 'RICE MEALS', 'SANDWICH', 'SNACKS', 'TOAST')
    then 'food'
  else discount_entitlement_group
end
where discount_entitlement_group is null;

create table if not exists public.pos_discount_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  beneficiary_type text not null check (beneficiary_type in ('senior_citizen', 'pwd')),
  full_name text not null,
  id_number text not null,
  normalized_id_number text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_discount_beneficiaries_identity_unique unique (beneficiary_type, normalized_id_number)
);

create index if not exists pos_discount_beneficiaries_name_idx
  on public.pos_discount_beneficiaries using gin (to_tsvector('simple', full_name));
create index if not exists pos_discount_beneficiaries_id_number_idx
  on public.pos_discount_beneficiaries (normalized_id_number);

create table if not exists public.pos_discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.pos_discount_beneficiaries(id) on delete restrict,
  discount_id uuid references public.pos_discounts(id) on delete set null,
  business_date date not null,
  entitlement_group text not null check (entitlement_group in ('drink', 'food', 'dessert')),
  store_id uuid,
  claim_key uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  receipt_number text,
  status text not null default 'reserved' check (status in ('reserved', 'completed')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_discount_redemptions_daily_unique unique (beneficiary_id, business_date, entitlement_group)
);

create index if not exists pos_discount_redemptions_claim_idx
  on public.pos_discount_redemptions (claim_key);
create index if not exists pos_discount_redemptions_order_idx
  on public.pos_discount_redemptions (order_id);
create index if not exists pos_discount_redemptions_date_idx
  on public.pos_discount_redemptions (business_date desc);

create or replace function public.pos_discount_staff_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('cashier', 'admin', 'super_admin')
  );
$$;

revoke all on function public.pos_discount_staff_allowed() from public;
grant execute on function public.pos_discount_staff_allowed() to authenticated;

alter table public.pos_discount_beneficiaries enable row level security;
alter table public.pos_discount_redemptions enable row level security;

drop policy if exists pos_discount_beneficiaries_staff on public.pos_discount_beneficiaries;
create policy pos_discount_beneficiaries_staff
on public.pos_discount_beneficiaries for select
to authenticated
using (public.pos_discount_staff_allowed());

drop policy if exists pos_discount_redemptions_staff on public.pos_discount_redemptions;
create policy pos_discount_redemptions_staff
on public.pos_discount_redemptions for select
to authenticated
using (public.pos_discount_staff_allowed());

create or replace function public.save_pos_discount_beneficiary(
  p_beneficiary_type text,
  p_full_name text,
  p_id_number text
)
returns public.pos_discount_beneficiaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_beneficiary_type, '')));
  v_name text := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_id_number text := trim(coalesce(p_id_number, ''));
  v_normalized text := upper(regexp_replace(coalesce(p_id_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row public.pos_discount_beneficiaries;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can manage discount beneficiaries.';
  end if;
  if v_type not in ('senior_citizen', 'pwd') then
    raise exception 'Select Senior Citizen or PWD.';
  end if;
  if length(v_name) < 3 then
    raise exception 'Full name is required.';
  end if;
  if length(v_normalized) < 3 then
    raise exception 'A valid ID number is required.';
  end if;

  insert into public.pos_discount_beneficiaries (
    beneficiary_type, full_name, id_number, normalized_id_number, created_by
  ) values (
    v_type, v_name, v_id_number, v_normalized, auth.uid()
  )
  on conflict (beneficiary_type, normalized_id_number) do update
    set full_name = excluded.full_name,
        id_number = excluded.id_number,
        is_active = true,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.reserve_pos_discount_claims(
  p_claim_key uuid,
  p_store_id uuid,
  p_claims jsonb
)
returns setof public.pos_discount_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim jsonb;
  v_business_date date := (now() at time zone 'Asia/Manila')::date;
  v_group text;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can reserve discount claims.';
  end if;
  if p_claim_key is null or jsonb_typeof(p_claims) <> 'array' or jsonb_array_length(p_claims) = 0 then
    raise exception 'Discount claim details are required.';
  end if;

  delete from public.pos_discount_redemptions
  where status = 'reserved' and expires_at < now();

  for v_claim in select value from jsonb_array_elements(p_claims)
  loop
    v_group := lower(trim(coalesce(v_claim->>'entitlement_group', '')));
    if v_group not in ('drink', 'food', 'dessert') then
      raise exception 'Every SC/PWD discounted item must be classified as drink, food, or dessert.';
    end if;

    insert into public.pos_discount_redemptions (
      beneficiary_id, discount_id, business_date, entitlement_group,
      store_id, claim_key, status, expires_at, created_by
    ) values (
      (v_claim->>'beneficiary_id')::uuid,
      nullif(v_claim->>'discount_id', '')::uuid,
      v_business_date,
      v_group,
      p_store_id,
      p_claim_key,
      'reserved',
      now() + interval '10 minutes',
      auth.uid()
    );
  end loop;

  return query
    select r.* from public.pos_discount_redemptions r
    where r.claim_key = p_claim_key
    order by r.created_at;
exception
  when unique_violation then
    delete from public.pos_discount_redemptions
    where claim_key = p_claim_key and status = 'reserved';
    raise exception 'This customer already used the SC/PWD %% entitlement today for one of the selected categories.';
end;
$$;

create or replace function public.complete_pos_discount_claims(
  p_claim_key uuid,
  p_order_id uuid,
  p_receipt_number text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can complete discount claims.';
  end if;
  update public.pos_discount_redemptions
  set status = 'completed', order_id = p_order_id, receipt_number = p_receipt_number,
      expires_at = null, updated_at = now()
  where claim_key = p_claim_key and status = 'reserved' and created_by = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.release_pos_discount_claims(p_claim_key uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.pos_discount_staff_allowed() then
    raise exception 'Only authorized POS staff can release discount claims.';
  end if;
  delete from public.pos_discount_redemptions
  where claim_key = p_claim_key and status = 'reserved' and created_by = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.save_pos_discount_beneficiary(text, text, text) from public;
revoke all on function public.reserve_pos_discount_claims(uuid, uuid, jsonb) from public;
revoke all on function public.complete_pos_discount_claims(uuid, uuid, text) from public;
revoke all on function public.release_pos_discount_claims(uuid) from public;
grant execute on function public.save_pos_discount_beneficiary(text, text, text) to authenticated;
grant execute on function public.reserve_pos_discount_claims(uuid, uuid, jsonb) to authenticated;
grant execute on function public.complete_pos_discount_claims(uuid, uuid, text) to authenticated;
grant execute on function public.release_pos_discount_claims(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
