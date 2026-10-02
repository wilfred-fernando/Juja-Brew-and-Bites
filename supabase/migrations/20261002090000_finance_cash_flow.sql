begin;

create table public.finance_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('cash','bank','wallet')),
  reference_id text unique references public.finance_references(id),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index finance_cash_account_name on public.finance_cash_accounts(lower(trim(name)));

create table public.finance_cash_receivables (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (length(trim(channel)) > 0),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  due_date date,
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  reference text not null check (length(trim(reference)) > 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(channel, reference)
);
create unique index finance_cash_receivable_reference on public.finance_cash_receivables(lower(trim(channel)),lower(trim(reference)));

create table public.finance_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  transaction_date date not null,
  kind text not null check (kind in ('opening','inflow','outflow','transfer','collection','reversal')),
  from_account_id uuid references public.finance_cash_accounts(id),
  to_account_id uuid references public.finance_cash_accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  fee numeric(14,2) not null default 0 check (fee >= 0 and fee < amount),
  receivable_id uuid references public.finance_cash_receivables(id),
  reversal_of uuid unique references public.finance_cash_transactions(id),
  reference text not null check (length(trim(reference)) > 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_account_id is distinct from to_account_id),
  check (
    (kind in ('opening','inflow') and from_account_id is null and to_account_id is not null and fee = 0 and receivable_id is null and reversal_of is null)
    or (kind = 'outflow' and from_account_id is not null and to_account_id is null and fee = 0 and receivable_id is null and reversal_of is null)
    or (kind = 'transfer' and from_account_id is not null and to_account_id is not null and receivable_id is null and reversal_of is null)
    or (kind = 'collection' and from_account_id is null and to_account_id is not null and receivable_id is not null and reversal_of is null)
    or (kind = 'reversal' and reversal_of is not null)
  )
);
create index finance_cash_transactions_date on public.finance_cash_transactions(transaction_date);
create index finance_cash_transactions_receivable on public.finance_cash_transactions(receivable_id);

create function public.finance_cash_require_admin() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and lower(role) in ('admin','super_admin')) then
    raise exception 'Finance administrator access required';
  end if;
end;
$$;
revoke all on function public.finance_cash_require_admin() from public;

