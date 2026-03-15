"""Cluster endpoints — reads from SQLite, enriches with live ClickHouse RSU counts."""
import json
import uuid
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from clickhouse import run_query
from config import MODEM_SOURCE
from database import get_db
from models import Cluster, RSURecord

router = APIRouter(prefix="/api/clusters", tags=["clusters"])

# Seed colors for pre-defined clusters
_SEED_COLORS = {
    "arava-south":   "#3b82f6",
    "galilee-north": "#10b981",
    "jerusalem":     "#f59e0b",
}


class ClusterCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#3b82f6"
    polygon: Optional[List[Any]] = None
    organization_id: Optional[str] = "org-spectra"
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    polygon: Optional[List[Any]] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    organization_id: Optional[str] = None


def _live_heartbeats() -> dict:
    """Fetch latest RSU timestamps from ClickHouse (best-effort)."""
    sql = f"""
SELECT deviceInfo_imei AS imei, max(timestamp) AS last_seen
FROM measurements
WHERE source = '{MODEM_SOURCE}' AND deviceInfo_imei != ''
GROUP BY imei
"""
    try:
        return {r["imei"]: r["last_seen"] for r in run_query(sql)}
    except Exception:
        return {}


def _build_cluster(c: Cluster, rsus: list, heartbeats: dict) -> dict:
    from datetime import datetime, timezone
    online = 0
    for r in rsus:
        ts = heartbeats.get(r.imei)
        if ts:
            try:
                t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - t).total_seconds() < 300:
                    online += 1
            except Exception:
                pass
    polygon = []
    if c.polygon_json:
        try:
            polygon = json.loads(c.polygon_json)
        except Exception:
            pass
    color = c.color or _SEED_COLORS.get(c.id, "#6b7280")
    return {
        "id":              c.id,
        "name":            c.name,
        "color":           color,
        "description":     c.description or "",
        "organization_id": c.organization_id,
        "center_lat":      c.lat,
        "center_lng":      c.lng,
        "rsu_count":       len(rsus),
        "online_count":    online,
        "polygon":         polygon,
        "created_date":    c.created_at.isoformat() if c.created_at else None,
    }


@router.get("")
def list_clusters(
    organization_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Cluster)
    if organization_id:
        q = q.filter_by(organization_id=organization_id)
    clusters = q.all()
    heartbeats = _live_heartbeats()
    result = []
    for c in clusters:
        rsus = db.query(RSURecord).filter_by(cluster_id=c.id, is_active=True).all()
        result.append(_build_cluster(c, rsus, heartbeats))
    return result


@router.post("")
def create_cluster(body: ClusterCreate, db: Session = Depends(get_db)):
    c = Cluster(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        color=body.color or "#3b82f6",
        organization_id=body.organization_id or "org-spectra",
        lat=body.center_lat,
        lng=body.center_lng,
        polygon_json=json.dumps(body.polygon) if body.polygon else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _build_cluster(c, [], {})


@router.get("/{cluster_id}")
def get_cluster(cluster_id: str, db: Session = Depends(get_db)):
    c = db.query(Cluster).filter_by(id=cluster_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cluster not found")
    rsus = db.query(RSURecord).filter_by(cluster_id=cluster_id, is_active=True).all()
    heartbeats = _live_heartbeats()
    return _build_cluster(c, rsus, heartbeats)


@router.put("/{cluster_id}")
def update_cluster(cluster_id: str, body: ClusterUpdate, db: Session = Depends(get_db)):
    c = db.query(Cluster).filter_by(id=cluster_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if body.name is not None:            c.name = body.name
    if body.description is not None:     c.description = body.description
    if body.color is not None:           c.color = body.color
    if body.center_lat is not None:      c.lat = body.center_lat
    if body.center_lng is not None:      c.lng = body.center_lng
    if body.polygon is not None:         c.polygon_json = json.dumps(body.polygon)
    if body.organization_id is not None: c.organization_id = body.organization_id
    db.commit()
    db.refresh(c)
    rsus = db.query(RSURecord).filter_by(cluster_id=cluster_id, is_active=True).all()
    return _build_cluster(c, rsus, {})


@router.delete("/{cluster_id}")
def delete_cluster(cluster_id: str, db: Session = Depends(get_db)):
    c = db.query(Cluster).filter_by(id=cluster_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cluster not found")
    db.delete(c)
    db.commit()
    return {"ok": True, "id": cluster_id}
