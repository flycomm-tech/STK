"""SQLAlchemy SQLite setup for Spectra app data (orgs, users, RSUs, clusters)."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# On Vercel the filesystem is read-only except /tmp; fall back to local path in dev
_default_db = os.path.join(os.path.dirname(__file__), "spectra.db")
DB_PATH = os.getenv("SQLITE_PATH", _default_db)
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_add_columns():
    """Add new columns to existing tables without dropping data (SQLite ALTER TABLE)."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        insp = inspect(engine)
        # organizations.is_demo
        org_cols = {c["name"] for c in insp.get_columns("organizations")}
        if "is_demo" not in org_cols:
            conn.execute(text("ALTER TABLE organizations ADD COLUMN is_demo BOOLEAN DEFAULT 0"))
        # rsus.manual_status
        rsu_cols = {c["name"] for c in insp.get_columns("rsus")}
        if "manual_status" not in rsu_cols:
            conn.execute(text("ALTER TABLE rsus ADD COLUMN manual_status VARCHAR"))
        conn.commit()
