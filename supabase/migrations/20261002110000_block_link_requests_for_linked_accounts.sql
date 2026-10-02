-- Enforce the rule for API requests and direct table writes alike.
create or replace function public.block_link_requests_for_linked_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.user_id and loyalty_account_id is not null)
     or exists (select 1 from public.loyalty_members where user_id = new.user_id) then
    raise exception 'Your account is already linked to a loyalty account.' using errcode = '23514';
  end if;

  if new.matched_member_id is not null and (
    exists (select 1 from public.loyalty_members where id = new.matched_member_id and user_id is not null)
    or exists (select 1 from public.profiles where loyalty_account_id = new.matched_member_id)
  ) then
    raise exception 'This loyalty account is already linked and cannot be requested for linking again.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists block_link_requests_for_linked_accounts on public.loyalty_link_requests;
create trigger block_link_requests_for_linked_accounts
before insert or update on public.loyalty_link_requests
for each row execute function public.block_link_requests_for_linked_accounts();
