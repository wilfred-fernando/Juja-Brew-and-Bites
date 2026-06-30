alter table public.promotions
  add column if not exists min_order numeric default 0;

do $$
begin
  if exists (select 1 from public.promotions where code = 'WELCOME-VOUCHER') then
    update public.promotions
    set
      title = 'Welcome voucher',
      description = 'When you sign up or link your existing loyalty card, receive a Buy 1 Get 1 16oz Cheesecake Milk Tea voucher valid for 15 days.',
      discount_type = 'fixed',
      discount_value = 0,
      min_order = 0,
      is_active = true,
      start_date = current_date,
      end_date = current_date + 365
    where code = 'WELCOME-VOUCHER';
  else
    insert into public.promotions (code, title, description, discount_type, discount_value, min_order, is_active, start_date, end_date)
    values (
      'WELCOME-VOUCHER',
      'Welcome voucher',
      'When you sign up or link your existing loyalty card, receive a Buy 1 Get 1 16oz Cheesecake Milk Tea voucher valid for 15 days.',
      'fixed',
      0,
      0,
      true,
      current_date,
      current_date + 365
    );
  end if;

  if exists (select 1 from public.promotions where code = 'LOYALTY-REWARDS') then
    update public.promotions
    set
      title = 'Loyalty rewards program',
      description = 'Earn rewards points with every qualifying purchase and redeem member rewards from your JUJA loyalty account.',
      discount_type = 'fixed',
      discount_value = 0,
      min_order = 0,
      is_active = true,
      start_date = current_date,
      end_date = current_date + 365
    where code = 'LOYALTY-REWARDS';
  else
    insert into public.promotions (code, title, description, discount_type, discount_value, min_order, is_active, start_date, end_date)
    values (
      'LOYALTY-REWARDS',
      'Loyalty rewards program',
      'Earn rewards points with every qualifying purchase and redeem member rewards from your JUJA loyalty account.',
      'fixed',
      0,
      0,
      true,
      current_date,
      current_date + 365
    );
  end if;

  if exists (select 1 from public.promotions where code = 'BIRTHDAY-PERKS') then
    update public.promotions
    set
      title = 'Birthday perks',
      description = 'Celebrate your birthday month with JUJA birthday perks available to eligible loyalty members.',
      discount_type = 'fixed',
      discount_value = 0,
      min_order = 0,
      is_active = true,
      start_date = current_date,
      end_date = current_date + 365
    where code = 'BIRTHDAY-PERKS';
  else
    insert into public.promotions (code, title, description, discount_type, discount_value, min_order, is_active, start_date, end_date)
    values (
      'BIRTHDAY-PERKS',
      'Birthday perks',
      'Celebrate your birthday month with JUJA birthday perks available to eligible loyalty members.',
      'fixed',
      0,
      0,
      true,
      current_date,
      current_date + 365
    );
  end if;
end $$;
