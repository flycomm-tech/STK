# Anomaly Detection Algorithms
## Complete Technical Reference — All Detectors, All Thresholds, All Logic
**For team review — 2026-03-12**

---

## Overview

The platform has **4 detection engines** across 3 tools:

| Engine | Tool | Detection Count | Data Source |
|--------|------|----------------|-------------|
| [A] TAC Anomaly Detector | `anomaly-detector.html` | 4 classification types | ClickHouse JSON export |
| [B] Anomaly Workbench | `anomaly-workbench.html` | 8 active methods (2 removed — broken schema) | Live ClickHouse connection |
| [C] Forensic Report | `app.js` → `generateReport()` | 3 detection types | CSV upload (filtered) |
| [D] Spectra API | `spectra-api/routers/alerts.py` | 4 alert types | Live ClickHouse (modem source only) |

**All logic is rule-based. No machine learning is used anywhere.**

---

## Removed Methods — Broken Schema References

Two methods were removed from the active detector list because they reference fields that **do not exist** in the `measurements` table and silently return 0 rows:

| Removed Method | Missing Field | What Would Be Needed to Restore |
|---------------|--------------|----------------------------------|
| ~~B4 — Unregistered Cells~~ | `isRegistered` | Enrich `measurements` with a cell registry join, or maintain a separate `registered_cells` table and query against it |
| ~~B8 — RF Blackout~~ | `delta_no_signal` | Pre-compute inter-row time gaps per device (window function) and store as a derived/materialized field; not derivable from a raw scan |

> **Note:** `deviceInfo_personalId` is also missing from schema but is used in B1 and B7 — the `coalesce()` fallback to `deviceInfo_imei` handles this gracefully with no functional impact.

---

---

# ENGINE A — TAC Anomaly Detector

**File:** `anomaly-detector.html`
**Input:** JSON export from ClickHouse with pre-aggregated TAC data per cell

---

## A1 — TAC Jump Severity Classification

Assigns visual severity based on how many distinct TAC values were observed on the same physical cell.

```
distinct_tac_count ≥ 8  →  RED    (High risk)
distinct_tac_count 5–7  →  ORANGE (Medium risk)
distinct_tac_count 2–4  →  YELLOW (Low/instability)
```

**Input field:** `distinct_tac_count`
**Minimum threshold:** configurable (default: 2 minimum jumps to appear in results)
**Country filter:** MCC-based (user selects country)

---

## A2 — Tactical Stingray Detection

Identifies active IMSI-catcher based on the combination of high TAC rotation with low observation volume.

```
IF distinct_tac_count ≥ 5 AND total_samples < 500:
    → "Suspected active mobile IMSI-catcher"
    → Severity: CRITICAL
```

**Rationale:** A legitimate tower accumulates many samples over time. A device that has rotated TACs multiple times but has few observations is likely mobile and recently deployed — consistent with a vehicle-mounted Stingray.

---

## A3 — Rogue / Pirate Equipment Detection

Detects reserved TAC values that indicate non-commercial or deliberately misconfigured equipment.

```
IF tac_list contains 65535 (0xFFFF) OR 0 (0x0000):
    → "Suspected unidentified/rogue BTS or pirate femtocell"
    → Severity: CRITICAL
```

**Rationale:** TAC 0x0000 and 0xFFFF are reserved by 3GPP (TS 24.008). No legitimate commercial operator broadcasts these values. Presence indicates either pirate equipment or deliberate misconfiguration to evade network tracking.

---

## A4 — Operator Spoofing Detection

Detects cells associated with multiple operator names simultaneously — a signature of impersonation.

```
IF operator_names contains a comma AND operator_names ≠ "Unknown":
    → "Multiple operator names observed on same cell — spoofing anomaly"
    → Severity: HIGH
```

**Rationale:** A physical cell belongs to exactly one operator. Observing multiple operator names on the same `cell_eci` indicates either active spoofing (attacker mimicking different operators) or a PLMN misconfiguration.

---

## A — Fallback Classification

```
IF none of the above match:
    → "Multiple TAC values recorded over time — network instability or infrastructure change"
    → Severity: MEDIUM
```

---

---

# ENGINE B — Anomaly Workbench (10 Methods)

**File:** `anomaly-workbench.html`
**Input:** Live ClickHouse queries (configurable host/port/credentials)

