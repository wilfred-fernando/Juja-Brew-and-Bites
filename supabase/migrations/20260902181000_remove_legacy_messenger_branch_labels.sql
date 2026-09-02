begin;

update public.messenger_ai_settings
set instructions = replace(
      instructions,
      '- Always call the two locations "Pasong Tamo Branch" and "Diliman Branch". Do not use "Visayas Avenue" or "Congressional Avenue" as branch names.',
      '- Use only "Pasong Tamo Branch" and "Diliman Branch" as the branch labels. Street or road names are address details, not branch names.'
    ),
    updated_at = now()
where id = 1;

notify pgrst, 'reload schema';
commit;
