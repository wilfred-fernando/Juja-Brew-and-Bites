-- Pickup coordinates and contacts for Lalamove delivery booking.
-- These are used as the sender/pickup stop per store.

update public.stores
set
  latitude = 14.6754858,
  longitude = 121.0438648,
  address = coalesce(nullif(address, ''), '36D Visayas Ave., Pasong Tamo, QC'),
  delivery_contact_name = coalesce(nullif(delivery_contact_name, ''), 'JUJA Brew & Bites - Pasong Tamo'),
  delivery_contact_phone = coalesce(nullif(delivery_contact_phone, ''), '09399228383')
where lower(coalesce(store_name, name, '')) like '%pasong tamo%';

update public.stores
set
  latitude = 14.6578393,
  longitude = 121.0455804,
  address = coalesce(nullif(address, ''), '8 Visayas Ave., Diliman, QC'),
  delivery_contact_name = coalesce(nullif(delivery_contact_name, ''), 'JUJA Brew & Bites - Diliman'),
  delivery_contact_phone = coalesce(nullif(delivery_contact_phone, ''), '09616320909')
where lower(coalesce(store_name, name, '')) like '%diliman%';
