# One Render service with Supabase

Create one Python Web Service from `MSParate-finance-console`, branch `main`. Leave Root Directory blank.

| Setting | Value |
| --- | --- |
| Build | `pip install -r requirements.txt` |
| Start | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/healthz` |
| DATABASE_URL | Your private Supabase session-pooler URL on port 5432, with URL-encoded password |
| LEDGER_CUTOVER_DATE | `1970-01-01` |

Store DATABASE_URL only in Render's backend environment settings. Local `.env` is ignored by Git and is not uploaded to Render. The application requires TLS for Supabase connections.

Open the service's public HTTPS URL to use the application. It serves both frontend files and backend API routes. No Static Site or separate frontend URL configuration is needed. The frontend uses the same origin and ignores old browser-stored API addresses. Only public frontend assets are exempt from API authentication and eligible for offline caching.

Startup creates missing application tables under a database lock before compatibility migrations. Supabase application tables have row-level security enabled; access uses the server's database connection and the app's own login. Supabase Auth is not required. Create the first owner through the application when no owner exists.

For local use: configure `.env`, then run `uvicorn app.main:app --host 127.0.0.1 --port 8000` and open http://127.0.0.1:8000. Printer bridge remains a local Windows utility for physical printing.
