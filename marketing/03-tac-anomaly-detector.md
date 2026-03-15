# TAC Anomaly Detector
## Find the IMSI-Catchers Others Miss

---

**Tagline:** Automated detection of rogue base stations and Stingray devices — before they compromise your network or your people.

---

### The Problem
IMSI-catchers (Stingrays) and rogue base stations are among the most dangerous and hardest-to-detect threats in cellular security. They operate silently, impersonate legitimate towers, and leave only subtle traces in network data. Traditional monitoring tools aren't designed to catch them — they require a specialist who knows exactly what behavioral signatures to look for.

### What It Does
- **TAC jump analysis** — Identifies cells that have displayed an abnormal number of different Tracking Area Codes over time, a primary behavioral signature of IMSI-catchers
- **Automated threat classification** — Each suspicious cell receives an intelligence assessment: Tactical Stingray, Rogue/Pirate Equipment, or Operator Spoofing Attempt — based on its unique signature profile
- **Color-coded severity** — Findings are ranked Red (critical, 8+ anomalies), Orange (high, 5–7), and Yellow (elevated, 2–4) for rapid triage
- **Geospatial mapping** — Every suspected device is plotted on a map with precise coordinates, first/last observed timestamps, and full operator context
- **Threshold tuning** — Analysts control the minimum TAC jump count to calibrate sensitivity and suppress noise

### Who It's For
- National security agencies and counter-surveillance teams
- Signal intelligence (SIGINT) professionals
- Telecom regulators monitoring for unauthorized transmitters
- Law enforcement investigating illegal interception equipment
- Military and critical infrastructure protection teams

### Why It's Different
This isn't a generic anomaly tool. Every detection rule is built on real-world IMSI-catcher behavioral patterns — including the specific TAC values (65535, 0) used by pirate equipment, the temporal signatures of tactical Stingrays, and the multi-operator patterns that indicate active spoofing. The result is actionable intelligence with a clear threat assessment, not just a list of anomalous cells.

### Scale & Performance
- Analyzes **crowdsourced measurement data from millions of passive observations**
- Detects threats across **all countries** with MCC-based filtering
- Processes exports from **ClickHouse databases** at enterprise scale
- Operates completely **client-side** — no data leaves the analyst's machine
