# Finance interfaces

Finance now defaults to the Future interface for authenticated Expenses, Inventory,
and Payroll pages. Login and role permissions remain unchanged. Both interfaces
use the same operational components, data, forms, and calculations.

## Switch without a deployment

Choose **Classic interface** in the Future navigation to restore the original
layout. In Classic, choose **Future interface** in the header to switch forward.
The preference is saved per browser under `juja:finance:interface`. Finish or save
open forms before switching interfaces; switching remounts the workspace.

## Restore the original layout in code

`components/finance/FinanceClassicLayout.jsx` is an unchanged copy of the original
`app/finance/layout.jsx`, saved before this redesign. To roll back completely,
copy that file back to `app/finance/layout.jsx` and rebuild/deploy. Its imports
are absolute, so it works at either location.

Future styles live in `components/finance/FinanceFutureShell.module.css` and are
scoped to that shell. They do not apply to Classic or other portals. No schema
changes or data migration are required.

## Verification

- Production build and targeted JSX lint passed.
- Actual shell rendered with sample content at desktop/mobile widths, including
  the compiled production stylesheet for a contrast check.
- Authenticated expense entry, payroll, inventory mutations, and production
  deployment are not verified by the isolated visual preview.
