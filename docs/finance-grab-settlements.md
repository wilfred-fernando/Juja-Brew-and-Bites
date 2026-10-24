# GrabFood collections

GrabFood uses the detailed aggregator collection table with gross sales, commission, tax on commission, gross remittance, EWT, signed manual Others, net sales, remitted and balance.

Commission = -(gross × 25% / 1.12); commission tax = -(gross × 25% / 1.12 × 12%); gross remittance = gross × 0.89; EWT = -(gross × 0.89 × 0.5%). Net sales = gross + commission + commission tax + EWT + Others, using unrounded intermediate calculations and rounding the final net to cents. Balance = net sales - remitted. Gross remittance is the EWT basis, not another deduction.

Example: gross 159.00, commission -35.49, tax -4.26, gross remittance 141.51, EWT -0.71, net 118.54.

Dated Others adjustments are immutable and audited. Partial remittances allocate gross deductions proportionally; final remittance clears residual cents. Receiving funds and linked petty cash receive actual net remittance. Existing postings retain their history and are not rewritten; conflicting historical settlements require review/reversal. The August 11 reporting cutoff remains enforced.
