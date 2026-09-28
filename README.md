# MSParate Finance Console

Reusable FastAPI, PostgreSQL and browser finance application, sanitized for a fresh deployment.

## Local setup

Create a virtual environment and install `requirements.txt`. Copy `.env.example` to `.env` and configure a **new** PostgreSQL database. Start the backend with `uvicorn app.main:app --host 127.0.0.1 --port 8000`. Serve `frontend/` with `python -m http.server 8080 --directory frontend` and open http://127.0.0.1:8080.

The frontend defaults to the local backend. For deployment set `window.FINANCE_CONSOLE_API_URL` before loading `js/api.js`, or the equivalent localStorage key, to your own backend. Browser storage keys are isolated from the source app. Set up the first owner through the application's setup screen; no accounts or passwords are supplied.

The backend creates/updates schema at startup. No business records are included. A generic Main Outlet is initialized. The default cutover date uses the account ledger for new installations; configure legacy migration deliberately.

Receipt identity fields and payment QR configuration in `frontend/js/retail.js` are blank/neutral. Payment QR is hidden until both an image and payment ID are configured. The optional print bridge reads PAYMENT_UPI_ID from its process environment and uses a locally supplied payment image; neither is included. Never commit private configuration or payment images.

## Validation

Install pytest alongside the application dependencies, then run `python -m pytest -q` and `node --test tests/party_balance_frontend.test.mjs`. Tests use synthetic fixtures and an isolated in-memory database.

See `SANITIZATION_REPORT.md` for the exact transfer inventory. Windows printing requires its platform dependencies and a physical printer.
