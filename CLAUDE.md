# CLAUDE.md - Project Context

## Project Overview
**Advanced Cell Report** is a web-based cellular network signal analysis platform. It visualizes mobile network data on interactive maps, detects anomalies (potential IMSI-catchers, rogue base stations), and generates forensic intelligence reports.

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Map**: Leaflet.js + leaflet-heat plugin
- **Icons**: Material Icons (Google Fonts CDN)
- **Fonts**: Inter (UI), JetBrains Mono (code)
- **Backend**: None (pure client-side)
- **Database queries**: ClickHouse SQL (generated, not executed)

## File Structure
```
├── index.html        # Main app - signal map viewer
├── sql-builder.html  # Polygon-based ClickHouse SQL generator
├── app.js            # All application logic for index.html
├── style.css         # Styles for index.html
├── report.html       # Static report template (reference only)
├── server.py         # Simple HTTP server (python3 server.py)
└── CLAUDE.md         # This file
```

## Key Features

### Signal Map (index.html)
- CSV upload with auto-column detection
- Heatmap and dot visualization modes
- Multi-select filters: Operator, PLMN, ISO/Country
- Time range filtering with histogram
- Operator legend with color coding
- Data table with click-to-fly navigation
- Forensic Report generation (opens in new tab)
- Bilingual support (EN/HE)

### SQL Builder (sql-builder.html)
- Draw polygons/rectangles on map
- Generate ClickHouse SQL for:
  - SELECT queries (analysis)
  - ALTER UPDATE queries (modify MCC)
- Uses `pointInPolygon()` function
- Supports MCC filtering (include/exclude)

### Forensic Report (generated dynamically)
- Analyzes filtered data for anomalies
- Detects PLMN/Operator mismatches
- Classifies threats: CRITICAL, HIGH, MEDIUM
- Jordan border logic (lon 35.3° threshold)
- RTL support for Hebrew

## Data Model

### CSV Expected Columns
| Field     | Auto-detected names                    |
|-----------|----------------------------------------|
| Latitude  | lat, latitude                          |
| Longitude | lon, lng, longitude                    |
| Operator  | network_operator, operator, carrier    |
| PLMN      | network_PLMN, plmn, mcc                |
| ISO       | network_iso, iso, country              |
| Timestamp | timestamp, time, date, datetime        |
| Count     | counted, count, cnt, weight            |

### ClickHouse Schema (SQL Builder)
```sql
-- Table: measurements
-- Geo column: location_geo_coordinates (Tuple)
-- MCC column: network_mcc
-- Uses: pointInPolygon(location_geo_coordinates, [...])
```

## Important Constants

### MCC Codes (Mobile Country Codes)
```javascript
425 = Israel, 416 = Jordan, 602 = Egypt, 420 = Saudi Arabia,
417 = Syria, 418 = Iraq, 432 = Iran, 202 = Greece, 214 = Spain
```

### Critical MCCs (hostile nations)
```javascript
['432', '417', '418'] // Iran, Syria, Iraq
```

### Jordan Border Threshold
```javascript
const JORDAN_BORDER_LON = 35.3;
// PLMNs 416-xx east of this = natural spillover (not suspicious)
// PLMNs 416-xx west of this = deep inside Israel (suspicious)
// Exception: 416-77 is ALWAYS suspicious (phantom/unregistered)
```

## Color Palette
```css
--navy: #0a1628      /* Background */
--card: #162038      /* Card/panel background */
--accent: #3b82f6    /* Blue accent */
--red: #ef4444       /* Critical severity */
--orange: #f59e0b    /* High severity */
--cyan: #06b6d4      /* Medium severity */
--text: #e2e8f0      /* Primary text */
```

## Development

### Run locally
```bash
python3 -m http.server 8000
# or
python3 server.py
```
Then open http://localhost:8000

### Key Functions (app.js)
- `generateReport()` - Creates forensic HTML report
- `analyzeAnomalies()` - Detects PLMN/operator mismatches
- `applyFilters()` - Filters data and updates UI
- `initReportControls()` - Language toggle + report button

## Notes for Claude
- The app uses Catppuccin Mocha color scheme (CSS variables)
- Reports open in new tab via `window.open()` + `document.write()`
- All report content is bilingual (LANG object with en/he keys)
- Leaflet Draw plugin used for polygon drawing in SQL Builder
- No external APIs - everything runs client-side