---

## B — Shared Confidence Scoring Formula

All 10 methods share a single confidence calculation:

```
sample_score = min(counted / 25, 1.0)       → saturates at 25 samples (= 100% credit)
severity_score:
    CRITICAL → 1.00
    HIGH     → 0.70
    MEDIUM   → 0.45
    LOW      → 0.25

confidence = round((sample_score × 0.4 + severity_score × 0.6) × 100)
```

**Confidence bands:**
- ≥ 70 → High confidence
- 40–69 → Medium confidence
- < 40 → Possible false positive

**Marker rendering on map (visual only):**
```
radius      = 4 + (confidence / 100) × 5     → range: 4–9 px
fillOpacity = 0.30 + (confidence / 100) × 0.55  → range: 0.30–0.85
weight      = 1.5 if confidence ≥ 70 else 1.0
```

---

## B1 — Technology Downgrade (LTE/NR → GSM)

Detects rapid forced downgrade from 4G/5G to 2G, a primary IMSI-catcher attack vector.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `tech` | Filter: LTE, NR, GSM only |
| `timestamp` | Compute time delta between LTE and GSM observations |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key — identifies which cell |
| `network_PLMN`, `network_operator`, `network_iso` | Group key — operator context |
| `deviceInfo_imei`, `deviceInfo_deviceId` | Group key — per-device tracking |
| `location_geo_coordinates.1/.2` | Output — map position (lon/lat) |

**SQL logic:**
```sql
minIf(toUnixTimestamp(timestamp), tech IN ('LTE','NR')) AS first_lte_ts
minIf(toUnixTimestamp(timestamp), tech = 'GSM')         AS first_gsm_ts
minutes_lte_to_gsm = round((first_gsm_ts - first_lte_ts) / 60.0, 1)

HAVING first_lte_ts > 0 AND first_gsm_ts > 0
   AND first_gsm_ts > first_lte_ts
   AND minutes_lte_to_gsm ≤ [max_minutes param]
```

**Severity:**
```
minutes_lte_to_gsm ≤ 2   →  CRITICAL  (IMSI-Catcher / active jamming — sub-2-minute forced downgrade)
minutes_lte_to_gsm 2–15  →  HIGH      (Possible soft jamming)
minutes_lte_to_gsm > 15  →  LOW       (Geographic coverage blind spot)
```

**Default threshold:** max_minutes = user configurable

---

## B2 — Timing Advance = 0

Detects cells where the device appeared to be at zero physical distance from the base station.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `signal_timingAdvance` | Filter: NOT NULL; counted where = 0 |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
countIf(signal_timingAdvance = 0) AS ta_zero_count
HAVING ta_zero_count ≥ [min_count]   -- default: 5
```

**Severity:** ALL results → CRITICAL (no tiering)

**Rationale:** TA=0 means the round-trip signal time implies the device is ≤78 meters from the transmitter. For a fixed tower, this is physically impossible for most measurement scenarios. Consistent with an IMSI-catcher that is physically adjacent to the victim device, or a rogue BTS broadcasting TA=0 to force association.

---

## B3 — Extreme RSRP (Abnormal Signal Strength)

Detects cells broadcasting stronger-than-physically-possible signals — a signature of rogue BTS transmitting at elevated power to attract devices.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `signal_rsrp` | Filter: NOT NULL; averaged per cell |
| `tech` | Filter: LTE or NR only (RSRP is 4G/5G field) |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
round(avg(signal_rsrp), 1) AS avg_rsrp
HAVING avg_rsrp ≥ [rsrp_threshold]   -- default: -50 dBm
```

**Severity:**
```
avg_rsrp ≥ -50 dBm  →  CRITICAL  (Rogue BTS with abnormal signal power)
avg_rsrp < -50 dBm  →  HIGH      (Suspicious signal strength)
```

**Rationale:** Legitimate LTE towers produce RSRP in the range of -44 to -140 dBm at receiver. Readings consistently above -50 dBm are unusually strong and suggest a transmitter located very close to the measurement device, or a device transmitting at non-standard power levels.

---

## B4 — Forced Roaming Inside Home Country

