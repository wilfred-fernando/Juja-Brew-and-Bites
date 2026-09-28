# Finance interface

Expenses, Inventory, and Payroll now use only the premium finance interface.
The Classic layout and switch have been removed. Saved browser interface
preferences are no longer read.

The shared shell is `components/finance/FinanceFutureShell.jsx`. Its CSS module
is scoped to finance, leaving other portals unchanged. Existing authentication,
role permissions, forms, and calculations remain in place.

The previous implementation remains recoverable from Git history.
