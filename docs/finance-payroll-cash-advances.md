# Expense cash advances linked to payroll

In Finance > Expenses, choose Employee Cash Advance as the entry type for a
Petty Cash or Overall Expense item. Select the payroll employee and enter the
actual release date, description/reason and item amount. Save creates one
payroll advance linked to that expense. For an old expense, use Edit and the
same controls; choose an existing matching payroll advance if it was already
recorded. Existing advance employee, date and amount must match exactly.
Historical descriptions are never automatically interpreted as employee names.
Payroll linking is available to administrators; cashier expense permissions
remain unchanged. Cash advance items cannot be inventory purchases.

Each item can belong to a different employee. Petty cash entries and their
Overall copies share the same advance. Receipt save and expense edits update
both views and payroll in one database transaction. Stable IDs support retries
without creating another expense or advance. Payroll synchronization does not
add another cash movement: the original expense remains the cash disbursement.

Payroll > Cash Advance shows the source and employee balance. Linked advance
principal details are managed in Finance; repayments remain in Payroll and
continue to determine payroll cutoff deductions. Repayment employee, date and
amount are validated, and linked status is recalculated after repayment changes.
Voided advances have zero outstanding balance in the payroll view.

Without repayments, changing employee/date/amount updates the linked advance;
changing the type back to Expense or deleting its source voids the advance.
After any repayment record exists, employee/date/amount, unlinking and deleting
the expense are blocked. Repayment records are never automatically erased.
Deleting or editing a linked advance directly in Payroll is blocked.

Apply `20261004190000_finance_payroll_cash_advances.sql` with
`node scripts/apply-finance-payroll-advances.mjs`. Verify using
`node scripts/verify-finance-payroll-advances.mjs`; its test writes roll back.
Frontend build/lint and authenticated browser verification are separate from
installing the database schema. Open or refresh Payroll after saving in Finance.
