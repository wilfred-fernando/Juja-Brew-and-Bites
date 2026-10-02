begin;

-- Keep existing delivery history; validate the address for newly submitted orders.
create or replace function public.require_web_order_delivery_address()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if upper(coalesce(new.fulfillment_type, '')) = 'DELIVERY'
     or upper(coalesce(new.dining_option, '')) like '%DELIVERY%' then
    if nullif(btrim(new.delivery_address), '') is null then
      raise exception 'Delivery address is required for delivery orders.' using errcode = '23514';
    end if;
    new.delivery_address := btrim(new.delivery_address);
  else
    new.delivery_address := '';
  end if;
  return new;
end;
$$;

drop trigger if exists require_web_order_delivery_address on public.web_orders;
create trigger require_web_order_delivery_address
before insert on public.web_orders
for each row execute function public.require_web_order_delivery_address();

update public.messenger_ai_settings
set reference_notes = replace(reference_notes,
  '- Delivery uses Lalamove. The customer enters an address and map pin to receive a motorcycle-delivery estimate. The cashier confirms the final rider booking.',
  '- Delivery orders require a complete delivery address. Pickup and Dine-In orders do not require a delivery address.');

commit;
