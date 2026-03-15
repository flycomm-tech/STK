"""Seed the SQLite DB with the default org, super-admin user, clusters and RSU fleet.
Called once at startup if tables are empty.
"""
from database import engine, SessionLocal, Base, migrate_add_columns
from models import Organization, User, RSURecord, Cluster
from config import RSU_FLEET, CLUSTERS, SUPER_ADMIN


def init_db():
    """Create tables, run migrations, and seed initial data."""
    Base.metadata.create_all(bind=engine)
    migrate_add_columns()   # add new columns to existing DB without data loss
    db = SessionLocal()
    try:
        # ── Default organisation ───────────────────────────────────
        if not db.query(Organization).first():
            db.add(Organization(
                id="org-spectra",
                name="Spectra",
                slug="spectra",
                plan_tier="pro",
                max_rsus=20,
            ))

        # ── Super-admin user ───────────────────────────────────────
        if not db.query(User).filter_by(id=SUPER_ADMIN["id"]).first():
            db.add(User(
                id=SUPER_ADMIN["id"],
                email=SUPER_ADMIN["email"],
                full_name=SUPER_ADMIN["full_name"],
                organization_id=SUPER_ADMIN["organization_id"],
                role="admin",
                is_super_admin=True,
            ))

        # ── Clusters ───────────────────────────────────────────────
        for c in CLUSTERS:
            if not db.query(Cluster).filter_by(id=c["id"]).first():
                db.add(Cluster(
                    id=c["id"],
                    name=c["name"],
                    organization_id="org-spectra",
                    lat=c.get("center_lat", c.get("lat", 0)),
                    lng=c.get("center_lng", c.get("lng", 0)),
                    description=c.get("description", ""),
                    color=c.get("color", "#3b82f6"),
                ))

        # ── RSU fleet ──────────────────────────────────────────────
        for rsu in RSU_FLEET:
            if not db.query(RSURecord).filter_by(imei=rsu["imei"]).first():
                db.add(RSURecord(
                    imei=rsu["imei"],
                    model=rsu["model"],
                    generation=rsu["generation"],
                    location_name=rsu["location_name"],
                    cluster_id=rsu["cluster_id"],
                    organization_id="org-spectra",
                    lat=rsu["lat"],
                    lng=rsu["lng"],
                    is_active=True,
                ))

        db.commit()
        print("  DB seeded OK — org, super-admin, clusters and RSU fleet loaded.")
    except Exception as e:
        db.rollback()
        print(f"  DB seed error: {e}")
    finally:
        db.close()
