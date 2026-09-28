# Sanitized transfer report

Source snapshot: `2bf24f07baea2d255a64255bd9cc96ff9c0bc587`. Target parent: `768c6f48e121f9287d548fe89071039df5d7c67e`. Target branch: `main`.

All 60 tracked source paths were inventoried, including hidden files. 52 text/code files were transferred (some renamed or sanitized); all 7 original binary images and the tracked .env were excluded. Only working-tree file contents were transferred. The source .git directory, branches, commits, and history were not copied. The target repository history is preserved.

## Findings and treatment

- Removed embedded receipt business/proprietor identity, street address, telephone numbers, payment account, customer names and 15 customer UUIDs.
- Removed client allocation overrides, production audit statistics, incident narrative and source-history references. Cutover configuration defaults to 1970-01-01 for new installations; tests set a synthetic date boundary explicitly.
- Replaced real statement amounts and customer balance examples with synthetic values; retained regression coverage with a synthetic customer ID.
- Removed the production API endpoint; the default is localhost. Renamed browser storage keys to avoid reusing source-app sessions or cached records.
- Removed source branding in UI, PWA metadata, reports, printing and launcher names. Added a new neutral SVG icon; no source images were reused.
- Blank receipt contact/payment settings. Payment QR rendering is disabled until configured. The printer payment ID comes from the environment with an empty default.
- A tracked `.env` containing DATABASE_URL was found and excluded; it was never staged or committed in the target. Only placeholder `.env.example` is transferred. The value is a generic localhost example, not an identified live credential. No databases/dumps, uploaded/generated documents, logs, backups, private keys, API keys or user/account records were found in the tracked snapshot beyond the embedded client information described above. Historical source commits were not audited or transferred.
- Preserved reusable models, startup schema logic, finance/stock calculations, frontend, print bridge, maintenance/audit scripts, documentation, tests and build/deployment files. Maintenance scripts were copied as code and were not executed against any database.
- Expanded ignore rules for local configuration, databases, keys, logs, backups, exports, uploads and payment artwork.
- Replaced the target's initial README with setup instructions. Added pytest.ini to isolate test configuration from machine-level settings.

## Validation

The final staged diff is checked for known source identifiers, sensitive-value patterns and forbidden file types. 83 Python tests passed using an isolated in-memory database; all 5 JavaScript tests passed with synthetic fixtures. Python and JavaScript syntax checks are also performed. No production database connections, deployment or physical Windows printer tests are performed.

## Exact source-file disposition

