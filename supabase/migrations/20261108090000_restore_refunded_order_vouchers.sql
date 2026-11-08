begin;

create table public.order_voucher_refund_restorations (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 voucher_id uuid not null references public.vouchers(id),
 previous_status text not null,
 previous_redeemed_at timestamptz,
 restored_status text not null,
 restored_at timestamptz not null default now(),
 unique(order_id,voucher_id)
);
alter table public.order_voucher_refund_restorations enable row level security;
revoke all on public.order_voucher_refund_restorations from public,anon,authenticated;
grant all on public.order_voucher_refund_restorations to service_role;

-- Shared by the refund trigger and narrowly scoped historical repairs. This
-- restores the same voucher, preserving expiry and the points used to issue it.
create function public.restore_order_refund_vouchers(p_order_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare sale public.orders; voucher public.vouchers; next_status text; restored integer:=0;
begin
 select * into sale from public.orders where id=p_order_id for update;
 if sale.id is null or lower(trim(coalesce(sale.status,'')))<>'refunded' then return 0; end if;
 if coalesce(sale.refund_amount,0)<coalesce(sale.net_amount,sale.total::numeric,0) then return 0; end if;
 for voucher in
   select v.* from public.vouchers v
   where v.member_id::text=coalesce(sale.loyalty_member_id::text,sale.customer_id::text)
     and v.status='redeemed'
     and (exists(select 1 from public.order_items i where i.order_id=sale.id
       and i.source_metadata->'pos_line_details'->'appliedVoucher'->>'id'=v.id::text)
       or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(sale.items)='array' then sale.items else '[]'::jsonb end)i
         where i->'appliedVoucher'->>'id'=v.id::text))
   order by v.id for update
 loop
   if exists(select 1 from public.order_voucher_refund_restorations where order_id=sale.id and voucher_id=voucher.id) then continue; end if;
   -- Do not undo a later redemption, or a redemption linked to a live sale.
   if voucher.redeemed_at>coalesce(sale.refunded_at,now()) then continue; end if;
   if exists(select 1 from public.orders o where o.id<>sale.id
     and lower(trim(coalesce(o.status,''))) not in ('refunded','voided','cancelled','canceled')
     and (exists(select 1 from public.order_items i where i.order_id=o.id
       and i.source_metadata->'pos_line_details'->'appliedVoucher'->>'id'=voucher.id::text)
       or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end)i
         where i->'appliedVoucher'->>'id'=voucher.id::text))) then continue; end if;
   next_status:=case when voucher.expires_at is not null and voucher.expires_at<=now() then 'expired' else 'active' end;
   insert into public.order_voucher_refund_restorations(order_id,voucher_id,previous_status,previous_redeemed_at,restored_status)
   values(sale.id,voucher.id,voucher.status,voucher.redeemed_at,next_status);
   update public.vouchers set status=next_status,redeemed_at=null where id=voucher.id;
   restored:=restored+1;
 end loop;
 return restored;
end; $$;
revoke all on function public.restore_order_refund_vouchers(uuid) from public,anon,authenticated;
grant execute on function public.restore_order_refund_vouchers(uuid) to service_role;

create function public.restore_refunded_order_vouchers() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if lower(trim(coalesce(new.status,'')))='refunded'
   and lower(trim(coalesce(old.status,'')))<>'refunded' then
   perform public.restore_order_refund_vouchers(new.id);
 end if;
 return new;
end; $$;
revoke all on function public.restore_refunded_order_vouchers() from public,anon,authenticated;
create trigger restore_refunded_order_vouchers after update of status on public.orders
for each row execute function public.restore_refunded_order_vouchers();

notify pgrst,'reload schema';
commit;
