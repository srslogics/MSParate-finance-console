"""Exercise the combined service shell without touching the database."""
import asyncio
import httpx
from fastapi import FastAPI
from app.web import mount_frontend, is_frontend_path


def test_public_shell_and_asset_boundaries():
    app = FastAPI()
    mount_frontend(app)

    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            for path in ['/', '/index.html', '/js/api.js', '/css/usability.css', '/assets/app-icon.svg', '/sw.js', '/manifest.webmanifest']:
                response = await client.get(path)
                assert response.status_code == 200
                assert is_frontend_path(path)
            assert 'MSParte' in (await client.get('/')).text
            assert (await client.get('/?filename=../.env')).text == (await client.get('/')).text
            for path in ['/.env', '/app/db.py', '/js/%2e%2e/%2e%2e/.env']:
                assert (await client.get(path)).status_code == 404
    asyncio.run(check())
    for path in ['/dashboard', '/party/ledger', '/retail-bills', '/reports/export', '/js-private']:
        assert not is_frontend_path(path)
