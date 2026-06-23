-- Enforce one customer account per loyalty account while allowing unlinked members.
-- If this migration fails, check for existing duplicate user_id or loyalty_account_id values and resolve them first.

create unique index if not exists loyalty_members_user_id_unique_link
  on public.loyalty_members (user_id)
  where user_id is not null;

create unique index if not exists profiles_loyalty_account_id_unique_link
  on public.profiles (loyalty_account_id)
  where loyalty_account_id is not null;