Detects devices being forced into roaming mode while physically inside their home country.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `network_isRoaming` | Filter: = 1 (roaming flag set) |
| `network_mcc` | Filter: = home MCC (default '425' Israel) |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
WHERE network_isRoaming = 1
  AND network_mcc = '[home_mcc]'   -- default: '425' (Israel)
HAVING counted ≥ 3
```

**Severity:** ALL results → HIGH

**Rationale:** A device cannot legitimately be roaming when it is inside its home network's country. If `isRoaming = true` while `mcc = home_mcc`, the device has been forced onto a foreign network partner's infrastructure while inside the home country. This is a known IMSI-catcher technique to route calls through interception-capable foreign infrastructure.

---

## B5 — PCI Mismatch (Physical Cell Identity Cycling)

Detects cells where multiple Physical Cell Identities were observed — a signature of tower impersonation or PCI cycling attacks.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `cell_pci` | Filter: NOT NULL; counted distinct values per cell |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
uniqExact(cell_pci) AS distinct_pci_count
groupUniqArray(cell_pci) AS pci_list
HAVING distinct_pci_count ≥ [min_pci]   -- default: 3
```

**Severity:**
```
distinct_pci_count ≥ 5  →  CRITICAL  (Active tower impersonation / PCI cycling)
distinct_pci_count < 5  →  HIGH      (PCI inconsistency)
```

**Rationale:** A physical cell has exactly one PCI. Multiple PCIs on the same location indicate either a rogue device cycling through PCIs to impersonate different towers, or multiple devices competing for the same geographic area.

---

## B6 — Multi-Device IMEI/IMSI Concentration

> **DESIGN FLAW — Requires team review before trusting results.**

**Raw fields read from `measurements`:**
| Field | Purpose | Schema Status |
|-------|---------|--------------|
| `deviceInfo_imei` | Primary device identifier | EXISTS |
| `deviceInfo_personalId` | Fallback identifier | **DOES NOT EXIST** |
| `deviceInfo_deviceId` | Second fallback identifier | EXISTS |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**What it actually measures:**
```sql
uniqExact(coalesce(
    nullIf(deviceInfo_imei,''),
    nullIf(deviceInfo_personalId,''),   -- field does not exist, always NULL
    deviceInfo_deviceId
)) AS device_count
HAVING device_count ≥ [min_devices]   -- default: 10
```

**What `device_count` is:** Lifetime total of unique device identifiers ever observed at this cell across the **entire query time window** — not concurrent, not normalized per hour, not compared to any baseline.

**Why this is not a valid anomaly signal:**
- A cell tower in Tel Aviv center sees hundreds of unique IMEIs per hour legitimately. Over a 30-day window, a single cell easily accumulates tens of thousands of unique devices.
- A threshold of 10 or even 20 would fire on virtually every cell in any populated area.
- The metric has no temporal denominator — `device_count = 50` means nothing without knowing whether that's over 10 minutes or 6 months.
- There is no baseline comparison — the query has no knowledge of what is "normal" for that specific cell.

**What a valid version of this detection would need:**
- Time-windowed counting: unique devices per hour or per day
- Baseline comparison: how does today's rate compare to the cell's historical average?
- Rate-of-new-devices: first-time-seen IMEIs in a short window (not cumulative)
- Geographic density normalization: urban vs. rural cells have entirely different expected counts

**Severity (current logic — unreliable):**
```
device_count > 20  →  CRITICAL
device_count > 10  →  HIGH
device_count ≥ 10  →  MEDIUM
```

---

## B7 — TX Power Spike (Device Fighting Jammer)

Detects devices transmitting at near-maximum uplink power, consistent with a device trying to overcome local RF interference.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `signal_txPower` | Filter: NOT NULL; averaged per cell |
| `signal_rsrp` | Additional context output |
| `tech` | Group key |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
round(avg(signal_txPower), 1) AS avg_tx_power
HAVING avg_tx_power > [tx_threshold]   -- default: 20 dBm
   AND count() > 5
