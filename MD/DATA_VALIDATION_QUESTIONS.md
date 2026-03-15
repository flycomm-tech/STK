# Data Validation — Team Review Questions
**For team discussion — 2026-03-13**

Each item below has an open question about how the data is actually stored, and what the correct detection behavior should be.

---

## 1. Timing Advance (TA) — NULL vs 0

**Field:** `signal_timingAdvance`

**The ambiguity:**

| Stored value | What it could mean |
|-------------|-------------------|
| `NULL` | Field was not populated — device did not report TA at all |
| `0` | Device measured TA and the result was 0 → device is ≤78m from the transmitter |
| `0` (misuse) | SDK/firmware initialized the field to 0 instead of NULL when measurement was unavailable |

**Why it matters:**
- Our anomaly detector fires `CRITICAL` on TA=0, treating it as "device is adjacent to rogue BTS"
- If TA=0 is being used as a default/unset value by some SDK versions, we will get massive false positives
- A real TA=0 (proximity to BTS) is rare in normal conditions and genuinely suspicious
- A fake TA=0 (uninitialized field) is meaningless

**Questions for team:**
- [ ] Does the Flycomm SDK set `signal_timingAdvance = 0` when TA is unavailable, or does it set `NULL`?
- [ ] Does the modem source (Teltonika) ever report TA=0 on valid fixed-location measurements?
- [ ] What is the approximate count of `signal_timingAdvance = 0` records vs `IS NULL` in production?
- [ ] Should we add a minimum sample count AND a cross-check (e.g., also check RSRP is unusually strong) before flagging TA=0 as critical?

---

## 2. TAC — NULL vs 0 vs 65535

**Field:** `cell_tac`

**The ambiguity:**

| Stored value | What it should mean | What it might actually mean |
|-------------|--------------------|-----------------------------|
| `NULL` | Cell did not report a TAC (no LTE/5G service, or field not populated) | Correct — NULL = not measured |
| `0` (0x0000) | Reserved by 3GPP — illegitimate in any live network | **OR** SDK used 0 as a placeholder when TAC was unavailable |
| `65535` (0xFFFF) | Reserved by 3GPP — known IMSI-catcher signature | **OR** some devices use 0xFFFF as "unknown" sentinel |

**Why it matters:**
- Our TAC anomaly detector looks for `0` or `65535` in the `tac_list` and flags them as CRITICAL (rogue equipment)
- If the SDK writes `0` or `65535` when TAC is simply unavailable (instead of writing `NULL`), we will generate false rogue-equipment alerts on ordinary coverage gaps
- The correct behavior: when TAC cannot be read, the field should be `NULL`, not `0`

