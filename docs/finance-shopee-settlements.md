# ShopeeFood collection format

Non-cash Collections displays ShopeeFood separately with the supplied columns:
Store, Shift date, Shift, Channel, Gross Sales, Commission, Tax on Comm, Gross
Remittance, EWT, Others, Net Sales, Remitted, Balance and Action.

The computation follows the supplied spreadsheet example:

- Commission = −(gross sales × 27% ÷ 1.12).
- Tax on commission = −(gross sales × 27% ÷ 1.12 × 12%).
- Gross remittance = gross sales × 0.622855; this is the EWT calculation base.
- EWT = −(gross remittance × 0.005).
- Net sales = gross sales + commission + tax on commission + EWT + Others.
- Balance = net sales − remitted.

Intermediate formulas retain numeric precision; displayed components and final
cash amounts round to two decimal places. The supplied samples produce net
sales of 2,497.58 from 3,436 gross and 202.07 from 278 gross.

Edit Others accepts a signed amount: negative deducts, positive adds, zero clears
the adjustment. An effective date and reason/reference are required. Changes are
append-only, administrator-only and included in the Finance Entry / Edit Log.
Historical as-of reports select the adjustment applicable at that date.
New adjustments cannot be backdated before existing adjustments/remittances or
conflict with amounts already settled. Existing remittances are not rewritten.

ShopeeFood Add Remittance accepts the actual net received. The database allocates
gross settlement and deductions proportionally against the remaining gross/net
balances. The final remittance takes the remaining gross exactly, avoiding cent
residuals. Only the net received credits the chosen account or branch Cash In.
Reversal restores the same gross, deductions and net settlement. Direct postings
with arbitrary manual fees are rejected for ShopeeFood. Other channels keep their
existing gross/remittance/deduction behavior. The August 11 cutoff is retained.

Apply `20261024110000_finance_shopee_settlements.sql` using
`node scripts/apply-finance-shopee-settlements.mjs` after the reporting-start and
entry/edit-log migrations. Verify using
`node scripts/verify-finance-shopee-settlements.mjs` (rollback-only).
