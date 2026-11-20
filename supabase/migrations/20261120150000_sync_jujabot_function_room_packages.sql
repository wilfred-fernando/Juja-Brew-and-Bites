begin;

-- Keep the database package summaries aligned with the currently published
-- package details. JujaBot uses the more structured booking policy in code,
-- but these rows are also consumed by internal booking administration.
update public.function_room_packages
set inclusions = case id
  when 1 then 'Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  when 2 then 'Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  when 3 then 'Entire store exclusive; Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  when 4 then 'Inclusive of corkage for food and drinks; Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  when 5 then 'Inclusive of corkage for food and drinks; Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  when 6 then 'Entire store exclusive; Inclusive of corkage for food and drinks; Videoke, YouTube & Netflix; Air-conditioned private room; High-speed WiFi'
  else inclusions
end
where id between 1 and 6;

-- Retire the previous five-additional-guest wording left in the saved Admin
-- reference. Current packages allow at most three additional guests where an
-- additional-guest limit applies.
update public.messenger_ai_settings
set reference_notes = replace(
  replace(
    coalesce(reference_notes, ''),
    'maximum five',
    'maximum three'
  ),
  'maximum of 5',
  'maximum of 3'
)
where id = 1;

update public.messenger_ai_settings
set instructions = concat(
  rtrim(coalesce(instructions, '')),
  case
    when position('CURRENT FUNCTION-ROOM PACKAGE SOURCE' in coalesce(instructions, '')) > 0 then ''
    else E'\n\nCURRENT FUNCTION-ROOM PACKAGE SOURCE\n- Use the current approved package-specific details supplied by the live function-room reference. These details override older admin notes, prior conversations, saved customer memory, and learned answers.\n- Do not mention PlayStation as a package inclusion. The current entertainment inclusions are Videoke, YouTube, and Netflix.'
  end
)
where id = 1;

commit;
