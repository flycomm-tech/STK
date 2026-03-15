# Anomaly Workbench
## One Platform. Ten Detection Methods. Live Database Queries.

---

**Tagline:** Enterprise-grade cellular threat detection — comprehensive, live, and built for security operations centers.

---

### The Problem
Sophisticated actors don't exploit just one vulnerability. IMSI-catchers, signal spoofing, forced downgrade attacks, and geographic anomalies often appear simultaneously or in sequence. Security teams relying on single-method detection tools are always one step behind — and spending hours manually correlating findings across multiple tools.

### What It Does
- **10 simultaneous detection methods** — TAC anomalies, PLMN/operator mismatches, signal spoofing patterns, geographic anomalies, temporal patterns, and more — all configurable and tunable from a single interface
- **Live ClickHouse integration** — Queries run directly against the production database in real time, with no stale exports or data lag
- **Batch scan mode** — Run all 10 detection methods in a single operation and receive a unified, correlated results set
- **Correlation engine** — When related anomalies are detected by multiple methods, the platform surfaces the connection — turning individual findings into threat intelligence
- **Polygon-based geographic scoping** — Draw an area of interest on the map to focus detection on a specific region, installation, or border zone
- **Per-method threshold controls** — Each detection algorithm has independent sensitivity tuning, eliminating alert fatigue without sacrificing coverage

### Who It's For
- Security operations centers (SOCs) running continuous cellular threat monitoring
- National telecom regulators requiring systematic network surveillance
- Advanced threat analysts conducting investigations with live data
- SIGINT teams performing area-specific threat sweeps
- Organizations with a large cellular measurement infrastructure needing a centralized detection hub

### Why It's Different
Anomaly Workbench is the only platform that combines live database connectivity with multi-vector detection and built-in cross-method correlation. Most tools require analysts to run separate scans, export results, and manually join findings. Here, that entire workflow is automated — from query to correlation to prioritized alert — in a single operation. Threshold controls ensure the platform adapts to your operational environment rather than forcing analysts to filter noise manually.

### Scale & Performance
- Connects directly to **ClickHouse** clusters handling **500M+ measurement rows**
- Configurable result limits from **100 to 2,000 rows per scan**
- Time range presets cover **24 hours, 7 days, or 30 days** with custom date/time support
- Generates production-ready **SQL queries** for audit trails and integration into existing pipelines
