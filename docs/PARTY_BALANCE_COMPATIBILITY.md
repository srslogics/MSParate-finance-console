# Party balance compatibility

New installations use the account ledger from 1970-01-01. Set LEDGER_CUTOVER_DATE only when intentionally migrating a legacy ledger. Historical calculations and read-only cutover auditing remain available. Customer allocation overrides and pending-customer lists start empty. No historical customer classifications, balances, identifiers, audit results, or production deployment dates are included.

The audit script checks carried openings without writing transactions. Never run migration utilities against a database without reviewing their behavior and configuring that deployment separately.