```

**Severity:**
```
avg_tx_power > 25 dBm  →  CRITICAL  (Device fighting jammer — near-max TX)
avg_tx_power ≤ 25 dBm  →  HIGH      (Elevated uplink power)
```

**Rationale:** Devices increase TX power when they cannot reach the serving tower. Sustained high TX power at a location, combined with other anomalies, indicates the device is fighting a local jammer or has been forced to associate with a distant legitimate tower while a rogue BTS is nearby.

---

## B8 — GPS Satellite Drop

Detects locations where GPS satellite count dropped significantly — consistent with GPS jamming, which frequently accompanies IMSI-catcher deployment.

**Raw fields read from `measurements`:**
| Field | Purpose |
|-------|---------|
| `satellites_gps_satellitesNo` | Filter: NOT NULL, ≥ 0; avg and min computed per cell |
| `cell_eci`, `cell_enb`, `cell_ecgi`, `cell_nci`, `cell_lac`, `cell_cid` | Group key |
| `network_PLMN`, `network_operator`, `network_iso` | Group key |
| `timestamp` | Output: first_seen / last_seen |
| `location_geo_coordinates.1/.2` | Output: map position |

**SQL logic:**
```sql
round(avg(satellites_gps_satellitesNo) - min(satellites_gps_satellitesNo), 0) AS satellite_drop
HAVING satellite_drop ≥ [min_drop]   -- default: 5
   AND avg(satellites_gps_satellitesNo) > 0
```

**Severity:**
```
satellite_drop > 8  →  CRITICAL  (GPS jamming zone — major constellation loss)
satellite_drop ≥ 4  →  HIGH      (GPS interference)
satellite_drop < 4  →  MEDIUM    (Satellite count variation)
```

**Rationale:** IMSI-catcher operators frequently deploy GPS jammers simultaneously to prevent victims from recording precise location data during the interception. A sudden drop in visible GPS satellites (from 11+ avg to near-zero minimum) at a location is a strong corroborating indicator.

---

---

# ENGINE C — Forensic Report (`app.js`)

**File:** `app.js` (functions: `analyzeAnomalies()`, `generateReport()`)
**Input:** `APP.filtered` — current filtered CSV data in memory

---

## C1 — PLMN / Country Mismatch

Detects measurements where the PLMN (MCC) does not match the ISO country field.

```javascript
// For each data point:
mcc = plmn.slice(0, 3)
expectedCountry = MCC_TABLE[mcc].country    // ISO from ITU MCC table
actualCountry = iso field from CSV

IF actualCountry ≠ expectedCountry:
    → anomaly type: 'plmn_country_mismatch'
    → severity: HIGH
```

---

## C2 — PLMN / Operator Mismatch

Detects measurements where the operator name hint (known operator → country mapping) contradicts the PLMN's country.

```javascript
// For each data point:
opHint = OPERATOR_COUNTRY_HINTS[operator.toLowerCase()]   // e.g. 'cellcom' → 'il'
expectedCountry = MCC_TABLE[mcc].country

IF opHint AND opHint ≠ expectedCountry:
    → anomaly type: 'plmn_operator_mismatch'
    → severity: HIGH
```

**Known operator → country mappings include:** Cellcom, Orange Israel, Partner Cell, Rami Levy, Golan Telecom (all → 'il')

---

## C3 — Forensic Report Classification (PLMN threat analysis)

Full PLMN-level threat assessment for the report. Runs over all unique PLMNs in the filtered dataset.

**Jordan border exception (applied first):**
```
IF mcc = '416' AND plmn ≠ '416-77' AND avg_longitude > 35.3:
    → SKIP (natural border spillover from Jordan — not suspicious)
```

**Severity rules (in priority order):**

```
IF mcc = '000' OR mcc = '255':
    → severity: MEDIUM, assessment: 'Test / Invalid PLMN'

ELSE IF plmn = '416-77':
    → severity: CRITICAL, assessment: 'Phantom PLMN — unregistered Jordanian operator'

ELSE IF mcc IN ['432' (Iran), '417' (Syria), '418' (Iraq)]:
    → severity: CRITICAL, assessment: 'Foreign signal from hostile-nation network'

ELSE IF mcc = '602' (Egypt) AND operator IS Israeli operator:
    → severity: CRITICAL, assessment: 'Egyptian network signal with Israeli operator — deep anomaly'

ELSE IF operator IS Israeli operator AND MCC_TABLE[mcc].country ≠ 'il':
    → severity: CRITICAL, assessment: 'Israeli operator name on foreign MCC — PLMN/operator mismatch'

ELSE IF mcc = '416' AND avg_longitude < 35.3:
    → severity: HIGH, assessment: 'Jordanian signal deep inside Israel (west of border threshold)'

