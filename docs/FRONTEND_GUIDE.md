# Using the finance console

Choose the outlet at the top before entering records. On a phone, open **Menu** to change pages.

| Task | Where to go |
| --- | --- |
| See today's position | Overview; expand More daily figures or Trends, insights & stock for detail |
| Create a bill | Bills & Payments → Bill; add regular and/or dressed items, choose payment status, then save |
| Record money received or paid | Overview → Record payment; choose the direction, contact and amount |
| Add purchases, sales or payments | Daily Entries; choose the working date and entry type |
| Import a spreadsheet | Expand Import from a file within the relevant daily-entry type; get a template, preview, then import |
| Record mortality or closing stock | Daily Entries → Stock Count |
| Manage contacts or opening balances/stock | Daily Entries → Contacts & Opening Balances |
| Check a customer or supplier | Customer & Supplier Ledger; search by name and choose dates |
| Download or share | Reports; choose a report, use date presets or your own dates, then Excel, PDF or Share Image |
| Check a daily sheet | Daily Sheet; choose stock, customer balances or supplier balances |
| Maintain billing shortcuts and dressed stock | Billing Setup |
| Manage accounts and outlets | Users & Outlets (owner access) |

Optional bill details (phone, address, cashier, ice and notes) and receipt details expand when needed. Closing these sections retains their values. The billing summary shows bill total, paid amount and the amount due on that bill; historical balances remain in the receipt and ledger. The paid-amount field appears for partial payments. A customer is required for an unpaid bill.

Save starts the next bill or receipt. Save & print and Save & WhatsApp use the existing save-and-output workflows. Recent bills and receipts remain available below the form. Quick item shortcuts open automatically when configured. Print preview can be expanded on smaller screens.

## Frontend verification

Run `node --test tests/party_balance_frontend.test.mjs` for balance regressions.

The browser suite requires Node.js 20+ and Playwright. Install it with `npm install --no-save playwright`, then `npx playwright install chromium` and run `node tests/ui_usability.cjs`. Alternatively use an installed Chrome with `UI_BROWSER_CHANNEL=chrome node tests/ui_usability.cjs`. The suite starts its own local server and intercepts all API requests with synthetic fixtures. It never connects to an application database. An optional `UI_SCREENSHOT_DIR` saves preview images.

Coverage includes all nine pages at 1440, 768, 390 and 320 px; visible labels and duplicate IDs; keyboard login and tabs; daily-entry submission and file preview/import; payments; bill totals and collapsed-field preservation; report date presets and export/share controls; and offline shell asset coverage. These checks do not exercise a physical printer, WhatsApp delivery or a production database.
