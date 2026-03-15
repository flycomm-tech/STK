# Raw Data Validation Reference
## Suspicious & Invalid Values in Cellular Measurements
**For team review — ClickHouse field-level validation rules**

---

## 1. TAC — Tracking Area Code (LTE / 5G NR)

| Value | Hex | Meaning | Action |
|-------|-----|---------|--------|
| `0` | `0x0000` | Reserved by 3GPP. A cell broadcasting TAC=0 has no valid TA assignment — often seen on cheap/pirate femtocells or lab equipment misconfigured in field | **DISCARD / FLAG as rogue candidate** |
| `65534` | `0xFFFE` | Reserved by 3GPP — should never appear in live measurements | **DISCARD** |
| `65535` | `0xFFFF` | Reserved by 3GPP. Most commonly emitted by IMSI-catchers (Stingray, Hailstorm) as a catch-all TAC that attracts all devices. Key IMSI-catcher signature | **FLAG as HIGH suspicion — IMSI-catcher candidate** |

> TAC is a 16-bit value. Valid range: `1 – 65533`.

---

## 2. LAC — Location Area Code (GSM / WCDMA)

| Value | Hex | Meaning | Action |
|-------|-----|---------|--------|
| `0` | `0x0000` | Reserved. No valid cell should broadcast LAC=0 | **DISCARD** |
| `65535` | `0xFFFF` | Reserved. Used similarly to TAC=0xFFFF in 2G/3G rogue equipment | **FLAG as rogue candidate** |

> LAC is a 16-bit value. Valid range: `1 – 65534`.

---

## 3. MCC / MNC — Mobile Country & Network Code

| Value | Meaning | Action |
|-------|---------|--------|
| `001 / 01` | ITU official **test network** — used in labs and simulators, never in live deployments | **DISCARD from production analysis** |
| `255 / 255` | Unknown/unresolved PLMN. Device could not read the network identity. Common on locked SIMs, airplane mode transitions, or during active IMSI-catcher attacks (attacker suppresses PLMN broadcast) | **FLAG — investigate context** |
| `000 / 000` | Null/uninitialized. Device reported no network at all | **DISCARD** |
| `999 / 99` | Test/private MCC range — not assigned by ITU | **DISCARD** |
| MCC not in ITU allocation table | Spoofed or corrupted PLMN. Can indicate a device cloning a non-existent operator | **FLAG as CRITICAL** |
| Valid MCC but MNC `000` | Operator code not resolved — partial read. Common on very fast handovers | **REVIEW — usually discard** |

> MCC is 3 digits (001–999), MNC is 2–3 digits. Only ~800 MCC values are actually allocated by the ITU.

---

## 4. Cell ID Fields

### `cell_eci` — E-UTRAN Cell Identity (LTE, 28-bit)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Unset or invalid. Real cells always have ECI > 0 | **DISCARD** |
| > `268435455` (0xFFFFFFF) | Exceeds 28-bit maximum — data corruption or spoofed value | **DISCARD** |

### `cell_cid` — Cell ID (GSM/WCDMA, 16-bit)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Unset or invalid | **DISCARD** |
| `65535` (`0xFFFF`) | Reserved — rogue equipment signature in 2G/3G | **FLAG** |

### `cell_nci` — NR Cell Identity (5G, 36-bit)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Unset/invalid | **DISCARD** |
| > `68719476735` (0xFFFFFFFFF) | Exceeds 36-bit maximum | **DISCARD** |

### `cell_lac` — Location Area Code (GSM/WCDMA)
See LAC section above.

### `cell_pci` — Physical Cell Identity

| Tech | Valid Range | Out-of-range meaning |
|------|-------------|----------------------|
| LTE | 0 – 503 | Invalid — device reporting incorrect RF measurement |
| 5G NR | 0 – 1007 | Invalid |

---

## 5. Signal Strength Fields

