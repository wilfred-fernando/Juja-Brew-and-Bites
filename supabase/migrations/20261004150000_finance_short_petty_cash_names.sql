begin;
-- Branch identity remains in petty_store_id; keep readable account names.
create function public.finance_short_petty_cash_name() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare branch_name text;
begin
 if NEW.petty_store_id is not null then
  select trim(regexp_replace(s.name,'^Juja( Brew & Bites)?\s*-\s*','','i')) into branch_name
  from public.stores s where s.id::text=NEW.petty_store_id;
  if nullif(branch_name,'') is not null then NEW.name:='Petty Cash - '||branch_name; end if;
 end if;
 return NEW;
end $$;
revoke all on function public.finance_short_petty_cash_name() from public,anon,authenticated;
create trigger finance_short_petty_cash_name before insert or update on public.finance_cash_accounts
for each row execute function public.finance_short_petty_cash_name();
update public.finance_cash_accounts set name=name where petty_store_id is not null;
notify pgrst,'reload schema';
commit;
