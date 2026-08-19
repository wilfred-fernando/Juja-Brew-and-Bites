begin;

alter table public.messenger_ai_settings
  add column if not exists include_function_room boolean not null default true;

update public.messenger_ai_settings
set include_function_room = true
where id = 1 and include_function_room is null;

update public.messenger_ai_settings
set instructions = 'Answer directly and naturally as JujaBot. Use the live databases for customer-facing menu prices, function-room package details, and slot availability. If a requested fact is not in the provided reference, say so and offer the relevant public link or staff assistance.'
where id = 1
  and instructions = 'Answer directly and naturally as JujaBot. Use the live menu database for customer-facing menu names and prices. If a requested fact is not in the provided reference, say so and offer the relevant public link or staff assistance.';

notify pgrst, 'reload schema';
commit;