### `signal_rsrp` — Reference Signal Received Power (LTE/NR, dBm)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | **Schema default** — field was not measured. Per schema: `signal_rsrp` defaults to 0, NOT NULL | **DISCARD — filter `signal_rsrp != 0`** |
| `> -44` dBm | Physically impossible — stronger than the transmitter itself. Indicates sensor error or IMSI-catcher proximity spoofing | **FLAG as suspicious** |
| `< -144` dBm | Below thermal noise floor — measurement error or device malfunction | **DISCARD** |

> Realistic LTE RSRP range: **-44 to -140 dBm**. Good: > -80. Edge: -100 to -120. No service: < -120.

### `signal_rsrq` — Reference Signal Received Quality (dBm)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Not measured | **DISCARD** |
| `< -19.5` | Below 3GPP minimum spec | **DISCARD** |
| `> -3` | Above 3GPP maximum spec | **DISCARD** |

> Valid range: **-19.5 to -3 dBm**.

### `signal_rssi` — Received Signal Strength Indicator

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Not measured | **DISCARD** |
| `< -110` dBm | Below noise floor | **DISCARD** |

### `signal_snr` / `signal_ssSinr` — Signal-to-Noise Ratio

| Value | Meaning | Action |
|-------|---------|--------|
| `< -20` dB | Unusually poor — device in very bad RF environment or measurement error | **REVIEW** |
| `> 40` dB | Unusually clean — possible lab condition or spoofed signal | **FLAG** |

### `signal_timingAdvance` — Timing Advance (LTE)

| Value | Meaning | Action |
|-------|---------|--------|
| `-1` or very large negative | Not measured by device | **DISCARD** |
| `0` | Device is **< 78 meters** from the tower, OR TA was not reported. Common in IMSI-catcher scenarios (attacker is very close) | **REVIEW in context** |
| `> 1282` | Exceeds LTE maximum (1282 = ~100km) — invalid | **DISCARD** |
| `> 63` in GSM context | Exceeds GSM maximum (63 = ~9.7km) — invalid for that tech | **DISCARD** |

> LTE TA formula: distance ≈ TA × 78.12m. A TA=0 cell cluster could indicate an IMSI-catcher or a legitimate nearby deployment.

---

## 6. GPS / Location Fields

### Coordinates — `location_geo_coordinates`

| Value | Meaning | Action |
|-------|---------|--------|
| `(0.0, 0.0)` | "Null Island" — GPS not fixed, coordinates unset | **DISCARD** |
| `lat = 0.0` exactly | GPS not initialized | **DISCARD** |
| `lat > 90` or `lat < -90` | Outside Earth range — corrupted | **DISCARD** |
| `lon > 180` or `lon < -180` | Outside Earth range — corrupted | **DISCARD** |
| `lat` or `lon` exactly matching a round number (e.g. 32.000000) | Likely forced/placeholder coordinate — low confidence | **REVIEW** |

### `location_accuracy` (meters)

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Not set | **DISCARD** |
| `< 0` | Invalid | **DISCARD** |
| `> 500m` | Cell-tower triangulation, not GPS. Low spatial confidence | **FLAG — exclude from precision analysis** |
| `> 5000m` | Unusable for any geographic analysis | **DISCARD** |

---

## 7. Timestamps

| Condition | Meaning | Action |
|-----------|---------|--------|
| `timestamp = 0` or epoch (`1970-01-01`) | Device clock not set or field uninitialized | **DISCARD** |
| `timestamp > now()` | Device clock in the future — NTP sync failure | **DISCARD** |
| `timestamp < 2018-01-01` | Pre-deployment — unlikely valid for this dataset | **REVIEW** |
| `loc_timestamp` vs `timestamp` delta > 5 minutes | GPS fix is stale — location may not match cell observation | **FLAG — location unreliable** |

---

## 8. Technology / Field Consistency Checks (Cross-field validation)

