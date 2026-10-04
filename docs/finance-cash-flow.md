# Cash flow and cash position

Administrators and super administrators can open Finance → Cash Flow & Position
(`/finance/cash-flow`, or `/cash-flow` on the finance subdomain). Cashiers cannot
access the page or the database RPCs.

## Setup

Apply `supabase/migrations/20261002090000_finance_cash_flow.sql` to Supabase.
The existing finance setup and profiles table must already exist. If the finance
Cloudflare outbox is installed, this migration attaches its capture trigger to
all three new tables. Deploy the updated Worker allowlist before recording new
cash transactions, so the archive accepts these table names.

Import existing Finance Fund Sources, then add any remaining cash, bank, and
wallet accounts. Importing names does not import historical balances. Post each
account's opening balance on your chosen starting date, then record subsequent
cash movements. Do not re-enter transactions already included in that opening
balance. Existing POS sales, overall expenses, and payroll are not automatically
assigned to accounts or duplicated into this ledger. Petty Cash is integrated below.

## Petty-cash integration

Apply `20261002110000_finance_petty_cash_ledger.sql` after the base migration,
or run `node scripts/apply-finance-cash-flow.mjs --petty`. This creates a cash
account for each branch with petty-cash records and imports existing Cash In
and petty-cash expenses. Its balance matches all branch Cash In minus expenses.

Continue recording petty-cash funding under Expenses → Petty Cash → Add Cash In.
CASH SALES credits the branch as an inflow. A bank, wallet, or other fund source
is debited and the branch is credited as an internal transfer. Named treasury
accounts are included in the Cash In source selector. Legacy named sources are
created when needed; enter correct source opening balances to account for their
historical transfers.

Inserts, edits, and deletes sync transactionally in Supabase. Corrections retain
and reverse the old posting on its original date, then post the corrected amount.
Correct linked records in Petty Cash; manual ledger reversals and postings to
branch petty-cash accounts are rejected to keep both views consistent. Overall
expense copies are not counted again.

Cashiers retain assigned-branch permissions. They can select treasury fund names
without viewing treasury balances or transactions. Do not separately enter
opening balances that include imported petty-cash records.

`node scripts/verify-finance-petty-cash-ledger.mjs` verifies the integration in a
rollback-only transaction.

## Recording funds and collections

- Transfers debit the source by the amount and credit the destination by the
  amount less fees. Transfers can use any two distinct fund sources.
- Cash In and Cash Out record actual receipts and payments. Include an expense,
  receipt, or bank reference for reconciliation.
- Collections automatically start from non-cash sales when an online POS shift
  closes. They are grouped by store, closed shift, and payment channel, including
  custom payment types. Cash and No Payment Required are excluded. Split payments,
  proportional partial refunds, and converted web-order deduplication are handled.
- Add a remittance date, amount, receiving account, reference, and optional
  fees/deductions. Balance = non-cash sales minus remittances minus deductions.
  Partial remittances and multiple remittance dates are supported. The receiving
  account is credited by the remittance amount. The database rejects amounts
  exceeding the outstanding balance and preserves history for reversals.
- Opening balances are positive funds on hand. Accounts may become negative
  through payments; review those balances against actual account statements.
- Reverse an incorrect posting with a date and reason, then post its replacement.
  The original entry remains in the audit ledger. A reversed collection reopens
  the corresponding receivable. Receivable movements cannot precede the statement
  period end or its latest movement, preserving historical outstanding amounts.

Cash position includes all postings through the selected end date. Opening
position is the balance before the selected start date. Period cash inflows are
net collections plus other receipts. Payments and transfer fees are cash outflows;
internal transfer principal and opening postings are excluded. Total fees are
shown separately. Receivables include statement periods ending by the as-of date.

The ledger exports the selected date range to CSV, including creator IDs and
creation timestamps. Posting is append-only through admin-authorized RPCs.
Balances are aggregated in the database across the full ledger rather than a
limited browser query. Movement request IDs make retries idempotent.

