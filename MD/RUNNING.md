# IntraAI — How to Run

Three processes, three terminals.

---

## 1. Analysis Suite (HTML tools) — port 8000

```bash
cd "Advance Cell Report"
python3 -m http.server 8000
```

Open → http://localhost:8000

---

## 2. Spectra API (FastAPI + ClickHouse + SQLite) — port 8001

```bash
cd "Advance Cell Report/spectra-api"
cp .env.example .env        # first time only — fill in CH_HOST, CH_USER, CH_PASSWORD
bash start.sh
```

Health check → http://localhost:8001/api/health
ClickHouse check → http://localhost:8001/api/health/clickhouse
Swagger docs → http://localhost:8001/docs

> The API auto-creates `spectra.db` and seeds the default org, clusters and RSU fleet on first run.

---

## 3. Spectra RSU Platform (React) — port 5173

```bash
cd "Advance Cell Report/spectra-tactical-view"
npm install          # first time only
npm run dev
```

Open → http://localhost:5173

> Requires the API (step 2) running to load RSU/alert data.

---

## .env reference (spectra-api/.env)

```
CH_HOST=your-instance.us-east-1.aws.clickhouse.cloud
CH_PORT=8443
CH_DB=default
CH_USER=human_prod_amir
CH_PASSWORD=your_password_here
CH_SSL=true
```

---

## Switching between apps

| From | To | Click |
|------|----|-------|
| Analysis Suite (any page) | RSU Platform | **IntraAI** in the nav bar |
| RSU Platform (sidebar) | Analysis Suite | **Analysis Suite** link above the user footer |
