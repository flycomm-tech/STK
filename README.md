# 📡 Advanced Cell Report — Network Signal Map

An interactive map for visualising mobile network signal data from CSV exports.

## Features

- 🗺 **Heatmap & Dot views** — switch between density heatmap and individual coloured dots
- 🔍 **Filter panel** — filter by Operator, PLMN, ISO/Country
- 🕒 **Time range** — histogram + date pickers to slice by timestamp
- 🎨 **Operator legend** — colour-coded, clickable to quick-filter
- 📂 **Upload any CSV** — drag-and-drop or click; a column-mapper dialog auto-detects fields
- ⊡ **Fit to data** — one-click zoom to the filtered dataset

## Quick Start

```bash
python3 server.py
```

Then open **http://localhost:8080** in your browser.

> ⚠️ **Do not** open `index.html` by double-clicking. The file upload only works
> when served over HTTP. `server.py` handles that with one command.

## Expected CSV Format

The app auto-detects columns by name. Recognised names:

| Field     | Recognised column names                              |
|-----------|------------------------------------------------------|
| Latitude  | `latitude`, `lat`, any column containing `lat`       |
| Longitude | `longitude`, `lon`, `lng`, any containing `lon`/`lng`|
| Count     | `counted`, `count`, `cnt`, `weight`, `value`         |
| Operator  | `network_operator`, `operator`, `carrier`, `provider`|
| PLMN      | `network_PLMN`, `plmn`, `mcc`, `mnc`                 |
| ISO       | `network_iso`, `iso`, `country`                      |
| Timestamp | `timestamp`, `time`, `date`, `datetime`, `ts`        |

Only **latitude** and **longitude** are required. All other columns are optional.

### Example rows

```csv
network_PLMN,network_operator,network_iso,counted,longitude,latitude,timestamp
416-77,Rami Levy,il,1,34.780551,32.053854,2024-10-08 18:39:03.450
416-01,Cellcom,il,1,35.201824,31.793399,2024-10-08 17:58:45.085
```

## File Structure

```
Advance Cell Report/
├── index.html    — app shell (HTML structure only)
├── app.js        — all application logic
├── style.css     — all styles (dark Catppuccin Mocha theme)
├── server.py     — one-command local HTTP server
├── .gitignore    — excludes CSV files and OS junk
└── README.md     — this file
```

## Tech Stack

- [Leaflet.js](https://leafletjs.com/) — interactive maps
- [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) — heatmap layer
- [CartoDB Dark Matter](https://carto.com/basemaps/) — dark tile layer
- Vanilla JS / CSS — no build step required
