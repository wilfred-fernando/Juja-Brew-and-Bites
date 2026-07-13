-- Admin-managed voucher campaigns and reliable welcome voucher allocation.
-- Additive only: keeps existing vouchers/promotions intact.

create table if not exists public.voucher_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  reward_text text not null,
  reward_type text not null default 'welcome',
  voucher_prefix text not null default 'WELCOME',
  validity_days integer not null default 15 check (validity_days > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  auto_create_on_signup boolean not null default false,
  auto_create_on_link boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vouchers
  add column if not exists campaign_id uuid references public.voucher_campaigns(id),
  add column if not exists campaign_code text;

create index if not exists vouchers_member_campaign_idx
  on public.vouchers (member_id, campaign_code);

create index if not exists voucher_campaigns_active_idx
  on public.voucher_campaigns (reward_type, is_active, starts_at, ends_at);

create or replace function public.touch_voucher_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_voucher_campaigns_updated_at on public.voucher_campaigns;
create trigger trg_touch_voucher_campaigns_updated_at
before update on public.voucher_campaigns
for each row
execute function public.touch_voucher_campaigns_updated_at();

insert into public.voucher_campaigns (
  code,
  title,
  reward_text,
  reward_type,
  voucher_prefix,
  validity_days,
  starts_at,
  ends_at,
  is_active,
  auto_create_on_signup,
  auto_create_on_link
)
values (
  'WELCOME-VOUCHER',
  'Welcome voucher',
  'B1T1 16oz Cheesecake Milk Tea (Welcome Voucher)',
  'welcome',
  'WELCOME',
  15,
  '2026-01-01 00:00:00+08'::timestamptz,
  '2026-08-31 23:59:59+08'::timestamptz,
  true,
  true,
  true
)
on conflict (code) do update
set
  title = excluded.title,
  reward_text = excluded.reward_text,
  reward_type = excluded.reward_type,
  voucher_prefix = excluded.voucher_prefix,
  validity_days = excluded.validity_days,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  is_active = excluded.is_active,
  auto_create_on_signup = excluded.auto_create_on_signup,
  auto_create_on_link = excluded.auto_create_on_link,
  updated_at = now();

create or replace function public.create_voucher_from_campaign(
  p_member_id uuid,
  p_campaign_code text
)
returns table(created integer, voucher_id uuid, code text, skipped text)
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_row public.voucher_campaigns%rowtype;
  member_exists boolean;
  existing_voucher_id uuid;
  next_reward_index integer;
  generated_code text;
  new_voucher_id uuid;
  issued_at_value timestamptz := now();
  expires_at_value timestamptz;
  try_count integer := 0;
begin
  if p_member_id is null or nullif(trim(coalesce(p_campaign_code, '')), '') is null then
    return query select 0, null::uuid, null::text, 'missing_input';
    return;
  end if;

  select exists(select 1 from public.loyalty_members where id = p_member_id)
    into member_exists;

  if not member_exists then
    return query select 0, null::uuid, null::text, 'member_not_found';
    return;
  end if;

  select vc.*
    into campaign_row
    from public.voucher_campaigns vc
   where upper(vc.code) = upper(trim(p_campaign_code))
     and vc.is_active = true
     and (vc.starts_at is null or vc.starts_at <= issued_at_value)
     and (vc.ends_at is null or vc.ends_at >= issued_at_value)
   order by vc.created_at desc
   limit 1;

  if campaign_row.id is null then
    return query select 0, null::uuid, null::text, 'campaign_inactive';
    return;
  end if;

  select v.id
    into existing_voucher_id
    from public.vouchers v
   where v.member_id = p_member_id
     and (
       v.campaign_id = campaign_row.id
       or upper(coalesce(v.campaign_code, '')) = upper(campaign_row.code)
       or (
         campaign_row.reward_type = 'welcome'
         and (
           coalesce(v.reward_type, '') = 'welcome'
           or upper(coalesce(v.code, '')) like 'WELCOME%'
           or lower(coalesce(v.reward_text, '')) like '%welcome voucher%'
         )
       )
     )
   limit 1;

  if existing_voucher_id is not null then
    return query select 0, existing_voucher_id, null::text, 'exists';
    return;
  end if;

  select coalesce(max(reward_index), 0) + 1
    into next_reward_index
    from public.vouchers
   where member_id = p_member_id;

  expires_at_value := issued_at_value + make_interval(days => campaign_row.validity_days);

  loop
    try_count := try_count + 1;
    generated_code := upper(campaign_row.voucher_prefix) || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists(select 1 from public.vouchers v where v.code = generated_code) or try_count >= 25;
  end loop;

  if exists(select 1 from public.vouchers v where v.code = generated_code) then
    generated_code := upper(campaign_row.voucher_prefix) || '-' || replace(gen_random_uuid()::text, '-', '');
    generated_code := left(generated_code, 32);
  end if;

  insert into public.vouchers (
    member_id,
    reward_index,
    code,
    reward_text,
    issued_at,
    expires_at,
    status,
    reward_type,
    campaign_id,
    campaign_code
  )
  values (
    p_member_id,
    next_reward_index,
    generated_code,
    campaign_row.reward_text,
    issued_at_value,
    expires_at_value,
    'active',
    campaign_row.reward_type,
    campaign_row.id,
    campaign_row.code
  )
  returning id into new_voucher_id;

  return query select 1, new_voucher_id, generated_code, null::text;
end;
$$;

create or replace function public.create_welcome_voucher_if_needed(p_member_id uuid)
returns table(created integer, voucher_id uuid, code text, skipped text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select *
      from public.create_voucher_from_campaign(p_member_id, 'WELCOME-VOUCHER');
end;
$$;

create or replace function public.auto_create_welcome_voucher_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.voucher_campaigns
       where code = 'WELCOME-VOUCHER'
         and is_active = true
         and auto_create_on_signup = true
         and (starts_at is null or starts_at <= now())
         and (ends_at is null or ends_at >= now())
    ) then
      perform public.create_welcome_voucher_if_needed(new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.user_id is not null and old.user_id is distinct from new.user_id then
      if exists (
        select 1 from public.voucher_campaigns
         where code = 'WELCOME-VOUCHER'
           and is_active = true
           and auto_create_on_link = true
           and (starts_at is null or starts_at <= now())
           and (ends_at is null or ends_at >= now())
      ) then
        perform public.create_welcome_voucher_if_needed(new.id);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_loyalty_members_auto_welcome_voucher on public.loyalty_members;
create trigger trg_loyalty_members_auto_welcome_voucher
after insert or update of user_id on public.loyalty_members
for each row
execute function public.auto_create_welcome_voucher_for_member();

-- Backfill only members that do not already have a welcome voucher.
do $$
declare
  member_row record;
begin
  for member_row in
    select lm.id
      from public.loyalty_members lm
     where not exists (
       select 1
         from public.vouchers v
        where v.member_id = lm.id
          and (
            coalesce(v.reward_type, '') = 'welcome'
            or upper(coalesce(v.code, '')) like 'WELCOME%'
            or lower(coalesce(v.reward_text, '')) like '%welcome voucher%'
          )
     )
  loop
    perform public.create_welcome_voucher_if_needed(member_row.id);
  end loop;
end $$;
