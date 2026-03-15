"""RSU endpoints.

Architecture:
  SQLite (RSURecord) = source of truth for the registered fleet.
  ClickHouse         = optional enrichment (live signal, GPS, status).
  When CH is unavailable all registered RSUs are returned with offline status.
"""
import uuid
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import RSURecord
from config import MODEM_SOURCE

router = APIRouter(prefix="/api/rsus", tags=["rsus"])


# ── Pydantic models ───────────────────────────────────────────────

class RSUCreate(BaseModel):
    # Accept both 'imei' (backend) and 'device_id' (frontend form)
    imei: Optional[str] = None
    device_id: Optional[str] = None
    model: Optional[str] = ""
    generation: Optional[str] = ""
    location_name: Optional[str] = ""
    cluster_id: Optional[str] = ""
    organization_id: Optional[str] = "org-spectra"
    # Accept both lat/lng (backend) and latitude/longitude (frontend form)
    lat: Optional[float] = None
    lng: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = ""
    # Ignore extra frontend fields
    status: Optional[str] = None
    firmware: Optional[str] = None
    hardware_rev: Optional[str] = None

    def resolved_imei(self) -> str:
        return (self.imei or self.device_id or "").strip()

    def resolved_lat(self) -> Optional[float]:
        return self.lat if self.lat is not None else self.latitude

    def resolved_lng(self) -> Optional[float]:
        return self.lng if self.lng is not None else self.longitude


class RSUUpdate(BaseModel):
    location_name: Optional[str] = None
    cluster_id: Optional[str] = None
    organization_id: Optional[str] = None
    model: Optional[str] = None
    generation: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    # Accept latitude/longitude aliases from frontend drag handler
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None   # manual override: online | idle | offline | error

    def resolved_lat(self) -> Optional[float]:
        return self.lat if self.lat is not None else self.latitude

    def resolved_lng(self) -> Optional[float]:
        return self.lng if self.lng is not None else self.longitude


# ── Helpers ───────────────────────────────────────────────────────

def _status(last_seen_str: Optional[str]) -> str:
    if not last_seen_str:
        return "offline"
    try:
        ts = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - ts).total_seconds()
        if age < 300:    return "online"
        if age < 3600:   return "idle"
        return "offline"
    except Exception:
        return "offline"


def _ch_summary() -> dict:
    """
    Query ClickHouse for per-IMEI live data.
    Returns dict keyed by IMEI or {} if CH is unreachable.
    """
    from clickhouse import run_query
    sql = f"""
SELECT
    deviceInfo_imei                                                 AS imei,
    deviceInfo_deviceModel                                          AS model,
    any(deviceInfo_deviceReleaseVersion)                            AS firmware,
    anyIf(deviceInfo_modemVersion, deviceInfo_modemVersion != '')   AS modem_fw,
    round(avg(deviceInfo_temperature), 1)                           AS avg_temp_c,
    round(argMax(deviceInfo_temperature, timestamp), 1)             AS last_temp_c,
    max(deviceInfo_uptime)                                          AS max_uptime_sec,
    min(timestamp)                                                  AS first_seen,
    max(timestamp)                                                  AS last_seen,
    count()                                                         AS total_samples,
    round(argMax(location_geo_coordinates.2, timestamp), 6)         AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6)         AS lng,
    argMax(location_accuracy, timestamp)                            AS gps_accuracy,
    argMax(satellites_gps_satellitesNo, timestamp)                  AS gps_satellites,
    argMax(tech, timestamp)                                         AS last_tech,
    argMax(network_operator, timestamp)                             AS last_operator,
    argMax(network_PLMN, timestamp)                                 AS last_plmn,
    argMax(signal_rsrp, timestamp)                                  AS last_rsrp,
    argMax(signal_rsrq, timestamp)                                  AS last_rsrq,
    argMax(signal_rssi, timestamp)                                  AS last_rssi,
    argMax(band_number, timestamp)                                  AS last_band
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
GROUP BY imei, model
"""
    try:
        rows = run_query(sql)
        index: dict = {}
        for r in rows:
            imei = r.get("imei", "")
            if imei and (imei not in index or
                         int(r.get("total_samples", 0)) > int(index[imei].get("total_samples", 0))):
                index[imei] = r
        return index
    except Exception:
        return {}


