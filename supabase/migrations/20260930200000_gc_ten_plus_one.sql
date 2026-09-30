-- quantity is paid quantity; issued_quantity includes the promotional free certificate.
alter table public.gc_purchases add column package text not null default 'standard' check(package in ('standard','ten_plus_one'));
alter table public.gc_purchases add constraint gc_package_quantity check(package<>'ten_plus_one' or quantity=10);
alter table public.gc_purchases add column issued_quantity integer generated always as (quantity + case when package='ten_plus_one' then 1 else 0 end) stored;

create or replace function public.create_gc_purchase(p_data jsonb,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare purchase public.gc_purchases; batch_id uuid; actor public.profiles; stock public.booking_gc_batches;
begin
 if p_actor is null then raise exception 'Login required'; end if;
 perform pg_advisory_xact_lock(hashtextextended((p_data->>'request_key'),0));
 select * into purchase from public.gc_purchases where request_key=(p_data->>'request_key')::uuid;
 if purchase.id is not null then
  if purchase.created_by<>p_actor then raise exception 'Request belongs to another user'; end if;
  return to_jsonb(purchase) || jsonb_build_object('expires_at',(select expires_at from public.booking_gc_batches where purchase_id=purchase.id));
 end if;
 if nullif(p_data->>'stock_batch_id','') is not null then
  if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then raise exception 'Admin access required'; end if;
  select * into stock from public.booking_gc_batches where id=(p_data->>'stock_batch_id')::uuid for update;
  if stock.id is null or stock.stock_request_key is null or stock.purchase_id is not null then raise exception 'Physical certificate is not unsold stock'; end if;
  if (p_data->>'quantity')::integer<>1 or p_data->>'certificate_format'<>'physical' or p_data->>'source'<>'pos' then raise exception 'Invalid physical stock sale'; end if;
  if coalesce((p_data->>'payment_verified')::boolean,false) is not true then raise exception 'Verify payment before activating stock'; end if;
 end if;
 if p_data->>'source'='pos' then
  select * into actor from public.profiles where id=p_actor;
  if actor.id is null or lower(coalesce(actor.role,'')) not in ('admin','super_admin','cashier') then raise exception 'POS access required'; end if;
  if nullif(p_data->>'store_id','') is null or (lower(actor.role)='cashier' and actor.store_id::text is distinct from p_data->>'store_id') then raise exception 'Wrong POS branch'; end if;
 end if;
 insert into public.gc_purchases(request_key,customer_name,customer_email,quantity,source,store_id,payment_method,payment_proof_url,created_by,certificate_format,package)
 values((p_data->>'request_key')::uuid,trim(p_data->>'customer_name'),nullif(lower(trim(p_data->>'customer_email')),''),(p_data->>'quantity')::integer,
 p_data->>'source',nullif(p_data->>'store_id',''),p_data->>'payment_method',nullif(p_data->>'payment_proof_url',''),p_actor,coalesce(p_data->>'certificate_format','digital'),coalesce(p_data->>'package','standard')) returning * into purchase;
 if stock.id is not null then
  update public.booking_gc_batches set purchase_id=purchase.id,customer_name=purchase.customer_name,customer_email=purchase.customer_email,
   created_at=now() where id=stock.id;
  batch_id:=stock.id;
  perform public.review_gc_purchase(batch_id,p_actor,true,true);
  select * into purchase from public.gc_purchases where id=purchase.id;
 else
  insert into public.booking_gc_batches(purchase_id,customer_name,customer_email,amount,certificate_format,email_status)
  values(purchase.id,purchase.customer_name,purchase.customer_email,purchase.issued_quantity*100,purchase.certificate_format,
   case when purchase.certificate_format='physical' then 'not_required' else 'pending' end) returning id into batch_id;
  insert into public.booking_gc_certificates(batch_id,sequence_number) select batch_id,n from generate_series(1,purchase.issued_quantity)n;
 end if;
 return to_jsonb(purchase) || jsonb_build_object('expires_at',(select expires_at from public.booking_gc_batches where purchase_id=purchase.id));
end;
$$;


create or replace function public.review_gc_purchase(p_batch_id uuid,p_actor uuid,p_approve boolean,p_payment_verified boolean default false,p_reason text default null) returns void
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
  or batch.amount<>purchase.issued_quantity*100 or (select coalesce(sum(amount),0) from public.booking_gc_certificates where batch_id=batch.id)<>purchase.issued_quantity*100 then raise exception 'Certificate details do not match the purchase'; end if;
 update public.gc_purchases set status='approved',approved_by=p_actor,reviewed_at=now() where id=purchase.id;
 update public.booking_gc_batches set status='approved',approved_by=p_actor,approved_at=now() where id=batch.id;
 update public.booking_gc_certificates set status='active' where batch_id=batch.id and status='pending_approval';
end;
$$;
