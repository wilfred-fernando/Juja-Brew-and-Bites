begin;

-- The caller's role is constant across the scan. Scalar subqueries let
-- PostgreSQL evaluate these checks once per statement.
alter policy inventory_transactions_staff_select on public.inventory_transactions
  using ((select public.inventory_is_staff()));

alter policy inventory_transactions_admin_write on public.inventory_transactions
  using ((select public.inventory_is_admin()));

commit;