def _build_rsu(rec: RSURecord, ch: Optional[dict] = None) -> dict:
    """Build the RSU response dict from SQLite record + optional CH data."""
    ch = ch or {}
    last_seen = ch.get("last_seen")
    lat = float(ch.get("lat") or rec.lat or 0)
    lng = float(ch.get("lng") or rec.lng or 0)
    return {
        "id":              rec.imei,
        "device_id":       rec.imei,
        "organization_id": rec.organization_id or "org-spectra",
        "cluster_id":      rec.cluster_id or "",
        "latitude":        lat,
        "longitude":       lng,
        "location_name":   rec.location_name or rec.imei,
        "status":          rec.manual_status or _status(last_seen),
        "firmware":        ch.get("firmware", ""),
        "hardware_rev":    f"{rec.model or ''} / {ch.get('modem_fw', '')}".strip(" /"),
        "uptime_hours":    round(int(ch.get("max_uptime_sec") or 0) / 3600, 1),
        "last_heartbeat":  last_seen,
        "created_date":    ch.get("first_seen") or (rec.registered_at.isoformat() if rec.registered_at else None),
        "model":           rec.model or ch.get("model", ""),
        "generation":      rec.generation or "",
        "notes":           rec.notes or "",
        "is_active":       rec.is_active,
        "avg_temp_c":      float(ch.get("avg_temp_c") or 0),
        "last_temp_c":     float(ch.get("last_temp_c") or 0),
        "gps_accuracy_m":  float(ch.get("gps_accuracy") or 0),
        "gps_satellites":  int(ch.get("gps_satellites") or 0),
        "last_tech":       ch.get("last_tech", ""),
        "last_operator":   ch.get("last_operator", ""),
        "last_plmn":       ch.get("last_plmn", ""),
        "last_rsrp":       int(ch.get("last_rsrp") or 0),
        "last_rsrq":       int(ch.get("last_rsrq") or 0) if ch.get("last_rsrq") else None,
        "last_rssi":       int(ch.get("last_rssi") or 0) if ch.get("last_rssi") else None,
        "last_band":       int(ch.get("last_band") or 0) if ch.get("last_band") else None,
        "total_samples":   int(ch.get("total_samples") or 0),
    }


# ── List ──────────────────────────────────────────────────────────

