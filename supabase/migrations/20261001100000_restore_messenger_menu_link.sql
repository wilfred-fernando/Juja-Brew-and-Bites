begin;

update public.messenger_ai_settings
set instructions = instructions || case
      when position('https://www.jujabrewandbites.com/menu' in instructions) = 0
        then E'\n- When a customer asks about the menu, food, drinks, flavors, or prices, answer from the live menu reference and include this exact public link: https://www.jujabrewandbites.com/menu.\n'
      else ''
    end,
    reference_notes = reference_notes || case
      when position('https://www.jujabrewandbites.com/menu' in reference_notes) = 0
        then E'\n- Current public menu: https://www.jujabrewandbites.com/menu\n'
      else ''
    end,
    updated_at = now()
where id = 1;

notify pgrst, 'reload schema';
commit;
