-- Compare customer portal accounts, including accounts awaiting email confirmation.
-- Existing duplicate accounts are preserved; this guards new registrations only.
begin;

create or replace function public.customer_signup_name_exists(p_full_name text)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(p_full_name), '\s+', ' ', 'g')), '') is not null
    and exists (
      select 1
      from auth.users u
      left join public.profiles p on p.id = u.id
      where coalesce(p.role::text, u.raw_app_meta_data->>'role', 'customer') = 'customer'
        and lower(regexp_replace(btrim(coalesce(
          nullif(u.raw_user_meta_data->>'full_name', ''),
          nullif(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name'), ''),
          p.full_name
        )), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'))
    );
$$;

-- Return only a boolean, never account identifiers or contact details.
revoke all on function public.customer_signup_name_exists(text) from public;
grant execute on function public.customer_signup_name_exists(text) to anon, authenticated, service_role;

create or replace function public.guard_customer_signup_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_name text;
begin
  -- Staff accounts are provisioned separately; portal signup includes both fields.
  if nullif(btrim(new.raw_user_meta_data->>'first_name'), '') is null
    or nullif(btrim(new.raw_user_meta_data->>'last_name'), '') is null then
    return new;
  end if;

  signup_name := lower(regexp_replace(btrim(concat_ws(' ',
    new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name'
  )), '\s+', ' ', 'g'));

  -- Serialize registrations with the same normalized name.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(signup_name, 61002120000));
  if public.customer_signup_name_exists(signup_name) then
    raise exception 'A customer account with this full name already exists.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_customer_signup_name() from public;
drop trigger if exists guard_customer_signup_name on auth.users;
create trigger guard_customer_signup_name
before insert on auth.users
for each row execute function public.guard_customer_signup_name();

commit;
