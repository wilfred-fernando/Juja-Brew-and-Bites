begin;
-- Preserve all existing booking validations and only expand account eligibility.
do $$
declare signature text; definition text;
begin
  foreach signature in array array['public.create_manual_booking(json)', 'public.validate_booking_customer_retag()'] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('lower(p.role) = ''customer''' in definition) = 0 then
      if position('lower(p.role) in (''customer'', ''admin'', ''super_admin'')' in definition) = 0 then
        raise exception 'Expected customer-account validation missing in %', signature;
      end if;
    else
      definition := replace(definition, 'lower(p.role) = ''customer''', 'lower(p.role) in (''customer'', ''admin'', ''super_admin'')');
      execute definition;
    end if;
  end loop;
end $$;
commit;
