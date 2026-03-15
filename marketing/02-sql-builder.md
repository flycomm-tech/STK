# SQL Builder
## Draw a Shape. Get a Query. No SQL Required.

---

**Tagline:** Geographic database queries through point-and-click — bridge the gap between map thinking and data extraction.

---

### The Problem
Extracting cellular data from a specific geographic area requires writing complex spatial SQL queries — a task that demands both database expertise and deep knowledge of geographic coordinate systems. Most analysts think in maps, not in code. Every time they need data from a region, they must wait for a data engineer.

### What It Does
- **Visual polygon drawing** — Use freehand or rectangle tools directly on the map to define any geographic area of interest
- **Instant query generation** — The platform automatically converts your drawn shape into an optimized ClickHouse SQL query using spatial indexing functions
- **Dual query modes** — Generate analysis queries (SELECT) for investigation, or modification queries (ALTER UPDATE) to correct operator codes at scale
- **Time + operator filtering** — Layer date ranges and MCC (country) filters on top of geographic boundaries, all through a visual UI
- **One-click copy** — Queries are production-ready and copy directly into your ClickHouse console or pipeline

### Who It's For
- Data engineers and analysts working with large cellular datasets
- Security teams scoping an investigation to a specific area (city block, border zone, facility perimeter)
- Database administrators performing geographic data corrections
- Researchers extracting location-specific samples without writing raw SQL

### Why It's Different
There is no faster path from "I need data from this area" to a production-ready database query. SQL Builder removes the translation layer between visual thinking and data extraction. Shapes drawn on the map are instantly expressed as spatially-optimized queries, respecting operator, country, and time filters simultaneously. It integrates directly with the TAC Anomaly Detector — query results feed straight into threat analysis.

### Scale & Performance
- Queries target a **530M+ row ClickHouse** database with spatial indexing
- Supports multi-vertex polygons across any geographic region globally
- Generates queries for **all major cellular technologies** and operator codes
