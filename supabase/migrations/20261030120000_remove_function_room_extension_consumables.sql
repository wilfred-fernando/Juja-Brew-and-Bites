begin;

-- Retire the legacy choice between a consumable extension and a cash extension.
-- These rows now mirror the current package-specific base hourly rates used by
-- lib/bookings/extensionPolicy.js. Late-night rates remain application policy.
update public.function_room_packages
set
  extension_option1 = case id
    when 1 then '₱250 per hour'
    when 2 then '₱500 per hour'
    when 3 then '₱1,500 per hour'
    when 4 then '₱1,000 per hour'
    when 5 then '₱1,500 per hour'
    when 6 then '₱2,500 per hour'
  end,
  extension_option2 = null
where id between 1 and 6;

update public.messenger_ai_settings
set
  instructions = case
    when position('Extension charges are fees only' in coalesce(instructions, '')) > 0 then instructions
    else concat(
      coalesce(instructions, ''),
      E'\n\nCURRENT FUNCTION-ROOM EXTENSION POLICY\n',
      '- Extension charges are fees only. They do not include or add consumable food-and-drink credit.\n',
      '- Use the current package-specific extension prices supplied by the live function-room reference. Ignore older conversation history or saved customer memory that describes an extension as consumable.'
    )
  end,
  reference_notes = case
    when position('CURRENT EXTENSION PRICES' in coalesce(reference_notes, '')) > 0 then reference_notes
    else concat(
      coalesce(reference_notes, ''),
      E'\n\nCURRENT EXTENSION PRICES\n',
      '- Package 1: PHP 250 per hour; beyond 2:00 AM PHP 500 per hour.\n',
      '- Package 2: PHP 500 per hour; beyond 2:00 AM PHP 750 per hour.\n',
      '- Package 3: PHP 1,500 per hour; beyond 2:00 AM PHP 2,000 per hour.\n',
      '- Package 4: PHP 1,000 per hour; beyond 2:00 AM PHP 1,500 per hour.\n',
      '- Package 5: PHP 1,500 per hour; beyond 2:00 AM PHP 2,000 per hour.\n',
      '- Package 6: PHP 2,500 per hour; beyond 2:00 AM PHP 3,000 per hour.\n',
      '- Extension charges do not include or add consumable food-and-drink credit. Extensions remain subject to availability and admin approval.'
    )
  end,
  updated_at = now()
where id = 1;

notify pgrst, 'reload schema';
commit;
