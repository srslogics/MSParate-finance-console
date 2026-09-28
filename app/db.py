from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

# Select the driver installed by requirements.txt explicitly. SQLAlchemy 2.1
# otherwise selects psycopg (v3) for plain postgresql:// connection strings.
database_url = make_url(DATABASE_URL)
if database_url.drivername in {"postgres", "postgresql"}:
    database_url = database_url.set(drivername="postgresql+psycopg2")

IS_SUPABASE_DATABASE = (database_url.host or "").lower().endswith(
    (".supabase.com", ".supabase.co")
)
connection_options = {"sslmode": "require", "connect_timeout": 10} if IS_SUPABASE_DATABASE else {}
engine = create_engine(database_url, pool_pre_ping=True, connect_args=connection_options)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()