ELSE IF MCC_TABLE[mcc].country ≠ 'il':
    → severity: HIGH, assessment: 'Foreign MCC detected in dataset'
```

**Constants:**
```
JORDAN_BORDER_LON = 35.3   (longitude degrees)
criticalMccs = ['432', '417', '418']   (Iran, Syria, Iraq)
```

**Report table logic:** Critical entries shown first, then High/Medium, capped at 25 total rows.

---

## C — Spatial and Temporal Correlation (both C1 and C2)

After per-point detection, anomalies are correlated spatially and temporally:

**Spatial clustering:**
```
RADIUS = 0.005 degrees  (~500 meters)

Cluster anomalies where |Δlat| < 0.005 AND |Δlon| < 0.005
→ merged into cluster with centroid coordinates
→ exposed as: uniquePlmns, uniqueOperators, count
```

**Temporal burst detection:**
```
WINDOW = 3,600,000 ms  (1 hour)

IF ≥ 3 anomalies fall within any 1-hour sliding window:
    → classified as temporal burst
    → exposed as: startTime, endTime, burst count
```

---

---

# ENGINE D — Spectra API Alerts

**File:** `spectra-api/routers/alerts.py`
**Input:** Live ClickHouse (`source = 'modem'` only — Teltonika RSU hardware)

---

## D1 — RSU Offline Detection

Detects RSU units that have not reported measurements within the threshold window.

```python
# For each RSU (by IMEI):
age_hours = (now_utc - last_seen_timestamp).total_seconds() / 3600

IF age_hours > 1:
    → severity: HIGH
    → confidence: 95%
    → description: "RSU [location] has not reported in [N] hours"
```

**Threshold:** 1 hour of silence = offline alert

---

## D2 — Signal Degradation

Detects RSU units experiencing below-threshold RSRP on an hourly basis.

```python
# Query: per RSU per hour, avg RSRP where rsrp < -100 dBm (minimum 10 samples)
# Fleet average baseline: -74.9 dBm

severity from avg_rsrp:
    avg_rsrp ≤ -110 dBm  →  CRITICAL
    avg_rsrp ≤ -100 dBm  →  HIGH
    avg_rsrp ≤ -90 dBm   →  MEDIUM
    avg_rsrp > -90 dBm   →  LOW

confidence = 85%  (fixed)
deviation_db = round(avg_rsrp - (-74.9), 1)  → deviation from fleet average
```

**Minimum sample requirement:** 10 measurements per hour to trigger

---

## D3 — TAC Anomaly (IMSI-Catcher)

Detects cells observed by RSU hardware with multiple distinct TAC values.

```python
# Query: per RSU per cell_eci, cells with tac_count ≥ 2

severity:
    tac_count ≥ 4  →  CRITICAL
    tac_count ≥ 2  →  HIGH

confidence = 70 + min(tac_count × 5, 25)
```

**Confidence examples:**
```
tac_count = 2  →  70 + min(10, 25) = 80%
tac_count = 3  →  70 + min(15, 25) = 85%
tac_count = 4  →  70 + min(20, 25) = 90%
tac_count = 5  →  70 + min(25, 25) = 95%
tac_count ≥ 6  →  70 + min(30, 25) = 95%  (capped at 95%)
```

---

## D4 — Hardware Overtemperature

Detects RSU devices exceeding safe operating temperature thresholds.

```python
# Query: per RSU, max and avg temp where temp > 55°C

severity:
    max_temp ≥ 70°C  →  CRITICAL
    max_temp > 55°C  →  MEDIUM

