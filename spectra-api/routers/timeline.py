"""
Timeline endpoint — returns time-bucketed RSU snapshots from ClickHouse.

GET /api/timeline
  ?from_ts=<ISO datetime>   e.g. 2025-03-01T00:00:00
  ?to_ts=<ISO datetime>     e.g. 2025-03-01T23:59:59
  ?bucket_minutes=<int>     1 | 5 | 15 | 60  (default 5)
  ?imei=<str>               optional — filter to a single IMEI

Response:
  {
    "frames": [
      {
        "t": "2025-03-01T00:05:00",
        "rsus": [
          { "imei", "lat", "lng", "rsrp", "tech", "operator", "plmn", "tac", "samples" }
        ]
      },
      ...
    ],
    "total_frames": <int>,
    "from_ts": <str>,
    "to_ts": <str>,
    "bucket_minutes": <int>
  }
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from config import MODEM_SOURCE

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


@router.get("/range")
def get_timeline_range():
    """Return the earliest and latest timestamp available for modem data."""
    from clickhouse import run_query_one
    try:
        row = run_query_one(f"""
            SELECT
                toString(min(timestamp)) AS min_ts,
                toString(max(timestamp)) AS max_ts
            FROM measurements
            WHERE source = '{MODEM_SOURCE}'
              AND deviceInfo_imei != ''
              AND signal_rsrp != 0
        """)
        return {"min_ts": row.get("min_ts", ""), "max_ts": row.get("max_ts", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
def get_timeline(
    from_ts: str = Query(..., description="ISO start datetime e.g. 2025-03-01T00:00:00"),
    to_ts: str   = Query(..., description="ISO end datetime e.g.   2025-03-01T23:59:59"),
    bucket_minutes: int  = Query(5, ge=1, le=60, description="Bucket size in minutes"),
    imei: Optional[str]  = Query(None, description="Filter to a specific IMEI"),
):
    from clickhouse import run_query

    # Build optional IMEI filter clause
    imei_clause = f"AND deviceInfo_imei = '{imei}'" if imei else ""

    sql = f"""
SELECT
    toStartOfInterval(timestamp, INTERVAL {bucket_minutes} MINUTE)   AS t,
    deviceInfo_imei                                                   AS imei,
    round(argMax(location_geo_coordinates.2, timestamp), 6)          AS lat,
    round(argMax(location_geo_coordinates.1, timestamp), 6)          AS lng,
    argMax(signal_rsrp, timestamp)                                    AS rsrp,
    argMax(tech, timestamp)                                           AS tech,
    argMax(network_operator, timestamp)                               AS operator,
    argMax(network_PLMN, timestamp)                                   AS plmn,
    argMax(cell_tac, timestamp)                                       AS tac,
    count()                                                           AS samples
FROM measurements
WHERE source = '{MODEM_SOURCE}'
  AND deviceInfo_imei != ''
  AND timestamp >= toDateTime('{from_ts}')
  AND timestamp <= toDateTime('{to_ts}')
  AND signal_rsrp != 0
  AND location_geo_coordinates.2 != 0
  {imei_clause}
GROUP BY t, imei
ORDER BY t ASC, imei ASC
"""

    try:
        rows = run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Group rows by timestamp bucket into frames
    frames_map: dict = {}
    for row in rows:
        t = str(row.get("t", ""))
        if t not in frames_map:
            frames_map[t] = []
        frames_map[t].append({
            "imei":     row.get("imei", ""),
            "lat":      float(row.get("lat") or 0),
            "lng":      float(row.get("lng") or 0),
            "rsrp":     int(row.get("rsrp") or 0),
            "tech":     row.get("tech", ""),
            "operator": row.get("operator", ""),
            "plmn":     row.get("plmn", ""),
            "tac":      int(row.get("tac") or 0),
            "samples":  int(row.get("samples") or 0),
        })

    frames = [{"t": t, "rsus": rsus} for t, rsus in sorted(frames_map.items())]

    return {
        "frames":        frames,
        "total_frames":  len(frames),
        "from_ts":       from_ts,
        "to_ts":         to_ts,
        "bucket_minutes": bucket_minutes,
    }
