"""Database URL handling checks; imports create engines without connecting."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('url,driver,supabase,password', [
    ('postgresql://example:example%25password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', 'psycopg2', True, 'example%password'),
    ('postgres://example:example@localhost:5432/finance', 'psycopg2', False, 'example'),
    ('sqlite:///:memory:', 'pysqlite', False, None),
])
def test_database_configuration_without_network(url, driver, supabase, password):
    result = subprocess.run([sys.executable, '-c', '''
import json
from app.db import engine, IS_SUPABASE_DATABASE, connection_options
print(json.dumps({"driver": engine.dialect.driver, "supabase": IS_SUPABASE_DATABASE,
                  "password": engine.url.password, "options": connection_options}))
engine.dispose()
'''], cwd=ROOT, env={**os.environ, 'DATABASE_URL': url}, text=True, capture_output=True, check=True)
    settings = json.loads(result.stdout)
    assert settings['driver'] == driver
    assert settings['supabase'] == supabase
    assert settings['password'] == password
    assert settings['options'] == ({'sslmode': 'require', 'connect_timeout': 10} if supabase else {})


def test_missing_url_fails_without_falling_back_to_local_env():
    result = subprocess.run([sys.executable, '-c', 'import app.db'], cwd=ROOT,
                            env={**os.environ, 'DATABASE_URL': ''}, text=True, capture_output=True)
    assert result.returncode != 0
    assert 'DATABASE_URL environment variable is required' in result.stderr
