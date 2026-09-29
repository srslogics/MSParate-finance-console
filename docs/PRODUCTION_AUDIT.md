# Production workflow audit — 29 September 2026

This audit exercises MSParte with synthetic records in a disposable PostgreSQL 16 database and Chrome. No live customer records were created, edited, imported or deleted. This is evidence for the workflows tested, not a guarantee that every production failure mode is impossible.

## Receipt changes

The owner approved the public shop name, address, phone numbers and FSSAI licence shown in the supplied photograph. Those details are now in `RETAIL_SHOP_PROFILE`. The sample transaction itself is not installed as business data.

The 80 mm receipt uses the reference's centered shop header, bill/date/time block, ITEM NAME / T NUM / QTY / PRICE columns, amount underneath each item, item/quantity summary, large total and “THANK YOU VISIT AGAIN” footer. T NUM prints `--` because this app has no table-number field. Weight prints to three decimals; piece sales retain PCS. Credit balances, ice, payment method, notes and optional configured QR support remain available where relevant.

The owner asked to keep exact amounts, so the rounding line reads `TOTAL ROUNDOFF: 0.00`. Monetary line totals use paise precision, not nearest-rupee rounding. Browser previews, browser printing and Windows ESC/POS bridge output follow the same layout. Legacy CP437 printers receive `Rs.` because that character set cannot print ₹. Saved receipt times convert stored UTC timestamps to Asia/Kolkata.

## Defects fixed

- Template downloads now include authentication and selected-outlet headers.
- All five spreadsheet/CSV import endpoints retain the selected outlet, scope duplicate checks accordingly, and reject files over 10 MB and infinite values. Preview rolls back its database changes.
- Bill/payment requests carry stable IDs. PostgreSQL locks and a transactionally saved `document_requests` record prevent simultaneous or lost-response retries from duplicating a document. Reusing an ID with different contents is rejected.
- Other writes are no longer automatically retried after ambiguous failures. Double-clicked bill saves, payment saves and offline synchronizations share one in-flight operation.
- Offline bill queues are separated by account and outlet. Failed edits of existing bills do not become new offline sales. Queues keep bills added during synchronization. Provisional prints are marked pending sync.
- Older unscoped offline queues remain untouched; owners see a download-for-review action. They cannot be automatically assigned to an outlet safely, so review them before re-entry.
- Non-finite, malformed and negative bill values are rejected. Weight-only kilogram sales work without inventing a piece count. Repopulating a draft preserves its explicit settlement choice. New bills retain the existing credit default; choose Paid in full for cash sales.
- Cached responses are separated by session/outlet; stale requests cannot populate a newly selected account/outlet. Payment-related summaries are invalidated after writes.
- Shared receipt image exports measure their actual height, serialize valid XHTML and support long receipts when the optional image library is unavailable. Payment browser print styles are included.
- Excel exports treat customer/item strings as text, preventing formula execution.
- New account passwords require eight characters; existing passwords continue to authenticate. Initial-owner creation is serialized. Failed sign-ins are limited to 10 per username and 40 per client address in a 15-minute window, shared across server workers through PostgreSQL.
- Database/SQL error details are no longer returned in the affected save/import responses. The GET health endpoint verifies database connectivity.
- The Windows printer bridge strips control characters, wraps long names and restricts browser origins to localhost, the supplied Render URL and explicitly configured additional origins.

## Validation

- Python regression suite: 98 tests covering finance, stock, ledger cutover, database configuration, frontend serving, receipt time/validation, print formatting/origin checks and safe Excel strings.
- JavaScript regression suite: 12 tests covering balances, same-origin hosting, cache policy, retry IDs, in-flight protection, offline isolation and receipt markup.
- Full HTTP/PostgreSQL checks: clean schema startup; owner setup/login; staff and outlet restrictions; concurrent identical and distinct bills; shared bill/payment numbering; bill edits; payment ledger balances; malformed values; paise precision; all five imports in two outlets; preview rollback; duplicate imports; dashboards/analytics/histories; Excel and PDF exports; logout; failed-login throttling.
- Chrome usability checks: nine screens at 1440, 768, 390 and 320 px; keyboard login/tabs; daily-entry submission; import preview/import; payment entry; partial bill totals; report controls; shell asset inventory; no uncaught browser errors.
- Receipt rendering: visual inspection of an 80 mm test bill, escaped hostile text, no horizontal overflow, and a complete 45-item PNG export (640 × 8680).
- A real browser also exercises the disposable app's login, nine screens, a weight-only bill save, cash settlement and authenticated template download.
- Public live checks at `https://msparate-finance-console.onrender.com`: reachable app and health endpoint; existing owner setup; unauthenticated business/template/private-file requests rejected. No live authentication attempts or writes were made.

## Deployment and operating notes

Startup adds two tables, `document_requests` and `login_limits`, through the existing serialized schema initialization. It does not delete or rewrite existing bills. Supabase deployments also enable RLS on these tables using the same policy as the existing application tables. The new frontend shell version is `20260929-5`.

Restart/update the local Windows print bridge to use the receipt changes. Its approved hosted origin is `https://msparate-finance-console.onrender.com`. If hosting changes, add the exact new origin to the comma-separated `PRINT_ALLOWED_ORIGINS` environment variable before launching the bridge. Browser printing remains the fallback.

Not verified here: physical printer width/encoding/cutter/driver behaviour, actual WhatsApp delivery, authenticated workflows against real customer records, prolonged network/power outages, load/soak performance, and backup restoration. Test a physical cash bill, a partial-credit bill and a payment receipt before operational sign-off. The bridge executable must be rebuilt on Windows if using a packaged executable instead of the Python script. The first owner should always be created before exposing a fresh installation to customers. Dependencies remain governed by the existing requirements file; this work is not an independent dependency-vulnerability certification.

## Repeating checks

Run `python -m pytest -q`, `node --test tests/*.test.mjs`, and the Chrome scripts `tests/ui_usability.cjs` and `tests/receipt_render.cjs` (Playwright required; `UI_BROWSER_CHANNEL=chrome` selects an installed Chrome). Optional `UI_SCREENSHOT_DIR` selects the receipt image destination.

For full integration, start the app with an explicitly overridden `DATABASE_URL` pointing at a **fresh disposable local PostgreSQL database**, and `LEDGER_CUTOVER_DATE=1970-01-01`. Use local port 8019 by default, then run `python tests/production_api_check.py` followed by `node tests/production_browser.cjs`. These scripts refuse non-loopback targets; the API script also refuses an already initialized app. Never point this procedure at the live Supabase database.

## Receipt presentation refinement

The subsequent premium receipt update uses a larger shop wordmark, clearer spacing, aligned item amounts and a stronger total. The owner-requested **NAG** heading shows actual piece counts, with kilograms retained in a separate **KG** column; the unused T NUM placeholder is removed. The summary totals NAG across both weighted and piece items. Missing counts show `--`, rather than relabelling kilograms as pieces. The browser/share layout and Windows bridge both reflect these changes. Decimal amounts remain unchanged. Shell version: `20260929-6`. Targeted receipt checks and a 45-item image export passed; physical printer verification remains outstanding.

The next visual refinement (`20260929-7`) replaces the crowded four-column item layout with item name and amount on one row, and NAG, kilograms and unit rate directly beneath. It uses consistent tabular sans-serif numerals, fewer separators and one final total; the subtotal is shown only when an ice charge requires a breakdown. The same content grouping is used by the Windows printer bridge. A two-item preview is included in the rendering check.