do $$ declare t text; begin
  foreach t in array array['finance_cash_accounts','finance_cash_receivables','finance_cash_transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy cash_admin_read on public.%I for select to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and lower(role) in (''admin'',''super_admin'')))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    if to_regprocedure('public.queue_finance_cloudflare_change()') is not null then
      execute format('create trigger finance_cloudflare_change after insert or update or delete on public.%I for each row execute function public.queue_finance_cloudflare_change()', t);
    end if;
  end loop;
end $$;

create function public.finance_cash_create_account(p_name text, p_kind text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result uuid;
begin
  perform public.finance_cash_require_admin();
  insert into public.finance_cash_accounts(name,kind) values(trim(p_name),p_kind) returning id into result;
  return result;
end $$;

create function public.finance_cash_sync_sources() returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.finance_cash_require_admin();
  insert into public.finance_cash_accounts(name,kind,reference_id)
  select distinct on (lower(trim(name))) trim(name),
    case when name ilike '%cash%' and name not ilike '%gcash%' then 'cash'
         when name ilike '%gcash%' or name ilike '%pay%' then 'wallet' else 'bank' end, id
  from public.finance_references where ref_type = 'fund_source' and is_active
  order by lower(trim(name)), id
  on conflict do nothing;
end $$;

create function public.finance_cash_create_receivable(p_data jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result uuid;
begin
  perform public.finance_cash_require_admin();
  insert into public.finance_cash_receivables(channel,period_start,period_end,due_date,gross_amount,reference,notes)
  values(trim(p_data->>'channel'),(p_data->>'period_start')::date,(p_data->>'period_end')::date,
    nullif(p_data->>'due_date','')::date,(p_data->>'gross_amount')::numeric,trim(p_data->>'reference'),p_data->>'notes') returning id into result;
  return result;
end $$;

create function public.finance_cash_post(p_data jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result uuid; r public.finance_cash_receivables; collected numeric; v_amount numeric(14,2); v_fee numeric(14,2);
begin
  perform public.finance_cash_require_admin();
  -- Serialize retries and return the first committed posting for this request.
  perform pg_advisory_xact_lock(hashtextextended(p_data->>'request_id',0));
  select id into result from public.finance_cash_transactions where request_id=(p_data->>'request_id')::uuid;
  if result is not null then return result; end if;
  if p_data->>'kind' not in ('opening','inflow','outflow','transfer','collection') then raise exception 'Invalid posting type'; end if;
  v_amount := (p_data->>'amount')::numeric; v_fee := coalesce(nullif(p_data->>'fee','')::numeric,0);
  if p_data->>'kind' = 'collection' then
    select * into r from public.finance_cash_receivables where id=(p_data->>'receivable_id')::uuid for update;
    if not found then raise exception 'Receivable not found'; end if;
    if (p_data->>'transaction_date')::date < r.period_end then raise exception 'Collection date cannot precede the statement period end'; end if;
    if exists (select 1 from public.finance_cash_transactions where receivable_id=r.id and transaction_date>(p_data->>'transaction_date')::date) then
      raise exception 'Collection date cannot precede the latest movement for this receivable';
    end if;
    select coalesce(sum(case when kind='reversal' then -amount else amount end),0) into collected
      from public.finance_cash_transactions where receivable_id=r.id;
    if v_amount > r.gross_amount-collected then raise exception 'Collection exceeds outstanding receivable'; end if;
  end if;
  insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,to_account_id,amount,fee,receivable_id,reference,notes)
  values((p_data->>'request_id')::uuid,(p_data->>'transaction_date')::date,p_data->>'kind',
    nullif(p_data->>'from_account_id','')::uuid,nullif(p_data->>'to_account_id','')::uuid,v_amount,v_fee,
    nullif(p_data->>'receivable_id','')::uuid,trim(p_data->>'reference'),p_data->>'notes') returning id into result;
  return result;
end $$;

create function public.finance_cash_reverse(p_id uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.finance_cash_transactions; result uuid;
begin
  perform public.finance_cash_require_admin();
  select * into t from public.finance_cash_transactions where id=p_id for update;
  if not found or t.kind='reversal' then raise exception 'Posting cannot be reversed'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reversal reason is required'; end if;
  if p_date < t.transaction_date then raise exception 'Reversal date cannot precede posting'; end if;
  if t.receivable_id is not null then
    perform 1 from public.finance_cash_receivables where id=t.receivable_id for update;
    if exists (select 1 from public.finance_cash_transactions where receivable_id=t.receivable_id and transaction_date>p_date) then
      raise exception 'Reversal date cannot precede the latest movement for this receivable';
    end if;
  end if;
  insert into public.finance_cash_transactions(request_id,transaction_date,kind,from_account_id,to_account_id,amount,fee,receivable_id,reversal_of,reference,notes)
  values(gen_random_uuid(),p_date,'reversal',t.from_account_id,t.to_account_id,t.amount,t.fee,t.receivable_id,t.id,'Reversal: '||t.reference,trim(p_reason)) returning id into result;
  return result;
end $$;

-- One database snapshot: balances never depend on the browser's row limit.
create function public.finance_cash_snapshot(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  perform public.finance_cash_require_admin();
  if p_from > p_to then raise exception 'Invalid reporting period'; end if;
  with movements as (
    select t.*, case when t.kind='reversal' then -1 else 1 end as direction,
      coalesce(o.kind,t.kind) as effective_kind
    from public.finance_cash_transactions t left join public.finance_cash_transactions o on o.id=t.reversal_of
  ), legs as (
    select to_account_id as account_id, transaction_date, direction*(amount-fee) as value from movements where to_account_id is not null
    union all select from_account_id,transaction_date,-direction*amount from movements where from_account_id is not null
  )
  select jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'opening',coalesce((select sum(value) from legs where account_id=a.id and transaction_date<p_from),0),
      'balance',coalesce((select sum(value) from legs where account_id=a.id and transaction_date<=p_to),0))), '[]') from public.finance_cash_accounts a),
    'receivables',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('outstanding',r.gross_amount-coalesce((select sum(direction*amount) from movements where receivable_id=r.id and transaction_date<=p_to),0))), '[]') from public.finance_cash_receivables r where period_end<=p_to),
    'transactions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_date desc,x.created_at desc),'[]') from (select m.*,exists(select 1 from public.finance_cash_transactions rev where rev.reversal_of=m.id) as reversed from movements m where transaction_date between p_from and p_to) x),
    'flow',jsonb_build_object(
      'inflow',coalesce((select sum(direction*(amount-fee)) from movements where effective_kind in ('inflow','collection') and transaction_date between p_from and p_to),0),
      'outflow',coalesce((select sum(direction*case when effective_kind='outflow' then amount else fee end) from movements where effective_kind in ('outflow','transfer') and transaction_date between p_from and p_to),0),
      'fees',coalesce((select sum(direction*fee) from movements where transaction_date between p_from and p_to),0))) into result;
  return result;
end $$;

revoke all on function public.finance_cash_create_account(text,text), public.finance_cash_sync_sources(), public.finance_cash_create_receivable(jsonb), public.finance_cash_post(jsonb), public.finance_cash_reverse(uuid,date,text), public.finance_cash_snapshot(date,date) from public, anon;
grant execute on function public.finance_cash_create_account(text,text), public.finance_cash_sync_sources(), public.finance_cash_create_receivable(jsonb), public.finance_cash_post(jsonb), public.finance_cash_reverse(uuid,date,text), public.finance_cash_snapshot(date,date) to authenticated;
commit;