| Source path | Result / target path |
| --- | --- |
| `.env` | Excluded: private database connection configuration |
| `.env.example` | sanitized: `.env.example` |
| `.gitignore` | sanitized: `.gitignore` |
| `PRINT_BRIDGE_SETUP.md` | sanitized: `PRINT_BRIDGE_SETUP.md` |
| `README.md` | sanitized: `README.md` |
| `app/config.py` | copied unchanged: `app/config.py` |
| `app/db.py` | copied unchanged: `app/db.py` |
| `app/finance.py` | sanitized: `app/finance.py` |
| `app/ledger_cutover.py` | sanitized: `app/ledger_cutover.py` |
| `app/main.py` | sanitized: `app/main.py` |
| `app/models.py` | copied unchanged: `app/models.py` |
| `app/schemas.py` | copied unchanged: `app/schemas.py` |
| `app/stock.py` | copied unchanged: `app/stock.py` |
| `build_print_bridge_exe.bat` | sanitized: `build_print_bridge_exe.bat` |
| `clear_business_data_keep_parties.bat` | copied unchanged: `clear_business_data_keep_parties.bat` |
| `clear_business_data_keep_parties.py` | copied unchanged: `clear_business_data_keep_parties.py` |
| `docs/LEDGER_ROLLOUT.md` | copied unchanged: `docs/LEDGER_ROLLOUT.md` |
| `docs/LEDGER_RULES.md` | sanitized: `docs/LEDGER_RULES.md` |
| `docs/PARTY_BALANCE_COMPATIBILITY.md` | sanitized: `docs/PARTY_BALANCE_COMPATIBILITY.md` |
| `docs/STOCK_SHEET_RULES.md` | copied unchanged: `docs/STOCK_SHEET_RULES.md` |
| `frontend/assets/knp-icon-192.png` | Excluded: source branding/payment image |
| `frontend/assets/knp-icon-512.png` | Excluded: source branding/payment image |
| `frontend/assets/knp-icon-square.png` | Excluded: source branding/payment image |
| `frontend/assets/payment-qr.jpeg` | Excluded: source branding/payment image |
| `frontend/assets/payment-qr.png` | Excluded: source branding/payment image |
| `frontend/assets/srs-logics-logo-small.png` | Excluded: source branding/payment image |
| `frontend/assets/srs-logics-logo.png` | Excluded: source branding/payment image |
| `frontend/css/style.css` | copied unchanged: `frontend/css/style.css` |
| `frontend/health.html` | copied unchanged: `frontend/health.html` |
| `frontend/index.html` | sanitized: `frontend/index.html` |
| `frontend/js/analytics.js` | copied unchanged: `frontend/js/analytics.js` |
| `frontend/js/api.js` | sanitized: `frontend/js/api.js` |
| `frontend/js/app.js` | sanitized: `frontend/js/app.js` |
| `frontend/js/daily-sheet.js` | copied unchanged: `frontend/js/daily-sheet.js` |
| `frontend/js/dashboard.js` | copied unchanged: `frontend/js/dashboard.js` |
| `frontend/js/ledger.js` | copied unchanged: `frontend/js/ledger.js` |
| `frontend/js/reports.js` | sanitized: `frontend/js/reports.js` |
| `frontend/js/retail.js` | sanitized: `frontend/js/retail.js` |
| `frontend/js/upload.js` | copied unchanged: `frontend/js/upload.js` |
| `frontend/manifest.webmanifest` | sanitized: `frontend/manifest.webmanifest` |
| `frontend/sw.js` | sanitized: `frontend/sw.js` |
| `install_knp_signature_startup.bat` | sanitized: `install_finance_console_startup.bat` |
| `print_bridge.py` | sanitized: `print_bridge.py` |
| `print_bridge.spec` | sanitized: `print_bridge.spec` |
| `print_bridge_requirements.txt` | copied unchanged: `print_bridge_requirements.txt` |
| `render.yaml` | sanitized: `render.yaml` |
| `requirements.txt` | copied unchanged: `requirements.txt` |
| `scripts/audit_ledger_cutover.py` | copied unchanged: `scripts/audit_ledger_cutover.py` |
| `scripts/prepare_ledger_cutover.py` | sanitized: `scripts/prepare_ledger_cutover.py` |
| `scripts/reconcile_ledger.py` | copied unchanged: `scripts/reconcile_ledger.py` |
| `start_knp_signature_hidden.vbs` | sanitized: `start_finance_console_hidden.vbs` |
| `start_knp_signature_windows.bat` | sanitized: `start_finance_console_windows.bat` |
| `tests/__init__.py` | copied unchanged: `tests/__init__.py` |
| `tests/conftest.py` | sanitized: `tests/conftest.py` |
| `tests/party_balance_frontend.test.mjs` | sanitized: `tests/party_balance_frontend.test.mjs` |
| `tests/test_cutover_audit.py` | sanitized: `tests/test_cutover_audit.py` |
| `tests/test_finance.py` | sanitized: `tests/test_finance.py` |
| `tests/test_ledger_cutover.py` | sanitized: `tests/test_ledger_cutover.py` |
| `tests/test_legacy_party_balances.py` | copied unchanged: `tests/test_legacy_party_balances.py` |
| `tests/test_stock_sheets.py` | copied unchanged: `tests/test_stock_sheets.py` |

## Newly created files

- `frontend/assets/app-icon.svg` — neutral artwork
- `pytest.ini` — local test configuration
- `SANITIZATION_REPORT.md` — this report
