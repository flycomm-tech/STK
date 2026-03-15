# DB Dashboard
## Your Entire Cellular Dataset. At a Glance.

---

**Tagline:** Know your data — volume, quality, growth, and distribution — without writing a single query.

---

### The Problem
Organizations collecting cellular measurement data at scale often lack visibility into the health of that data. How many measurements were collected last month? Which data sources are contributing most? Are signal quality averages degrading? Answering these questions typically requires a data engineer and hours of custom reporting.

### What It Does
- **Live KPI cards** — Total measurements, unique devices, unique cells globally, and average monthly growth — refreshed directly from the database on demand
- **Data source breakdown** — See exactly which SDKs, partners, and hardware sources are contributing data, their sample volumes, and their percentage of the total dataset
- **Technology distribution** — Instantly understand the split between 5G NR, LTE, WCDMA, and GSM across your entire dataset
- **Signal quality benchmarking** — Average RSRP, RSRQ, and SNR broken down by technology, enabling at-a-glance quality assessment
- **Geographic and operator intelligence** — Top countries by measurement volume, top operators by market share, and internet speed benchmarks (download, upload, latency) per operator and technology
- **Daily activity trends** — 60-day visualization of measurement volume, enabling growth tracking and anomaly detection in collection patterns

### Who It's For
- Data analytics and data engineering teams monitoring collection health
- Product managers reviewing platform performance and partner contributions
- Executive stakeholders needing a high-level view of dataset scale
- Database administrators planning capacity and infrastructure
- Business development teams assessing data asset value for partnerships

### Why It's Different
DB Dashboard gives non-technical stakeholders the same visibility as a data engineer — without any SQL knowledge required. All 11+ metric categories are populated in real time from a live ClickHouse connection, ensuring no stale reports or outdated snapshots. Flexible time filtering (presets or custom ranges) means any question about dataset health can be answered in seconds.

### Scale & Performance
- Visualizes data across **530M+ measurement rows** in real time
- Tracks **7+ data source types** including SDK, hardware modems, and partner apps
- Monitors **hardware from 7 unique Teltonika RSU devices** across Israel
- Covers **10+ countries** with per-country sample counts and operator breakdowns