@router.get("")
def list_rsus(
    cluster_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all registered RSUs. CH data enriches each RSU when available."""
    ch_index = _ch_summary()   # empty dict if CH is down — no crash

    q = db.query(RSURecord).filter_by(is_active=True)
    if organization_id:
        q = q.filter_by(organization_id=organization_id)
    if cluster_id:
        q = q.filter_by(cluster_id=cluster_id)

    rsus = [_build_rsu(rec, ch_index.get(rec.imei)) for rec in q.all()]

    if status:
        rsus = [r for r in rsus if r["status"] == status]

    return rsus


# ── Create ────────────────────────────────────────────────────────

@router.post("")
def create_rsu(body: RSUCreate, db: Session = Depends(get_db)):
    """Register a new RSU by IMEI (or device_id)."""
    imei = body.resolved_imei()
    if not imei:
        raise HTTPException(status_code=422, detail="imei or device_id is required")
    if db.query(RSURecord).filter_by(imei=imei).first():
        raise HTTPException(status_code=409, detail=f"RSU with IMEI {imei} already registered")
    rec = RSURecord(
        id=str(uuid.uuid4()),
        imei=imei,
        model=body.model,
        generation=body.generation,
        location_name=body.location_name or imei,
        cluster_id=body.cluster_id,
        organization_id=body.organization_id or "org-spectra",
        lat=body.resolved_lat(),
        lng=body.resolved_lng(),
        notes=body.notes,
        is_active=True,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _build_rsu(rec)


# ── Get one ───────────────────────────────────────────────────────

@router.get("/{imei}")
def get_rsu(imei: str, db: Session = Depends(get_db)):
    rec = db.query(RSURecord).filter_by(imei=imei).first()
    if not rec:
        raise HTTPException(status_code=404, detail="RSU not found")
    ch_index = _ch_summary()
    return _build_rsu(rec, ch_index.get(imei))


# ── Update ────────────────────────────────────────────────────────

@router.put("/{imei}")
def update_rsu(imei: str, body: RSUUpdate, db: Session = Depends(get_db)):
    """Rename, reassign cluster/org, move, add notes — any metadata update."""
    from models import Cluster
    rec = db.query(RSURecord).filter_by(imei=imei).first()
    if not rec:
        raise HTTPException(status_code=404, detail="RSU not found")
    if body.location_name  is not None: rec.location_name  = body.location_name
    if body.cluster_id     is not None:
        rec.cluster_id = body.cluster_id
        # Auto-sync organization_id to match the cluster's org (if cluster exists)
        if body.cluster_id:
            cluster = db.query(Cluster).filter_by(id=body.cluster_id).first()
            if cluster and cluster.organization_id:
                rec.organization_id = cluster.organization_id
    if body.organization_id is not None: rec.organization_id = body.organization_id
    if body.model          is not None: rec.model          = body.model
    if body.generation     is not None: rec.generation     = body.generation
    resolved_lat = body.resolved_lat()
    resolved_lng = body.resolved_lng()
    if resolved_lat is not None: rec.lat = resolved_lat
    if resolved_lng is not None: rec.lng = resolved_lng
    if body.notes          is not None: rec.notes          = body.notes
    if body.is_active      is not None: rec.is_active      = body.is_active
    if body.status         is not None: rec.manual_status  = body.status
    db.commit()
    db.refresh(rec)
    return _build_rsu(rec)


# ── Delete ────────────────────────────────────────────────────────

@router.delete("/{imei}")
def delete_rsu(imei: str, db: Session = Depends(get_db)):
    """Deactivate an RSU (soft delete — keeps history)."""
    rec = db.query(RSURecord).filter_by(imei=imei).first()
    if not rec:
        raise HTTPException(status_code=404, detail="RSU not found")
    rec.is_active = False
    db.commit()
    return {"ok": True, "imei": imei}


# ── Signal history ────────────────────────────────────────────────

@router.get("/{imei}/signal")
def get_rsu_signal(imei: str, hours: int = Query(24, ge=1, le=720)):
    from clickhouse import run_query
    sql = f"""
SELECT
    toStartOfHour(timestamp)       AS hour,
    round(avg(signal_rsrp), 1)     AS rsrp,
    round(avg(signal_rsrq), 1)     AS rsrq,
    round(avg(signal_rssi), 1)     AS rssi,
    round(avg(signal_snr),  1)     AS snr,
    argMax(tech, timestamp)        AS tech,
    argMax(network_PLMN, timestamp) AS plmn,
    argMax(band_number, timestamp)  AS band,
    count()                        AS samples
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY hour
ORDER BY hour ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Cell list ─────────────────────────────────────────────────────

@router.get("/{imei}/cells")
def get_rsu_cells(imei: str):
    from clickhouse import run_query
    sql = f"""
SELECT
    cell_eci AS eci, cell_pci AS pci, cell_tac AS tac,
    network_PLMN AS plmn, network_operator AS operator,
    tech, band_number AS band,
    round(avg(signal_rsrp), 1) AS avg_rsrp,
    count() AS n, max(timestamp) AS last_seen
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY eci, pci, tac, plmn, operator, tech, band
ORDER BY n DESC LIMIT 50
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── GPS track ─────────────────────────────────────────────────────

@router.get("/{imei}/gps")
def get_rsu_gps(imei: str, hours: int = Query(24, ge=1, le=720)):
    from clickhouse import run_query
    sql = f"""
SELECT
    toStartOfMinute(timestamp)                            AS minute,
    round(argMax(location_geo_coordinates.2, timestamp), 6) AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6) AS lng,
    round(avg(location_accuracy), 2)                      AS accuracy_m,
    argMax(satellites_gps_satellitesNo, timestamp)        AS gps_sats,
    round(avg(deviceInfo_temperature), 1)                 AS temp_c
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei = '{imei}'
  AND timestamp >= now() - INTERVAL {hours} HOUR
GROUP BY minute ORDER BY minute ASC
"""
    try:
        return run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