**Questions for team:**
- [ ] What does the Flycomm SDK write to `cell_tac` when the device is in GSM/WCDMA mode (where TAC doesn't apply)?  → Should be NULL. Confirm.
- [ ] What does the SDK write when LTE is detected but TAC is not yet received (e.g., during cell selection)?  → Should be NULL. Confirm.
- [ ] Is there any known SDK version that defaults `cell_tac = 0` instead of NULL?
- [ ] Run this query and share count:
  ```sql
  SELECT cell_tac, count() AS n
  FROM measurements
  WHERE cell_tac IN (0, 65535)
  GROUP BY cell_tac
  ORDER BY n DESC
  ```
  → If counts are very high (millions), it's likely a placeholder. If low (thousands), it may be genuine rogue signals.

---

## 3. MCC-MNC 255-255 — What Does It Mean?

**Fields:** `network_mcc`, `network_mnc`, `network_PLMN`

**Background:**
- MCC 255 and MNC 255 are **not allocated** by the ITU. No real operator uses them.
- They appear in measurements when a device could not successfully read the serving cell's PLMN identity.

**Known causes of 255-255:**

| Cause | Context |
|-------|---------|
| SIM not present or locked | Device has no SIM or SIM is blocked |
| Airplane mode transition | PLMN field not cleared before measurement was written |
| Emergency call mode (SOS only) | Device has limited network visibility |
| No network registered | Device is searching but not camped |
| **IMSI-catcher actively suppressing PLMN broadcast** | Attacker prevents device from reading the serving cell identity — this is a known technique |
| SDK bug / race condition | PLMN was read as empty and stored as 255-255 |

**Questions for team:**
- [ ] What is the volume of 255-255 records in the dataset, and from which sources (`source` field)?
  ```sql
  SELECT source, count() AS n
  FROM measurements
  WHERE network_mcc = '255'
  GROUP BY source ORDER BY n DESC
  ```
- [ ] Are 255-255 records correlated with specific device models or SDK versions?
- [ ] Should 255-255 records be discarded entirely from analysis, or flagged separately as "PLMN unreadable" events?
- [ ] In IMSI-catcher context: if a device shows 255-255 AND TA=0 at the same location — that's a multi-indicator alert. Should we correlate these?

---

## 4. Operator Name vs ISO vs MCC-MNC — Can They Conflict Legitimately?

**Example scenario:** `network_operator = "Partner"`, `network_iso = "IL"`, `network_PLMN = "416-77"` (Jordan)

**Fields involved:** `network_operator`, `network_iso`, `network_mcc`, `network_mnc`, `network_PLMN`

### RESOLVED — `network_operator` = VISITED network operator

> **Confirmed:** `network_operator` is the **serving/visited cell's operator name** (VPLMN), read from the network broadcast. It is **not** the home carrier (SIM operator).
> The SDK does **not** currently call `getSimOperator()` — home carrier identity is unavailable in all current measurements.

**What this means for detection:**

| Scenario | What it means | Detection validity |
|----------|--------------|-------------------|
| `operator = "Partner"` + `MCC = 425` + `ISO = "IL"` | Partner cell tower in Israel | Normal — correct |
| `operator = "Partner"` + `MCC = 416` + `lon < 35.3` | A tower broadcasting "Partner" while on Jordanian PLMN, deep inside Israel | **CRITICAL — valid flag** (visited operator spoofing Israeli carrier) |
| `operator = "Orange Jordan"` + `MCC = 416` + `lon > 35.3` | Jordan border spillover, Jordanian tower | Normal — border spillover |
| `operator = "Cellcom"` + `MCC = 432` (Iran) | Tower broadcasting Israeli operator name on Iranian PLMN | **CRITICAL — valid flag** |
| `operator = ""` (empty) + any MCC | Operator name not broadcast by cell — may be intentional (rogue equipment often suppresses) | **FLAG — correlate with other indicators** |

**Implication for Roaming QoS Report:**
- `network_operator` in roaming records = the **foreign network's operator name** (e.g., "T-Mobile DE", "Orange FR")
- There is currently **no field** identifying which Israeli carrier the subscriber belongs to
- Home carrier requires a separate SDK call — see Section 6 below

**Remaining open question:**
- [ ] Does `network_VPLMN` always match `network_PLMN` when roaming, or is it sometimes blank? Confirm in data.

**Additional operator mismatch scenarios (validated logic):**

| Case | Legitimate? | Suspicious? |
|------|------------|-------------|
| Operator = "Cellcom" + MCC = 425 (Israel) + ISO = "IL" | Yes — normal | No |
| Operator = "Cellcom" + MCC = 416 (Jordan) + lon > 35.3 | No — Jordanian tower wouldn't broadcast "Cellcom" | Yes — operator spoofing |
| Operator = "Cellcom" + MCC = 416 + lon < 35.3 | No | CRITICAL — deep-Israel spoofing |
| Operator = "Partner" + MCC = 432 (Iran) | No | CRITICAL |
| Operator = "Orange Jordan" + MCC = 416 + lon > 35.3 | Yes — border spillover | No |
| Operator = "" (empty) + any foreign MCC | Rogue equipment often suppresses name | FLAG — check TA and RSRP |

---

## 5. Summary — Open Questions

| # | Field | Question | Status | Impact if Wrong |
|---|-------|----------|--------|----------------|
| 1 | `signal_timingAdvance` | Is `0` written instead of `NULL` when TA unavailable? | **Open** | B2 fires on normal data |
| 2 | `cell_tac` | Is `0` or `65535` written instead of `NULL` when TAC unavailable? | **Open** | A3 + D3 fire on normal data |
| 3 | `network_mcc = '255'` | What causes 255-255 in this dataset? | **Open** | C3 mis-classifies or misses attacks |
| 4 | `network_operator` | Visited or home operator? | **RESOLVED — visited** | C2/C3 logic is valid |
| 5 | `network_isRoaming` | Set by visited network or derived by SDK? | **Open** | B4 (Forced Roaming) reliability |

---

## 6. SDK Upgrade Required — Home Carrier Identification

**Affects:** Roaming QoS Report, and any future home-vs-visited carrier analysis

### Current state

The `network_operator` field contains the **visited** (serving) network's operator name — the tower the device is connected to. There is **no field** in `measurements` that identifies the subscriber's home carrier (SIM operator / HPLMN).

Current SQL workaround uses `source` as a proxy for "which app/SDK reported this":
```sql
source AS home_source   -- e.g. 'flycomm', 'modem', 'nperf'
-- This is NOT the home carrier. It's just the data collection SDK.
```

This means the Roaming QoS Report cannot currently answer: *"How is a Cellcom subscriber experiencing T-Mobile DE?"*

### Required SDK change

Add a call to read the SIM operator at measurement time and populate a new field — `sim_operator` or `home_plmn`.

**Option A — simplest, single SIM:**
```java
// Android TelephonyManager
TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
String simOperator = tm.getSimOperator();
// Returns MCCMNC string e.g. "42501" (Cellcom), "42503" (Partner), "42577" (Golan)
// Empty string if no SIM or SIM not ready
```

**Option B — dual SIM aware (recommended):**
```java
// Android SubscriptionManager
SubscriptionManager sm = (SubscriptionManager) getSystemService(TELEPHONY_SUBSCRIPTION_SERVICE);
List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
for (SubscriptionInfo info : subs) {
    String homePlmn = info.getMccString() + info.getMncString();
    // e.g. "42501", "42503"
}
```

### New field to add to measurements

| Field name | Type | Example value | Description |
|-----------|------|---------------|-------------|
| `sim_operator` | String | `"42501"` | SIM PLMN (MCC+MNC) of the subscriber's home carrier |

Or equivalently split into:
| `sim_mcc` | String | `"425"` | Home MCC |
| `sim_mnc` | String | `"01"` | Home MNC |

### What this enables

Once `sim_operator` is populated, queries can produce:

```sql
-- "Cellcom subscriber roaming in Germany on Deutsche Telekom — signal quality"
SELECT
    sim_operator       AS home_carrier,   -- e.g. 42501 = Cellcom
    network_operator   AS visited_carrier, -- e.g. T-Mobile DE
    network_iso        AS country,
    round(avg(signal_rsrp), 1) AS avg_rsrp,
    round(avg(internet_downloadMbps), 2) AS avg_dl_mbps
FROM measurements
WHERE network_isRoaming = true
  AND sim_operator IS NOT NULL
GROUP BY home_carrier, visited_carrier, country
```

**Intelligence unlocked:**
- Which Israeli carrier's subscribers experience the worst roaming quality by country
- Roaming SLA compliance per carrier agreement
- Detect subscribers of specific carriers being selectively degraded on foreign networks
- IMSI-catcher hunting: if `sim_operator` suddenly changes for the same device → SIM spoofing attempt

### Priority

**High.** The Roaming QoS Report is currently a visited-network report, not a subscriber-experience report. Home carrier is the core dimension that makes roaming intelligence actionable.

---

*Last updated: 2026-03-13*