| Condition | Meaning | Action |
|-----------|---------|--------|
| `tech = 'GSM'` but `signal_rsrp != 0` | RSRP is LTE/NR-only. Field cross-contamination | **DISCARD rsrp value** |
| `tech = 'LTE'` but `cell_tac = NULL` | LTE must have TAC — missing key identifier | **FLAG** |
| `tech = 'NR'` but `cell_nci = NULL` | 5G NR must have NCI | **FLAG** |
| `tech = 'LTE'` but `cell_lac != NULL` | LAC is GSM/WCDMA-only. Likely firmware bug or wrong tech classification | **REVIEW** |
| `tech = 'GSM'` but `band_number` is an LTE band | Tech/band mismatch — device misreported technology | **FLAG** |
| PLMN mcc/mnc doesn't match `network_mcc`/`network_mnc` | Derived field inconsistency — possible data pipeline issue | **REVIEW** |

---

## 9. Device Identity Fields

### `deviceInfo_imei`

| Value | Meaning | Action |
|-------|---------|--------|
| `000000000000000` | Null IMEI — device hiding identity or test unit | **FLAG** |
| `111111111111111` / all same digit | Spoofed/test IMEI | **DISCARD** |
| Not 15 digits | Malformed | **DISCARD** |
| Luhn check fails | Corrupted or fake IMEI | **FLAG** |

### `deviceInfo_imsi`

| Value | Meaning | Action |
|-------|---------|--------|
| All zeros | Unset — SIM not read | **DISCARD** |
| `001...` (MCC 001) | Test SIM | **DISCARD from production** |
| `255255...` | Unknown PLMN subscriber — SIM could not be read | **FLAG** |

---

## 10. Band / Frequency Fields

### `band_number`

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Not reported | **DISCARD** |
| Not in 3GPP band list | Non-standard or experimental band — may indicate non-commercial equipment | **FLAG** |

### `band_downlinkEarfcn` / `band_downlinkUarfcn`

| Value | Meaning | Action |
|-------|---------|--------|
| `0` | Not set | **DISCARD** |
| Outside valid range for the reported band | Band/EARFCN mismatch — corrupted measurement | **DISCARD** |

---

## 11. Roaming-specific

| Condition | Meaning | Action |
|-----------|---------|--------|
| `network_isRoaming = true` but home MCC matches visited MCC | Roaming flag error — domestic measurement marked as roaming | **REVIEW** |
| `network_VPLMN` set but `network_isRoaming = false` | Inconsistency — VPLMN only valid when roaming | **FLAG** |

---

## 12. Source-specific Known Issues

| Source | Known issue | Recommended filter |
|--------|-------------|-------------------|
| `''` (blank) | Pre-2024 legacy data — some fields not populated | Apply stricter null filters |
| `modem` | `cell_ecgi` always NULL — use `cell_cgi` instead for cell identity | Use `cell_cgi` not `cell_ecgi` |
| `modem` | Only LTE + tiny WCDMA — no GSM, no NR | Don't expect NR data from modem source |
| All sources | `signal_rsrp` defaults to `0` (Int32 NOT NULL) — zero ≠ measured | Always filter `signal_rsrp != 0` |

---

## Summary — Priority Validation Rules for ClickHouse

```
-- Minimum quality filter (apply to all queries):
WHERE signal_rsrp != 0                          -- has real signal data
  AND location_geo_coordinates.1 != 0           -- has real GPS lon
  AND location_geo_coordinates.2 != 0           -- has real GPS lat
  AND location_accuracy > 0
  AND location_accuracy < 500                   -- GPS quality, not cell-tower
  AND timestamp > '2018-01-01'
  AND timestamp <= now()
  AND network_mcc NOT IN ('001', '255', '000')  -- no test/unknown PLMNs
```

```
-- Rogue / IMSI-catcher detection candidates:
WHERE cell_tac IN (0, 65535)                    -- TAC 0x0000 or 0xFFFF
   OR cell_lac IN (0, 65535)                    -- LAC 0x0000 or 0xFFFF
   OR (network_mcc = '255' AND network_mnc = '255')  -- unknown PLMN
   OR signal_rsrp > -44                         -- impossibly strong signal
   OR signal_timingAdvance = 0                  -- device at zero distance
```

---

*Fields validated against: 3GPP TS 24.008, TS 36.331, TS 38.331, ITU-T E.212*
*Last updated: 2026-03-12*
