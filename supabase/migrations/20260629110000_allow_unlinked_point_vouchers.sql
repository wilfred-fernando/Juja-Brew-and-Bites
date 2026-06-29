-- Point reward vouchers can exist before the loyalty member links to a customer login.
-- They still consume 100 available points when created.

update public.vouchers v
set status = 'active'
from public.loyalty_members lm
where lm.id = v.member_id
  and lm.user_id is null
  and coalesce(v.reward_type, 'points') = 'points'
  and v.status = 'expired'
  and v.redeemed_at is null
  and (v.expires_at is null or v.expires_at > now())
  and v.points_consumed_at is null;

create or replace function public.ensure_vouchers_for_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_available numeric := 0;
  v_existing_consumed numeric := 0;
  v_voucher_count integer := 0;
  v_created_count integer := 0;
  v_next_index integer := 0;
  v_inserted_id uuid;
begin
  perform public.expire_vouchers();

  select *
  into v_member
  from public.loyalty_members
  where id = p_member_id;

  if not found then
    return;
  end if;

  with marked as (
    update public.vouchers
    set
      points_consumed = 100,
      points_consumed_at = now()
    where member_id = p_member_id
      and coalesce(reward_type, 'points') = 'points'
      and status = 'active'
      and redeemed_at is null
      and points_consumed_at is null
    returning id
  )
  select coalesce(count(*) * 100, 0)
  into v_existing_consumed
  from marked;

  if v_existing_consumed > 0 then
    update public.loyalty_members
    set "Available points" = greatest(coalesce("Available points", 0) - v_existing_consumed, 0)
    where id = p_member_id;
  end if;

  select *
  into v_member
  from public.loyalty_members
  where id = p_member_id;

  v_available := coalesce(v_member."Available points", 0);
  v_voucher_count := floor(v_available / 100);

  if v_voucher_count <= 0 then
    return;
  end if;

  select coalesce(max(reward_index), 0)
  into v_next_index
  from public.vouchers
  where member_id = p_member_id
    and coalesce(reward_type, 'points') = 'points';

  for i in 1..v_voucher_count loop
    v_next_index := v_next_index + 1;

    insert into public.vouchers (
      member_id,
      reward_index,
      code,
      reward_text,
      issued_at,
      expires_at,
      status,
      reward_type,
      points_consumed,
      points_consumed_at
    )
    values (
      p_member_id,
      v_next_index,
      'PTS100-' || v_next_index || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      'FREE 16oz Drink, Waffle, or Mini Donuts (100 Points Reward)',
      now(),
      now() + interval '90 days',
      'active',
      'points',
      100,
      now()
    )
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  if v_created_count > 0 then
    update public.loyalty_members
    set "Available points" = greatest(coalesce("Available points", 0) - (v_created_count * 100), 0)
    where id = p_member_id;
  end if;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select id
    from public.loyalty_members
    where coalesce("Available points", 0) >= 100
       or exists (
        select 1
        from public.vouchers v
        where v.member_id = loyalty_members.id
          and coalesce(v.reward_type, 'points') = 'points'
          and v.status = 'active'
          and v.redeemed_at is null
          and v.points_consumed_at is null
       )
  loop
    perform public.ensure_vouchers_for_member(r.id);
  end loop;
end $$;
