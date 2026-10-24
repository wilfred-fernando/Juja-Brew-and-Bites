# Finance entry and edit history

Administrators can open Finance > Entry / Edit Log (`/finance/entry-log`, or
`/entry-log` on the Finance subdomain). Filter by activity dates, record type,
created/edited/deleted action, user, store, record ID, receipt/reference or
description. Dates and timestamps use Asia/Manila. Results are paginated newest
first. View Changes opens the changed fields with their before and after values.

Database triggers capture successful writes to Overall Expenses, Petty Cash
expenses/funds, Finance references and deletion requests, daily inventory and
inventory transfers, cash accounts/receivables/transactions, account controls,
payment queue, cash-sale allocations/closed shifts, payroll employees/entries,
advances/repayments, loans/repayments, miscellaneous deductions, payroll cutoffs,
schedules, attendance and rate changes. Read-only reports do not create events.

Audit records are written in the same transaction as the business record. A
failed/rolled-back save does not leave a false entry. Audit records retain old
and new snapshots, changed fields, the authenticated actor and name at the time,
store/name, activity timestamp and transaction ID. Nested trigger writes are
marked Linked update; service/background writes without an authenticated user
are labelled System / service job. The source record's creator is never assumed
to be the user making a later edit. Updates changing only created_at, updated_at
or date_submitted are skipped.

Logging begins when the migration is installed. Existing creation metadata and
the Cloudflare archive outbox are not fabricated into historical edit events.
Audit events are independent of the August 11 sales-reporting boundary: an edit
today to an older expense is still logged today. Application roles cannot insert,
update, delete or forge audit rows. Cashiers cannot read the audit table or RPCs;
the page is only in the administrator Finance navigation. Audit details include
payroll/employee snapshots and must retain that access restriction.

Apply `20261024100000_finance_entry_edit_log.sql` using
`node scripts/apply-finance-entry-log.mjs`. Run
`node scripts/verify-finance-entry-log.mjs` for rollback-only actor, before/after,
delete, no-op, filtering/pagination, linked-write, payroll, immutability and
access-control checks. No Cloudflare deployment is needed for database capture;
the page/navigation require normal frontend deployment. New source tables need
an explicit audit trigger in their migration.
