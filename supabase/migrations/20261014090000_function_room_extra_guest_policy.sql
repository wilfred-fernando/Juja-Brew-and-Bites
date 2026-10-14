-- Update only the old extra-guest limits in the saved Messenger reference.
-- Preserve all other administrator-managed instructions and reference notes.
update public.messenger_ai_settings
set reference_notes = replace(
  replace(
    reference_notes,
    'Additional guests require PHP 300 worth of food and drinks per person, maximum five.',
    'Additional guests require PHP 300 worth of food and drinks per person, maximum three.'
  ),
  'Additional guests cost PHP 150 per person for Packages 4 and 5, maximum five;',
  'Additional guests cost PHP 150 per person for Packages 4 and 5, maximum three;'
)
where reference_notes like '%Additional guests require PHP 300 worth of food and drinks per person, maximum five.%'
   or reference_notes like '%Additional guests cost PHP 150 per person for Packages 4 and 5, maximum five;%';
