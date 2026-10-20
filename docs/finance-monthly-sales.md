# Finance Monthly Sales Report

Finance also displays a separate internal VAT accounting reference and CSV.
The table follows the internal worksheet: Date; Service Invoice From, To and
TOTAL SI; Gross Sales; VATable Transactions; VAT-exempt Transactions; Output
VAT; SC | PWD; Employees Meal; Employees Discount; Promos; Loyalty; Total
Discounts; Refunds; Net Sales. The Service Invoice range is a derived monthly
transaction sequence starting at 001 for the selected store scope, counting
all transactions (including those requiring review). It is recalculated from
the selected report data, is not a persisted invoice identifier, and never
changes receipt numbering. Late historical corrections can change the range.
Free maps to Employees Meal; Special Discount, Special Discount % and Whole
Item Discount map to Employees Discount; vouchers and loyalty labels map to
Loyalty; remaining discounts map to Promos. The SC/PWD discount is computed
using the VAT-exempt base. VAT removed and recorded/reference reconciliation
remain visible below the worksheet. Net Sales includes output VAT; gross less
SC/PWD VAT removed, total discounts and refunds equals internal net sales.
From August 11, 2026, existing item gross prices are treated as 12% VAT-inclusive.
Discounted lines identified as SC/PWD by their saved discount label or beneficiary
type (excluding vouchers) use gross / 1.12, rounded to centavos, then a 20%
discount rounded to centavos. Other lines retain their recorded discounts and
split the remaining VAT-inclusive amount into base and VAT. The exempt base is
before the SC/PWD discount. Recorded less reference shows the collection difference.
Refunded/voided receipts and receipts without reconciled line gross/discount
amounts are excluded and counted for review; no receipt-level eligible share is
guessed. Reference and comparison totals cover included receipts only.
The original report continues to show all recorded amounts. This is a derived,
Finance-only reference; no POS pricing, receipt output, catalog price, database
posting or stored sale is changed. Verify with
`node scripts/verify-finance-vat-reference.mjs`.

Finance > Monthly Sales Report (`/finance/monthly-sales`, or `/monthly-sales`
on the Finance subdomain) provides store-filtered daily gross sales, discount
breakdowns, refunds and net sales for a selected month, with CSV export.
Administrators and super administrators can use it. Cashiers are redirected to
Expenses; the report endpoint independently validates the authenticated role.

Reporting begins August 11, 2026, inclusively. August contains only August 11–31
in both the table and export, and its totals exclude August 1–10. Months before
August 2026 are rejected by the server. Later months use the full calendar
month. Receipts follow the shared Manila business-date normalization, including
shift context. Pending/unpaid/cancelled orders are excluded; recorded refunds
and voids retain their gross/discount/refund accounting.

The endpoint combines the existing D1 sales archive, archived receipt
corrections, live POS orders, completed web orders and receipt items. Shared
normalization handles archive/live overlap and POS-converted web deduplication.
Only aggregates and store IDs/names are returned to the browser. Historical
archive errors stop the report rather than silently displaying partial totals.
The existing `D1_ARCHIVE_API_URL` and `D1_ARCHIVE_API_TOKEN` configuration is
required. No new database migration or financial posting is introduced.

`node scripts/verify-finance-monthly-sales.mjs` checks the cutoff, month bounds,
store selection, discounts, refunds, unpaid exclusion, deduplication and the
unchanged default Admin full-month behavior. Lint, build and authenticated
browser/runtime verification are separate checks. Frontend/API deployment is
required before the new page is available on the deployed site.
