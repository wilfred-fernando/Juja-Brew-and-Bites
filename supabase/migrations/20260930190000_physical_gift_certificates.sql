-- Physical purchases never email; unsold stock remains inactive until a verified sale.
alter table public.gc_purchases add column certificate_format text not null default 'digital' check(certificate_format in ('digital','physical'));
alter table public.gc_purchases alter column customer_email drop not null;
alter table public.gc_purchases add constraint digital_gc_email_required check(certificate_format='physical' or customer_email is not null);
alter table public.booking_gc_batches add column certificate_format text not null default 'digital' check(certificate_format in ('digital','physical'));
alter table public.booking_gc_batches add column stock_request_key uuid;
alter table public.booking_gc_batches add column stock_sequence integer;
alter table public.booking_gc_batches add column stock_created_at timestamptz;
alter table public.booking_gc_batches add column stock_created_by uuid references auth.users(id);
create unique index gc_stock_request_sequence on public.booking_gc_batches(stock_request_key,stock_sequence);
alter table public.booking_gc_batches drop constraint gc_batch_one_source;
alter table public.booking_gc_batches add constraint gc_batch_one_source check(
 (booking_id is not null and purchase_id is null and stock_request_key is null)
 or (booking_id is null and (purchase_id is not null or stock_request_key is not null)));
alter table public.booking_gc_batches drop constraint booking_gc_batches_email_status_check;
alter table public.booking_gc_batches add constraint booking_gc_batches_email_status_check check(email_status in ('pending','sending','sent','failed','not_required'));
alter table public.booking_gc_batches add constraint physical_gc_no_email check(certificate_format<>'physical' or email_status='not_required');

create function public.generate_physical_gc_stock(p_request_key uuid,p_quantity integer,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare batch_id uuid; n integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and lower(role) in ('admin','super_admin')) then raise exception 'Admin access required'; end if;
 if p_request_key is null or p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception 'Choose 1-100 certificates'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 if exists(select 1 from public.booking_gc_batches where stock_request_key=p_request_key) then
  if exists(select 1 from public.booking_gc_batches where stock_request_key=p_request_key and stock_created_by<>p_actor) then raise exception 'Request belongs to another admin'; end if;
  return;
 end if;
 for n in 1..p_quantity loop
  insert into public.booking_gc_batches(customer_name,amount,certificate_format,email_status,stock_request_key,stock_sequence,stock_created_at,stock_created_by)
  values('Unsold physical stock',100,'physical','not_required',p_request_key,n,now(),p_actor) returning id into batch_id;
  insert into public.booking_gc_certificates(batch_id,sequence_number) values(batch_id,1);
 end loop;
end; $$;
revoke all on function public.generate_physical_gc_stock(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.generate_physical_gc_stock(uuid,integer,uuid) to service_role;

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
 insert into public.gc_purchases(request_key,customer_name,customer_email,quantity,source,store_id,payment_method,payment_proof_url,created_by,certificate_format)
 values((p_data->>'request_key')::uuid,trim(p_data->>'customer_name'),nullif(lower(trim(p_data->>'customer_email')),''),(p_data->>'quantity')::integer,
 p_data->>'source',nullif(p_data->>'store_id',''),p_data->>'payment_method',nullif(p_data->>'payment_proof_url',''),p_actor,coalesce(p_data->>'certificate_format','digital')) returning * into purchase;
 if stock.id is not null then
  update public.booking_gc_batches set purchase_id=purchase.id,customer_name=purchase.customer_name,customer_email=purchase.customer_email,
   created_at=now() where id=stock.id;
  batch_id:=stock.id;
  perform public.review_gc_purchase(batch_id,p_actor,true,true);
  select * into purchase from public.gc_purchases where id=purchase.id;
 else
  insert into public.booking_gc_batches(purchase_id,customer_name,customer_email,amount,certificate_format,email_status)
  values(purchase.id,purchase.customer_name,purchase.customer_email,purchase.amount,purchase.certificate_format,
   case when purchase.certificate_format='physical' then 'not_required' else 'pending' end) returning id into batch_id;
  insert into public.booking_gc_certificates(batch_id,sequence_number) select batch_id,n from generate_series(1,purchase.quantity)n;
 end if;
 return to_jsonb(purchase) || jsonb_build_object('expires_at',(select expires_at from public.booking_gc_batches where purchase_id=purchase.id));
end;
$$;