## Verification

## Cash-position controls and payment queue

The reference workbook `Cash Position.xlsx` supplies the concept, without
importing its historical figures or copying its spreadsheet layout. Account
cards show recorded balance, minimum reserve, released but uncleared payments,
scheduled payments, and available funds. A period movement bridge connects the
beginning balance with actual receipts, remittances, transfers, and payments.
Unremitted non-cash sales remain receivables rather than available cash.

Available funds = recorded balance minus minimum reserve minus scheduled
payments minus released, uncleared payments. A negative result shows a funding
shortfall. Scheduled commitments count from their scheduled date, even when
their due date is later. Queue payments progress Scheduled → Released → Cleared;
clearance alone creates the cash outflow. Do not also enter that payment as a
manual Cash Out. Cancellation releases the reserve. Correct Clearance records
a dated reversal and returns the payment to Released, retaining its history.
Earlier snapshots reconstruct payment stages from dated events.

Reserve and reconciliation records are dated and append-only. A bank statement
is compared with the ledger on its statement date, independently of the current
ending balance. Missing statements display Not recorded; they are not treated
as zero. Statements never overwrite ledger balances. Petty cash retains its
existing Cash In and expense integration and is not duplicated in this queue.

Apply `20261004120000_finance_cash_position_controls.sql` after the petty-cash
migration, or run `node scripts/apply-finance-cash-flow.mjs --position`.
`node scripts/verify-finance-cash-position.mjs` exercises reconciliation,
reserves, clearance and correction, cancellation, historical snapshots,
duplicate requests, invalid transitions, ledger protection and access control
in a transaction that rolls back all verification records.

## Base ledger verification

`node scripts/verify-finance-cash-flow.mjs` uses `DATABASE_URL` from local
configuration. It creates test accounts and movements inside a transaction,
tests balances, invalid postings, reversals, and access restrictions, and rolls
back every change, including a temporary migration if not yet installed.

Focused JSX lint:
`npx eslint --config scripts/cash-flow-eslint.config.mjs components/finance/FinanceCashFlowManager.jsx app/finance/layout.jsx app/finance/cash-flow/page.jsx`

The production build compiles the new page. Authenticated browser behavior and
Cloudflare deployment require separate verification after deployment.

## Closed-shift collections setup

Apply `20261004100000_finance_closed_shift_collections.sql` after the existing
cash-flow migrations, followed by `20261004110000_finance_legacy_split_collections.sql`
for older receipt labels containing split payment amounts. Use
`scripts/apply-finance-shift-collections.mjs --wrangler
<installed-wrangler-entry-point>` to apply and backfill historical shifts from
both D1 and Supabase. Add `--verify` for a rollback-only import check.
Wrangler must have read access to the configured JUJA history archive.
Add `--repair` to recalculate previously captured shift totals from their original
time windows. Recalculation refuses to remove channels with remittance history
or reduce sales below settled amounts. Text splits such as Cash ₱40 + Card ₱60
are parsed separately so the cash portion never becomes a non-cash receivable.

A durable shift snapshot is created in the same transaction as online shift
closure, before POS archive purging. Each store's sales are partitioned between
successive close events; overlapping cashier closures and End Day cannot collect
the same receipt twice. Captures are idempotent by shift ID. Snapshot dates use
Asia/Manila. Existing manually entered receivables and their collections remain
visible as previous manual entries; no manual receivable-entry form is required.

Collections display sales within the selected period plus earlier unpaid shifts.
Remittance history and balance use the selected as-of date. Past manual entries
that represent the same sales as an automatically imported shift must be reviewed
before collecting again. Closed-shift totals are captured when the shift closes;
offline-only shift records appear after they are saved online.

`node scripts/verify-finance-shift-collections.mjs` verifies split/refunded sales,
all channels, converted-web and End Day deduplication, remittance dates, deductions,
historical balances, retry protection, the real close trigger, and restricted
access. Test writes are rolled back.
