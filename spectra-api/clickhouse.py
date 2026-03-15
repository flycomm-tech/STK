"""ClickHouse HTTP client — uses requests for reliable SSL on Vercel."""
from typing import Optional
import urllib3
import requests as http_requests
from config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL

# Vercel's Python 3.9 OpenSSL build has TLS compatibility issues with
# ClickHouse Cloud — disable verification for this server-to-server call.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def run_query(sql: str) -> list[dict]:
    """Execute a ClickHouse SQL query, return rows as list of dicts."""
    protocol = "https" if CH_SSL else "http"
    url = f"{protocol}://{CH_HOST}:{CH_PORT}/"

    resp = http_requests.post(
        url,
        params={"database": CH_DB, "default_format": "JSON"},
        data=sql.encode("utf-8"),
        auth=(CH_USER, CH_PASSWORD),
        headers={"Content-Type": "text/plain; charset=utf-8"},
        timeout=30,
        verify=False,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"ClickHouse HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json().get("data", [])


def run_query_one(sql: str) -> Optional[dict]:
    """Return the first row or None."""
    rows = run_query(sql)
    return rows[0] if rows else None
