"""ClickHouse HTTP client — uses httpx for Vercel TLS compatibility."""
from typing import Optional
from config import CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL


def _get_client(verify_ssl: bool = True):
    """Build an httpx client (lazy import so httpx is only needed when CH is used).

    ClickHouse Cloud requires TLS 1.2 pinning. We use certifi's CA bundle
    for proper certificate verification instead of disabling it entirely.
    """
    import httpx
    import ssl
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.maximum_version = ssl.TLSVersion.TLSv1_2
    if not verify_ssl:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return httpx.Client(verify=ctx, timeout=30.0)


def _execute(sql: str, host: str, port: int, db: str,
             ch_user: str, password: str, use_ssl: bool) -> list[dict]:
    """Low-level: execute SQL against a ClickHouse instance."""
    import base64
    protocol = "https" if use_ssl else "http"
    url = f"{protocol}://{host}:{port}/"
    creds = base64.b64encode(f"{ch_user}:{password}".encode()).decode()

    client = _get_client(verify_ssl=use_ssl)
    try:
        resp = client.post(
            url,
            params={"database": db, "default_format": "JSON"},
            content=sql.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "Authorization": f"Basic {creds}",
            },
        )
    finally:
        client.close()

    if resp.status_code != 200:
        raise RuntimeError(f"ClickHouse HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json().get("data", [])


def run_query(sql: str) -> list[dict]:
    """Execute a ClickHouse SQL query using global (env) credentials."""
    return _execute(sql, CH_HOST, CH_PORT, CH_DB, CH_USER, CH_PASSWORD, CH_SSL)


def run_query_one(sql: str) -> Optional[dict]:
    """Return the first row or None."""
    rows = run_query(sql)
    return rows[0] if rows else None


def run_query_for_org(sql: str, org) -> list[dict]:
    """Execute a query using per-organization ClickHouse credentials."""
    return _execute(
        sql,
        host=org.ch_host,
        port=org.ch_port or 8443,
        db=org.ch_db or "default",
        ch_user=org.ch_user,
        password=org.ch_password,
        use_ssl=bool(org.ch_ssl) if org.ch_ssl is not None else True,
    )


def run_query_with_creds(sql: str, host: str, port: int, db: str,
                         ch_user: str, password: str, ssl: bool = True) -> list[dict]:
    """Execute a query with arbitrary credentials (for connection testing)."""
    return _execute(sql, host, port, db, ch_user, password, ssl)
