begin;

update public.messenger_ai_settings
set instructions = replace(
      replace(instructions, 'Visayas Avenue branch', 'Pasong Tamo Branch'),
      'Congressional Avenue branch', 'Diliman Branch'
    ) || case
      when position('Always call the two locations "Pasong Tamo Branch" and "Diliman Branch"' in instructions) = 0
        then E'\n- Always call the two locations "Pasong Tamo Branch" and "Diliman Branch". Do not use "Visayas Avenue" or "Congressional Avenue" as branch names.\n'
      else ''
    end,
    reference_notes = replace(
      replace(reference_notes, 'Visayas Avenue branch', 'Pasong Tamo Branch'),
      'Congressional Avenue branch', 'Diliman Branch'
    ),
    updated_at = now()
where id = 1;

update public.messenger_flow_nodes
set config = replace(
      replace(
        replace(
          replace(config::text, 'Visayas Avenue:', 'Pasong Tamo Branch:'),
          'Congressional Avenue:', 'Diliman Branch:'
        ),
        'Visayas Avenue branch', 'Pasong Tamo Branch'
      ),
      'Congressional Avenue branch', 'Diliman Branch'
    )::jsonb,
    updated_at = now()
where config::text like '%Visayas Avenue%'
   or config::text like '%Congressional Avenue%';

notify pgrst, 'reload schema';
commit;
