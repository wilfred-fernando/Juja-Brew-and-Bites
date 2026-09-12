-- Purchase requests share certificate issuance, images, expiry and POS redemption.
create table public.gc_purchases (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 customer_name text not null check(length(trim(customer_name)) between 2 and 150),
 customer_email text not null check(length(customer_email)<=254 and customer_email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'),
 quantity integer not null check(quantity between 1 and 10),
 amount numeric(12,2) generated always as (quantity*100) stored,
 source text not null check(source in ('website','pos')),
 store_id text,
 payment_method text not null check(payment_method in ('Cash','QRPH')),
 payment_proof_url text,
 status text not null default 'pending_review' check(status in ('pending_review','approved','rejected')),
 created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 reviewed_at timestamptz,
 rejection_reason text,
 created_at timestamptz not null default now(),
 check(source<>'website' or payment_method='QRPH'),
 check(source<>'pos' or store_id is not null),
 check(payment_method<>'QRPH' or coalesce(length(payment_proof_url),0)>0)
);
alter table public.gc_purchases enable row level security;
revoke all on public.gc_purchases from anon,authenticated;
grant all on public.gc_purchases to service_role;
create index gc_purchases_creator_date on public.gc_purchases(created_by,created_at desc);
create unique index gc_purchases_proof_once on public.gc_purchases(payment_proof_url) where payment_proof_url is not null;
alter table public.booking_gc_batches alter column booking_id drop not null;
alter table public.booking_gc_batches add column purchase_id uuid unique references public.gc_purchases(id);
-- Purchase validity is six calendar months, inclusive of the final Manila date.
-- Cancellation validity remains 90 days. Recreate the derived column only.
alter table public.booking_gc_batches drop column expires_at;
alter table public.booking_gc_batches add column expires_at timestamptz generated always as (
 (case when purchase_id is not null
 then ((created_at at time zone 'Asia/Manila')::date + interval '6 months' + interval '1 day')
 else (((created_at at time zone 'Asia/Manila')::date + 91)::timestamp)
 end) at time zone 'Asia/Manila'
) stored;
alter table public.booking_gc_batches add constraint gc_batch_one_source check(num_nonnulls(booking_id,purchase_id)=1);
alter table public.booking_gc_batches drop constraint booking_gc_batches_status_check;
alter table public.booking_gc_batches add constraint booking_gc_batches_status_check check(status in ('pending_approval','approved','rejected'));

create function public.create_gc_purchase(p_data jsonb,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare purchase public.gc_purchases; batch_id uuid; actor public.profiles;
begin
 if p_actor is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended((p_data->>'request_key'),0));
 select * into purchase from public.gc_purchases where request_key=(p_data->>'request_key')::uuid;
 if purchase.id is not null then
  if purchase.created_by<>p_actor then raise exception 'Request belongs to another user'; end if;
  return to_jsonb(purchase) || jsonb_build_object('expires_at',(select expires_at from public.booking_gc_batches where purchase_id=purchase.id));
 end if;
 if p_data->>'source'='pos' then
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('admin','super_admin','cashier') then raise exception 'POS access required'; end if;
  if nullif(p_data->>'store_id','') is null or (lower(actor.role)='cashier' and actor.store_id::text is distinct from p_data->>'store_id') then raise exception 'Wrong POS branch'; end if;
 end if;
 insert into public.gc_purchases(request_key,customer_name,customer_email,quantity,source,store_id,payment_method,payment_proof_url,created_by)
 values((p_data->>'request_key')::uuid,trim(p_data->>'customer_name'),lower(trim(p_data->>'customer_email')),(p_data->>'quantity')::integer,
 p_data->>'source',nullif(p_data->>'store_id',''),p_data->>'payment_method',nullif(p_data->>'payment_proof_url',''),p_actor) returning * into purchase;
 insert into public.booking_gc_batches(purchase_id,customer_name,customer_email,amount)
 values(purchase.id,purchase.customer_name,purchase.customer_email,purchase.amount) returning id into batch_id;
 insert into public.booking_gc_certificates(batch_id,sequence_number) select batch_id,n from generate_series(1,purchase.quantity)n;
 return to_jsonb(purchase) || jsonb_build_object('expires_at',(select expires_at from public.booking_gc_batches where purchase_id=purchase.id));
end;
$$;

create function public.review_gc_purchase(p_batch_id uuid,p_actor uuid,p_approve boolean,p_payment_verified boolean default false,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare purchase public.gc_purchases; batch public.booking_gc_batches;
begin
 if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then raise exception 'Admin access required'; end if;
 select p.* into purchase from public.gc_purchases p join public.booking_gc_batches b on b.purchase_id=p.id where b.id=p_batch_id for update of p;
 select * into batch from public.booking_gc_batches where id=p_batch_id for update;
 if purchase.id is null then raise exception 'Purchase not found'; end if;
 if not p_approve then
  if purchase.status<>'pending_review' then raise exception 'Only pending purchases can be rejected'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'A rejection reason is required'; end if;
  update public.gc_purchases set status='rejected',approved_by=p_actor,reviewed_at=now(),rejection_reason=trim(p_reason) where id=purchase.id;
  update public.booking_gc_batches set status='rejected' where id=batch.id;
  return;
 end if;
 if purchase.status='rejected' then raise exception 'Purchase was rejected'; end if;
 if batch.expires_at<=statement_timestamp() then raise exception 'These certificates have expired'; end if;
 if purchase.status='approved' then return; end if;
 if p_payment_verified is distinct from true then raise exception 'Verify the full payment before approving'; end if;
 if batch.customer_name is distinct from purchase.customer_name or batch.customer_email is distinct from purchase.customer_email
  or batch.amount<>purchase.amount or (select coalesce(sum(amount),0) from public.booking_gc_certificates where batch_id=batch.id)<>purchase.amount then raise exception 'Certificate details do not match the purchase'; end if;
 update public.gc_purchases set status='approved',approved_by=p_actor,reviewed_at=now() where id=purchase.id;
 update public.booking_gc_batches set status='approved',approved_by=p_actor,approved_at=now() where id=batch.id;
 update public.booking_gc_certificates set status='active' where batch_id=batch.id and status='pending_approval';
end;
$$;
revoke all on function public.create_gc_purchase(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.review_gc_purchase(uuid,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.create_gc_purchase(jsonb,uuid) to service_role;
grant execute on function public.review_gc_purchase(uuid,uuid,boolean,boolean,text) to service_role;

-- Gift-card collections are prepaid value, separate from redeemed product sales.
create function public.gc_purchase_cash_total(p_store_id text,p_from timestamptz) returns numeric
language sql stable security definer set search_path=public as $$
 select coalesce(sum(amount),0) from public.gc_purchases
 where source='pos' and payment_method='Cash' and store_id=p_store_id and created_at>=p_from;
$$;
revoke all on function public.gc_purchase_cash_total(text,timestamptz) from public,anon,authenticated;
grant execute on function public.gc_purchase_cash_total(text,timestamptz) to service_role;