confidence = 99%  (direct sensor reading — effectively certain)
```

---

## D — Alert Sorting and Delivery

All four alert types are computed and merged, then sorted:

```
Sort order: CRITICAL (0) → HIGH (1) → MEDIUM (2) → LOW (3)
Within same severity: sorted by timestamp descending
Response limit: 1–500 alerts (default: 100)
```

**Filterable by:** `status`, `severity`, `cluster_id`, `rsu_id`

---

---

# Master Summary Table

| ID | Name | Tool | Key Raw Fields | Trigger Condition | CRITICAL | HIGH | MEDIUM | Status |
|----|------|------|---------------|-------------------|----------|------|--------|--------|
| A1 | TAC Jump Severity | TAC Detector | `distinct_tac_count`, `total_samples` | distinct_tac ≥ 2 | ≥ 8 jumps | 5–7 | 2–4 | Functional |
| A2 | Tactical Stingray | TAC Detector | `distinct_tac_count`, `total_samples` | tac ≥ 5 AND samples < 500 | Always | — | — | Functional |
| A3 | Rogue Equipment | TAC Detector | `tac_list` | TAC = 0 or 65535 in list | Always | — | — | Functional |
| A4 | Operator Spoofing | TAC Detector | `operator_names` | Multiple operator names same cell | — | Always | — | Functional |
| B1 | Tech Downgrade | Workbench | `tech`, `timestamp`, `cell_eci`, `deviceInfo_imei` | LTE→GSM in ≤ max_minutes | ≤ 2 min | 2–15 min | — | Functional |
| B2 | Timing Advance = 0 | Workbench | `signal_timingAdvance`, `cell_eci` | ta_zero_count ≥ 5 | Always | — | — | Functional |
| B3 | Extreme RSRP | Workbench | `signal_rsrp`, `tech`, `cell_eci` | avg_rsrp ≥ -50 dBm | ≥ -50 dBm | < -50 dBm | — | Functional |
| B4 | Forced Roaming | Workbench | `network_isRoaming`, `network_mcc` | isRoaming=1 AND home MCC | — | Always | — | Functional |
| B5 | PCI Mismatch | Workbench | `cell_pci`, `cell_eci` | distinct_pci ≥ 3 | ≥ 5 PCIs | < 5 PCIs | — | Functional |
| B6 | Multi-Device IMEI | Workbench | `deviceInfo_imei`, `deviceInfo_deviceId`, `cell_eci` | lifetime unique devices ≥ 10 | > 20 | > 10 | ≥ 10 | Logic flaw — see B6 notes |
| B7 | TX Power Spike | Workbench | `signal_txPower`, `cell_eci`, `tech` | avg_tx > 20 dBm AND count > 5 | > 25 dBm | ≤ 25 dBm | — | Functional |
| B8 | GPS Satellite Drop | Workbench | `satellites_gps_satellitesNo`, `cell_eci` | satellite_drop ≥ 5 | > 8 | ≥ 4 | < 4 | Functional |
| C1 | PLMN/Country Mismatch | Forensic Report | `network_PLMN`, `network_iso` | iso ≠ MCC country | — | Always | — | Functional |
| C2 | PLMN/Operator Mismatch | Forensic Report | `network_PLMN`, `network_operator` | opHint ≠ MCC country | — | Always | — | Functional |
| C3 | Hostile-nation MCC | Forensic Report | `network_PLMN` | Iran/Syria/Iraq MCC | Always | — | — | Functional |
| C3 | Phantom PLMN 416-77 | Forensic Report | `network_PLMN` | plmn = '416-77' | Always | — | — | Functional |
| C3 | Israeli op + foreign MCC | Forensic Report | `network_PLMN`, `network_operator` | IL operator ≠ IL MCC | Always | — | — | Functional |
| C3 | Jordan deep inside IL | Forensic Report | `network_PLMN`, `location_geo_coordinates` | 416-xx AND lon < 35.3 | — | Always | — | Functional |
| D1 | RSU Offline | Spectra API | `timestamp`, `deviceInfo_imei` (source=modem) | age_hours > 1 | — | Always | — | Functional |
| D2 | Signal Degradation | Spectra API | `signal_rsrp`, `timestamp`, `deviceInfo_imei` | avg_rsrp < -100 (≥10 samples/hr) | ≤ -110 dBm | ≤ -100 | ≤ -90 | Functional |
| D3 | TAC Anomaly (RSU) | Spectra API | `cell_tac`, `cell_eci`, `deviceInfo_imei` | tac_count ≥ 2 | ≥ 4 TACs | ≥ 2 TACs | — | Functional |
| D4 | Overtemperature | Spectra API | `deviceInfo_temperature`, `deviceInfo_imei` | max_temp > 55°C | ≥ 70°C | — | > 55°C | Functional |

---

*All thresholds reference: 3GPP TS 24.008, TS 36.331, TS 38.331 | Last updated: 2026-03-12*
