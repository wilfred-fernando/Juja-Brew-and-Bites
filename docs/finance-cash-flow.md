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
balance. Existing POS sales, expenses, petty cash, and payroll are not automatically
assigned to accounts or duplicated into this ledger.

## Recording funds and collections

- Transfers debit the source by the amount and credit the destination by the
  amount less fees. Transfers can use any two distinct fund sources.
- Cash In and Cash Out record actual receipts and payments. Include an expense,
  receipt, or bank reference for reconciliation.
- Collections start with a gross statement/batch receivable. GrabFood,
  ShopeeFood, GCash, QRPH, GrabPay, and Foodpanda are suggested; custom channels
  are supported. Channel and statement reference uniquely identify a receivable.
- A settlement reduces the receivable by its gross settled amount and credits
  the selected fund by the amount less fees/deductions. Partial collections are
  supported; the database prevents collecting more than remains outstanding.
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

`node scripts/verify-finance-cash-flow.mjs` uses `DATABASE_URL` from local
configuration. It creates test accounts and movements inside a transaction,
tests balances, invalid postings, reversals, and access restrictions, and rolls
back every change, including a temporary migration if not yet installed.

Focused JSX lint:
`npx eslint --config scripts/cash-flow-eslint.config.mjs components/finance/FinanceCashFlowManager.jsx app/finance/layout.jsx app/finance/cash-flow/page.jsx`

The production build compiles the new page. Authenticated browser behavior and
Cloudflare deployment require separate verification after deployment.
