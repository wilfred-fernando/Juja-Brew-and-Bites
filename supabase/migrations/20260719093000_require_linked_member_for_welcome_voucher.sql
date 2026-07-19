-- Welcome vouchers should only be auto-created for loyalty members linked to a customer account.
-- This is additive/safe: it does not delete existing vouchers or touch point/birthday vouchers.

create or replace function public.create_welcome_voucher_if_needed(p_member_id uuid)
returns table(created integer, voucher_id uuid, code text, skipped text)
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_user_id uuid;
begin
  select lm.user_id
    into linked_user_id
    from public.loyalty_members lm
   where lm.id = p_member_id;

  if p_member_id is null then
    return query select 0, null::uuid, null::text, 'missing_input';
    return;
  end if;

  if not found then
    return query select 0, null::uuid, null::text, 'member_not_found';
    return;
  end if;

  if linked_user_id is null then
    return query select 0, null::uuid, null::text, 'not_linked';
    return;
  end if;

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
  if new.user_id is null then
    return new;
  end if;

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
    if old.user_id is distinct from new.user_id then
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
