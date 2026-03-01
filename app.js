/**
 * Advanced Cell Report — Network Signal Map
 * app.js — all application logic
 */

// ════════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════════

const OP_COLORS = {
  '':           '#6c7086',
  'Cellcom':    '#f38ba8',
  'Pelephone':  '#89b4fa',
  'Partner':    '#a6e3a1',
  'PARTNER':    '#a6e3a1',
  'Partner IL': '#94e2d5',
  'GOLAN T':    '#fab387',
  'Rami Levy':  '#cba6f7',
  'Zain JO':    '#89dceb',
  'zain JO':    '#89dceb',
  'zain SA':    '#f9e2af',
  'Orange JO':  '#fe640b',
  'EGYwe':      '#eed49f',
};

const COLOR_PALETTE = [
  '#f38ba8','#89b4fa','#a6e3a1','#fab387','#cba6f7',
  '#89dceb','#f9e2af','#94e2d5','#eed49f','#fe640b',
  '#b4befe','#f2cdcd','#89dceb',
];

const FIELDS = [
  { key:'lat',       label:'Latitude',    required:true  },
  { key:'lon',       label:'Longitude',   required:true  },
  { key:'count',     label:'Count',       required:false },
  { key:'operator',  label:'Operator',    required:false },
  { key:'plmn',      label:'PLMN',        required:false },
  { key:'iso',       label:'ISO/Country', required:false },
  { key:'timestamp', label:'Timestamp',   required:false },
  { key:'cell_enb',  label:'eNB ID',      required:false },
  { key:'cell_eci',  label:'Cell ID/ECI', required:false },
];

const TABLE_MAX = 500;

// ── MCC Lookup Table (Mobile Country Code → ISO country) ────────
const MCC_TABLE = {
  // Middle East
  '425':{ country:'il', name:'Israel'       }, '416':{ country:'jo', name:'Jordan'       },
  '602':{ country:'eg', name:'Egypt'        }, '420':{ country:'sa', name:'Saudi Arabia'  },
  '418':{ country:'iq', name:'Iraq'         }, '419':{ country:'kw', name:'Kuwait'        },
  '417':{ country:'sy', name:'Syria'        }, '415':{ country:'lb', name:'Lebanon'       },
  '421':{ country:'ye', name:'Yemen'        }, '424':{ country:'ae', name:'UAE'            },
  '427':{ country:'qa', name:'Qatar'        }, '426':{ country:'bh', name:'Bahrain'       },
  '422':{ country:'om', name:'Oman'         }, '432':{ country:'ir', name:'Iran'           },
  // North Africa
  '603':{ country:'dz', name:'Algeria'      }, '604':{ country:'ma', name:'Morocco'       },
  '605':{ country:'tn', name:'Tunisia'      }, '606':{ country:'ly', name:'Libya'          },
  // Europe
  '262':{ country:'de', name:'Germany'      }, '208':{ country:'fr', name:'France'        },
  '234':{ country:'gb', name:'United Kingdom'}, '222':{ country:'it', name:'Italy'         },
  '214':{ country:'es', name:'Spain'        }, '204':{ country:'nl', name:'Netherlands'   },
  '206':{ country:'be', name:'Belgium'      }, '228':{ country:'ch', name:'Switzerland'   },
  '232':{ country:'at', name:'Austria'      }, '260':{ country:'pl', name:'Poland'        },
  '226':{ country:'ro', name:'Romania'      }, '230':{ country:'cz', name:'Czech Republic'},
  '240':{ country:'se', name:'Sweden'       }, '242':{ country:'no', name:'Norway'        },
  '244':{ country:'fi', name:'Finland'      }, '246':{ country:'lt', name:'Lithuania'     },
  '247':{ country:'lv', name:'Latvia'       }, '248':{ country:'ee', name:'Estonia'       },
  '255':{ country:'ua', name:'Ukraine'      }, '250':{ country:'ru', name:'Russia'        },
  '202':{ country:'gr', name:'Greece'       }, '219':{ country:'hr', name:'Croatia'       },
  '284':{ country:'bg', name:'Bulgaria'     }, '216':{ country:'hu', name:'Hungary'       },
  '286':{ country:'tr', name:'Turkey'       }, '293':{ country:'si', name:'Slovenia'      },
  '220':{ country:'rs', name:'Serbia'       },
  // Americas
  '310':{ country:'us', name:'United States'}, '311':{ country:'us', name:'United States' },
  '312':{ country:'us', name:'United States'}, '302':{ country:'ca', name:'Canada'        },
  '334':{ country:'mx', name:'Mexico'       }, '724':{ country:'br', name:'Brazil'        },
  '722':{ country:'ar', name:'Argentina'    },
  // Asia-Pacific
  '440':{ country:'jp', name:'Japan'        }, '450':{ country:'kr', name:'South Korea'   },
  '460':{ country:'cn', name:'China'        }, '520':{ country:'th', name:'Thailand'      },
  '510':{ country:'id', name:'Indonesia'    }, '502':{ country:'my', name:'Malaysia'      },
  '525':{ country:'sg', name:'Singapore'    }, '515':{ country:'ph', name:'Philippines'   },
  '452':{ country:'vn', name:'Vietnam'      }, '404':{ country:'in', name:'India'         },
  '405':{ country:'in', name:'India'        },
  // Oceania
  '505':{ country:'au', name:'Australia'    }, '530':{ country:'nz', name:'New Zealand'   },
  // Africa
  '655':{ country:'za', name:'South Africa' }, '621':{ country:'ng', name:'Nigeria'       },
  '639':{ country:'ke', name:'Kenya'        },
};

// ── Operator → expected country hints ───────────────────────────
const OPERATOR_COUNTRY_HINTS = {
  'cellcom':'il', 'pelephone':'il', 'partner':'il', 'partner il':'il',
  'golan':'il', 'golan t':'il', 'rami levy':'il', 'hot mobile':'il',
  'zain jo':'jo', 'orange jo':'jo', 'umniah':'jo',
  'zain sa':'sa', 'stc':'sa', 'mobily':'sa',
  'egywe':'eg', 'vodafone eg':'eg', 'etisalat eg':'eg', 'orange eg':'eg',
  'orange':'fr', 'vodafone':'gb', 't-mobile':'de',
};

// ════════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════════

// Each point: [lat, lon, count, opIdx, plmnIdx, isoIdx, ts_ms|null]
const APP = {
  points:     [],
  operators:  [],
  plmns:      [],
  isos:       [],
  colors:     [],
  filtered:   [],
  minTs:      null,
  maxTs:      null,
  minDate:    '',
  maxDate:    '',
  monthsHist: [],
  hasTime:    false,
  loaded:     false,
  _uiBound:   false,
};

const FILTERS = {
  opIdxs:   new Set(),
  plmnIdxs: new Set(),
  isoIdxs:  new Set(),
  tsFrom:   null,
  tsTo:     null,
};

let viewMode   = 'heat';
let map        = null;
let heatLayer  = null;
let dotLayer   = null;
let canvasRend = null;
let pendingCSV = null;
let msOp, msPlmn, msIso;
let _filterTimer = null;

// ════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initMultiSelects();
  setupUpload();
  checkSQLBuilderData();
});

// Check for data passed from SQL Builder
function checkSQLBuilderData() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('source') !== 'sqlbuilder') {
    console.log('[Signal Map] Not from SQL Builder, skipping data check');
    return;
  }

  console.log('[Signal Map] Loading data from SQL Builder...');

  // Show loading state immediately
  setStatus('⏳ Loading data from SQL Builder...', 'loading');

  const csvData = localStorage.getItem('sqlBuilderData');
  const timestamp = localStorage.getItem('sqlBuilderTimestamp');

  console.log('[Signal Map] SQL Builder data check:', {
    hasData: !!csvData,
    timestamp,
    dataLength: csvData?.length,
    firstChars: csvData?.substring(0, 200)
  });

  if (!csvData) {
    console.warn('[Signal Map] No SQL Builder data found in localStorage');
    setStatus('⚠ No data received from SQL Builder. Please try executing the query again.', 'error');
    // Remove the query parameter from URL anyway
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  // Clear the stored data after reading (cleanup)
  localStorage.removeItem('sqlBuilderData');
  localStorage.removeItem('sqlBuilderTimestamp');

  // Remove the query parameter from URL
  window.history.replaceState({}, document.title, window.location.pathname);

  // Process the CSV data directly (auto-map columns from SQL Builder)
  try {
    const { headers, rows } = parseCSV(csvData);
    console.log('[Signal Map] Parsed CSV:', { headers, rowCount: rows.length });

    if (rows.length === 0) {
      setStatus('⚠ No data rows found in SQL Builder results.', 'error');
      return;
    }

    const detected = detectColumns(headers);
    console.log('[Signal Map] Detected columns:', detected);

    // SQL Builder uses known column names - build column map directly
    const colMap = {};
    if (detected.lat) colMap.lat = detected.lat;
    if (detected.lon) colMap.lon = detected.lon;
    if (detected.count) colMap.count = detected.count;
    if (detected.operator) colMap.operator = detected.operator;
    if (detected.plmn) colMap.plmn = detected.plmn;
    if (detected.iso) colMap.iso = detected.iso;
    if (detected.timestamp) colMap.timestamp = detected.timestamp;
    if (detected.cell_enb) colMap.cell_enb = detected.cell_enb;
    if (detected.cell_eci) colMap.cell_eci = detected.cell_eci;

    console.log('[Signal Map] Column map:', colMap);

    // Validate required columns
    if (!colMap.lat || !colMap.lon) {
      console.warn('[Signal Map] Could not auto-detect lat/lon columns, showing mapper');
      console.log('[Signal Map] Headers were:', headers);
      // Fall back to manual mapper if auto-detection fails
      setStatus('');
      showColumnMapper(headers, detected, rows, 'SQL Builder Query');
      return;
    }

    // Hide empty state and show sidebar content
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('sb-body').classList.remove('hidden');
    document.getElementById('sb-footer').classList.remove('hidden');

    console.log('[Signal Map] Loading', rows.length, 'rows from SQL Builder...');
    setStatus('✓ Loaded ' + rows.length.toLocaleString() + ' rows from SQL Builder', 'success');

    // Clear the success message after a delay
    setTimeout(() => setStatus(''), 3000);

    loadCSVData(rows, colMap, 'SQL Builder Query (' + rows.length.toLocaleString() + ' rows)');
  } catch (err) {
    console.error('[Signal Map] Error loading SQL Builder data:', err);
    setStatus('⚠ Error loading SQL Builder data: ' + err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════════
//  MAP
// ════════════════════════════════════════════════════════════════

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([31.5, 35.0], 7);
  canvasRend = L.canvas({ padding: 0.5 });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);
}

function clearLayers() {
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
  if (dotLayer)  { map.removeLayer(dotLayer);  dotLayer  = null; }
}

function buildHeat(data) {
  clearLayers();
  if (!data.length) return;
  heatLayer = L.heatLayer(
    data.map(([lat, lon, cnt]) => [lat, lon, cnt]),
    {
      radius:     14,
      blur:       18,
      maxZoom:    17,
      max:        8,
      minOpacity: 0.35,
      gradient: {
        0.15: '#313bac',
        0.35: '#06b6d4',
        0.55: '#84cc16',
        0.75: '#facc15',
        1.00: '#ef4444',
      },
    }
  ).addTo(map);
}

function buildDots(data) {
  clearLayers();
  if (!data.length) return;
  dotLayer = L.layerGroup();

  data.forEach(([lat, lon, cnt, oi, pi, ii, ts, enb, eci]) => {
    const op    = APP.operators[oi] || '';
    const plmn  = APP.plmns[pi]     || '';
    const iso   = APP.isos[ii]      || '';
    const color = APP.colors[oi]    || '#888';
    const tsStr = ts ? new Date(ts).toLocaleString() : '—';

    const marker = L.circleMarker([lat, lon], {
      renderer:    canvasRend,
      radius:      5,
      color,       weight: 1.2,
      fillColor:   color,
      fillOpacity: 0.8,
    });

    // Build popup via DOM (safe from injection)
    const inner = document.createElement('div');
    inner.className = 'popup-inner';

    const badge = document.createElement('div');
    badge.className = 'popup-badge';
    badge.style.background = color;
    badge.textContent = op || 'Unknown operator';
    inner.appendChild(badge);

    const tbl = document.createElement('table');
    tbl.className = 'popup-table';

    // Build rows dynamically - only show cell fields if they have values
    const rows = [
      ['Operator', op   || '—', !op],
      ['PLMN',     plmn || '—', !plmn],
      ['ISO',      iso  || '—', !iso],
    ];

    // Add cell info if available (from Cell/eNB Search)
    if (enb) rows.push(['eNB', String(enb), false]);
    if (eci) rows.push(['ECI', String(eci), false]);

    rows.push(
      ['Count',    String(cnt), false],
      ['Time',     tsStr,       !ts],
      ['Lat/Lon',  `${lat.toFixed(5)}, ${lon.toFixed(5)}`, false]
    );

    rows.forEach(([key, val, dim]) => {
      const tr = tbl.insertRow();
      tr.insertCell().textContent = key;
      const td = tr.insertCell();
      td.textContent = val;
      if (dim) td.className = 'dim';
    });
    inner.appendChild(tbl);

    marker.bindPopup(inner, { maxWidth: 230 });
    dotLayer.addLayer(marker);
  });

  dotLayer.addTo(map);
}

function render() {
  if (viewMode === 'heat') buildHeat(APP.filtered);
  else                     buildDots(APP.filtered);
}

function fitToData(data) {
  if (!data || !data.length) return;
  const lats = data.map(p => p[0]);
  const lons  = data.map(p => p[1]);
  map.fitBounds(
    [[Math.min(...lats), Math.min(...lons)],
     [Math.max(...lats), Math.max(...lons)]],
    { padding: [32, 32] }
  );
}

// ════════════════════════════════════════════════════════════════
//  MULTI-SELECT CLASS
// ════════════════════════════════════════════════════════════════

class MultiSelect {
  /**
   * @param {string}   prefix    DOM id prefix: 'op' | 'plmn' | 'iso'
   * @param {string}   allLabel  Label when nothing selected ("All Operators")
   * @param {string[]} singPlur  ['Operator','Operators']
   */
  constructor(prefix, allLabel, [singLabel, plurLabel]) {
    this.prefix    = prefix;
    this.selected  = new Set();
    this.allLabel  = allLabel;
    this.singLabel = singLabel;
    this.plurLabel = plurLabel;
    this.onChange  = null;   // assign externally

    const $ = id => document.getElementById(id);
    this.wrap      = $(`${prefix}-ms`);
    this.trigger   = $(`${prefix}-trigger`);
    this.panel     = $(`${prefix}-panel`);
    this.search    = $(`${prefix}-search`);
    this.list      = $(`${prefix}-list`);
    this.allBtn    = $(`${prefix}-all`);
    this.clearBtn  = $(`${prefix}-clear`);
    this.badge     = $(`${prefix}-badge`);
    this.trigLabel = this.trigger.querySelector('.ms-trig-label');

    this._initPanel();
    this._updateLabel();
  }

  // ── Panel toggle & outside-click close ───────────────────────
  _initPanel() {
    this.trigger.addEventListener('click', e => {
      e.stopPropagation();
      const open = this.panel.classList.toggle('open');
      this.trigger.classList.toggle('open', open);
      if (open) this.search.focus();
    });

    document.addEventListener('click', e => {
      if (!this.wrap.contains(e.target)) {
        this.panel.classList.remove('open');
        this.trigger.classList.remove('open');
      }
    });

    // Live search filter
    this.search.addEventListener('input', () => {
      const q = this.search.value.toLowerCase();
      this.list.querySelectorAll('.ms-option').forEach(row => {
        row.classList.toggle('hidden', q !== '' && !row.dataset.label.includes(q));
      });
    });

    // Select all visible
    this.allBtn.addEventListener('click', () => {
      this.list.querySelectorAll('.ms-option:not(.hidden)').forEach(row => {
        const cb = row.querySelector('input');
        cb.checked = true;
        this.selected.add(+cb.value);
      });
      this._updateLabel();
      if (this.onChange) this.onChange();
    });

    // Clear all
    this.clearBtn.addEventListener('click', () => {
      this.list.querySelectorAll('input').forEach(cb => { cb.checked = false; });
      this.selected.clear();
      this._updateLabel();
      if (this.onChange) this.onChange();
    });
  }

  // ── Build / populate ─────────────────────────────────────────
  /**
   * Rebuild the option list (clears previous selections).
   * @param {Array<{label:string, idx:number, count:number}>} items
   */
  build(items) {
    this.search.value = '';
    this.list.innerHTML = '';
    this.selected.clear();

    items.forEach(({ label, idx, count }) => {
      const row = document.createElement('label');
      row.className     = 'ms-option';
      row.dataset.idx   = idx;
      row.dataset.label = (label || '').toLowerCase();

      const cb = document.createElement('input');
      cb.type  = 'checkbox';
      cb.value = idx;
      cb.addEventListener('change', () => {
        if (cb.checked) this.selected.add(idx);
        else            this.selected.delete(idx);
        this._updateLabel();
        if (this.onChange) this.onChange();
      });

      const lbl = document.createElement('span');
      lbl.className   = 'ms-opt-label';
      lbl.textContent = label || '(unknown)';

      const cntEl = document.createElement('span');
      cntEl.className   = 'ms-opt-count';
      cntEl.textContent = (count || 0).toLocaleString();

      row.append(cb, lbl, cntEl);
      this.list.appendChild(row);
    });

    this._updateLabel();
  }

  // ── Cross-filter dimming ──────────────────────────────────────
  /**
   * Gray-out items not in availSet.
   * @param {Set<number>|null} availSet  null = un-dim all
   */
  setAvailability(availSet) {
    this.list.querySelectorAll('.ms-option').forEach(row => {
      const dim = availSet !== null && !availSet.has(+row.dataset.idx);
      row.classList.toggle('ms-dim', dim);
    });
  }

  // ── Toggle single item (legend click) ────────────────────────
  toggle(idx) {
    const row = this.list.querySelector(`.ms-option[data-idx="${idx}"]`);
    if (!row) return;
    const cb = row.querySelector('input');
    if (this.selected.has(idx)) {
      this.selected.delete(idx);
      if (cb) cb.checked = false;
    } else {
      this.selected.add(idx);
      if (cb) cb.checked = true;
    }
    this._updateLabel();
  }

  // ── Clear ────────────────────────────────────────────────────
  clear() {
    this.list.querySelectorAll('input').forEach(cb => { cb.checked = false; });
    this.selected.clear();
    this._updateLabel();
  }

  // ── Label & badge ────────────────────────────────────────────
  _updateLabel() {
    const n = this.selected.size;
    if (n === 0) {
      this.trigLabel.textContent = this.allLabel;
      this.badge.style.display   = 'none';
    } else {
      this.trigLabel.textContent = `${n} ${n === 1 ? this.singLabel : this.plurLabel} selected`;
      this.badge.textContent     = n;
      this.badge.style.display   = 'inline-block';
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  MULTI-SELECT INIT  (called once after DOM ready)
// ════════════════════════════════════════════════════════════════

function initMultiSelects() {
  msOp   = new MultiSelect('op',   'All Operators', ['Operator',  'Operators' ]);
  msPlmn = new MultiSelect('plmn', 'All PLMNs',     ['PLMN',      'PLMNs'     ]);
  msIso  = new MultiSelect('iso',  'All Countries', ['Country',   'Countries' ]);

  // Wire onChange → update FILTERS reference + schedule re-filter
  msOp.onChange   = () => { FILTERS.opIdxs   = msOp.selected;   scheduleFilter(); };
  msPlmn.onChange = () => { FILTERS.plmnIdxs = msPlmn.selected; scheduleFilter(); };
  msIso.onChange  = () => { FILTERS.isoIdxs  = msIso.selected;  scheduleFilter(); };
}

// ════════════════════════════════════════════════════════════════
//  FILTERS
// ════════════════════════════════════════════════════════════════

function scheduleFilter() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(applyFilters, 80);
}

function applyFilters() {
  const f = FILTERS;
  APP.filtered = APP.points.filter(([,,,oi,pi,ii,ts]) => {
    if (f.opIdxs.size   > 0 && !f.opIdxs.has(oi))   return false;
    if (f.plmnIdxs.size > 0 && !f.plmnIdxs.has(pi)) return false;
    if (f.isoIdxs.size  > 0 && !f.isoIdxs.has(ii))  return false;
    if (ts != null) {
      if (f.tsFrom != null && ts < f.tsFrom) return false;
      if (f.tsTo   != null && ts > f.tsTo)   return false;
    }
    return true;
  });

  updateDependencies();
  updateStats();
  updateActiveFiltersCount();
  drawHistogram();
  updateLegendDim();
  updateTable();
  render();
}

// ── Cross-filter dependency dimming ──────────────────────────────

function updateDependencies() {
  const f = FILTERS;
  const availOps   = new Set();
  const availPlmns = new Set();
  const availIsos  = new Set();

  APP.points.forEach(([,,,oi,pi,ii]) => {
    const opOk   = f.opIdxs.size   === 0 || f.opIdxs.has(oi);
    const plmnOk = f.plmnIdxs.size === 0 || f.plmnIdxs.has(pi);
    const isoOk  = f.isoIdxs.size  === 0 || f.isoIdxs.has(ii);

    // Each filter's availability is driven by the OTHER two filters
    if (plmnOk && isoOk)  availOps.add(oi);
    if (opOk   && isoOk)  availPlmns.add(pi);
    if (opOk   && plmnOk) availIsos.add(ii);
  });

  // Only dim when at least one other filter is active
  msOp.setAvailability  (f.plmnIdxs.size > 0 || f.isoIdxs.size  > 0 ? availOps   : null);
  msPlmn.setAvailability(f.opIdxs.size   > 0 || f.isoIdxs.size  > 0 ? availPlmns : null);
  msIso.setAvailability (f.opIdxs.size   > 0 || f.plmnIdxs.size > 0 ? availIsos  : null);
}

// ════════════════════════════════════════════════════════════════
//  TABLE PANEL
// ════════════════════════════════════════════════════════════════

function updateTable() {
  const tbody   = document.getElementById('table-tbody');
  const countEl = document.getElementById('table-count');
  const capEl   = document.getElementById('table-cap');
  if (!tbody) return;

  const data   = APP.filtered;
  const capped = data.length > TABLE_MAX;
  const rows   = capped ? data.slice(0, TABLE_MAX) : data;

  if (countEl) countEl.textContent = data.length.toLocaleString();
  if (capEl) {
    capEl.textContent   = capped ? `(showing first ${TABLE_MAX.toLocaleString()})` : '';
    capEl.style.display = capped ? '' : 'none';
  }

  const frag = document.createDocumentFragment();
  rows.forEach(([lat, lon, cnt, oi, pi, ii, ts, enb, eci]) => {
    const op    = APP.operators[oi] || '';
    const plmn  = APP.plmns[pi]     || '';
    const iso   = APP.isos[ii]      || '';
    const color = APP.colors[oi]    || '#888';
    const tsStr = ts ? new Date(ts).toLocaleString() : '—';

    const tr = document.createElement('tr');

    // Operator cell with colour dot
    const tdOp = document.createElement('td');
    const dot  = document.createElement('span');
    dot.className        = 'td-op-dot';
    dot.style.background = color;
    tdOp.appendChild(dot);
    tdOp.appendChild(document.createTextNode(op || '—'));
    tr.appendChild(tdOp);

    [plmn || '—', iso || '—', enb || '—', eci || '—', tsStr, cnt, lat.toFixed(5), lon.toFixed(5)]
      .forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });

    // Click row → fly to point
    tr.addEventListener('click', () => {
      map.flyTo([lat, lon], 15, { duration: 1.2 });
    });

    frag.appendChild(tr);
  });

  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

// ════════════════════════════════════════════════════════════════
//  AI ANOMALY DETECTION
// ════════════════════════════════════════════════════════════════

function analyzeAnomalies() {
  const anomalies = [];
  const data = APP.filtered;

  // ── Pass 1: PLMN/Country + PLMN/Operator mismatches ─────────
  data.forEach((pt, idx) => {
    const [lat, lon, cnt, oi, pi, ii, ts] = pt;
    const plmn     = APP.plmns[pi]     || '';
    const iso      = (APP.isos[ii]     || '').toLowerCase();
    const operator = APP.operators[oi] || '';

    if (!plmn || plmn.length < 3) return;

    const mcc     = plmn.replace('-', '').slice(0, 3);
    const mccInfo = MCC_TABLE[mcc];
    if (!mccInfo) return;

    const expectedCountry = mccInfo.country;

    // Check 1: MCC country vs ISO field
    if (iso && iso !== expectedCountry) {
      anomalies.push({
        type: 'plmn_country_mismatch', severity: 'high',
        lat, lon, count: cnt, timestamp: ts,
        plmn, iso, operator, mcc,
        expectedCountry: mccInfo.name, actualCountry: iso,
        description: `PLMN ${plmn} (MCC ${mcc} = ${mccInfo.name}) found with ISO "${iso}"`,
        pointIndex: idx,
      });
    }

    // Check 2: operator name hint vs MCC country
    const opKey = operator.toLowerCase().trim();
    const opHint = OPERATOR_COUNTRY_HINTS[opKey];
    if (opHint && opHint !== expectedCountry) {
      anomalies.push({
        type: 'plmn_operator_mismatch', severity: 'high',
        lat, lon, count: cnt, timestamp: ts,
        plmn, iso, operator, mcc,
        expectedCountry: mccInfo.name, operatorExpectedCountry: opHint,
        description: `Operator "${operator}" (expected ${opHint}) using PLMN ${plmn} (${mccInfo.name})`,
        pointIndex: idx,
      });
    }
  });

  // ── Pass 2: Geographic clustering (~500 m) ──────────────────
  const clusters = [];
  const visited  = new Set();
  const RADIUS   = 0.005; // ~500 m in degrees

  anomalies.forEach((a, i) => {
    if (visited.has(i)) return;
    const cluster = [a];
    visited.add(i);
    anomalies.forEach((b, j) => {
      if (i === j || visited.has(j)) return;
      if (Math.abs(a.lat - b.lat) < RADIUS && Math.abs(a.lon - b.lon) < RADIUS) {
        cluster.push(b);
        visited.add(j);
      }
    });
    if (cluster.length > 1) {
      const avgLat = cluster.reduce((s, c) => s + c.lat, 0) / cluster.length;
      const avgLon = cluster.reduce((s, c) => s + c.lon, 0) / cluster.length;
      clusters.push({
        center: [avgLat, avgLon], count: cluster.length,
        anomalies: cluster,
        uniquePlmns:     [...new Set(cluster.map(c => c.plmn))],
        uniqueOperators: [...new Set(cluster.map(c => c.operator))],
      });
    }
  });

  // ── Pass 3: Temporal bursts (≥3 anomalies within 1 h) ──────
  const temporalBursts = [];
  const tsAnoms = anomalies.filter(a => a.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  const WINDOW = 3600000; // 1 hour

  if (tsAnoms.length >= 3) {
    let start = 0;
    for (let i = 1; i <= tsAnoms.length; i++) {
      if (i === tsAnoms.length || tsAnoms[i].timestamp - tsAnoms[start].timestamp > WINDOW) {
        if (i - start >= 3) {
          temporalBursts.push({
            startTime: tsAnoms[start].timestamp,
            endTime:   tsAnoms[i - 1].timestamp,
            count:     i - start,
            anomalies: tsAnoms.slice(start, i),
          });
        }
        start = i;
      }
    }
  }

  // ── Statistics ──────────────────────────────────────────────
  const stats = {
    totalPoints:     APP.points.length,
    filteredPoints:  APP.filtered.length,
    uniqueOperators: APP.operators.length,
    uniquePlmns:     APP.plmns.length,
    uniqueIsos:      APP.isos.length,
    operators:       APP.operators,
    plmns:           APP.plmns,
    isos:            APP.isos,
    latRange: data.length ? [Math.min(...data.map(p => p[0])), Math.max(...data.map(p => p[0]))] : null,
    lonRange: data.length ? [Math.min(...data.map(p => p[1])), Math.max(...data.map(p => p[1]))] : null,
  };

  return {
    anomalies, clusters, temporalBursts, stats,
    summary: {
      totalAnomalies:        anomalies.length,
      plmnCountryMismatches: anomalies.filter(a => a.type === 'plmn_country_mismatch').length,
      plmnOperatorMismatches:anomalies.filter(a => a.type === 'plmn_operator_mismatch').length,
      clusterCount:          clusters.length,
      burstCount:            temporalBursts.length,
    },
  };
}

// ════════════════════════════════════════════════════════════════
//  FORENSIC REPORT GENERATOR
// ════════════════════════════════════════════════════════════════

/* ── Jordan border longitude threshold ──
   Jordanian PLMNs (416-xx) east of this line are natural border spillover → NOT suspicious.
   416-xx west of this line (deep inside Israel) → SUSPICIOUS.
   Exception: 416-77 (phantom/unregistered) is always suspicious regardless of location. */
const JORDAN_BORDER_LON = 35.3;

// (AI chat functions removed - now using client-side report generation)

// ════════════════════════════════════════════════════════════════
//  HISTOGRAM
// ════════════════════════════════════════════════════════════════

function drawHistogram() {
  const canvas = document.getElementById('hist-canvas');
  if (!canvas || !APP.hasTime || !APP.monthsHist.length) return;

  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth || 262;
  const H   = 44;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const hist   = APP.monthsHist;
  const maxV   = Math.max(...hist.map(h => h[1]));
  const bw     = W / hist.length;
  const fromYM = (document.getElementById('date-from')?.value || '').slice(0, 7);
  const toYM   = (document.getElementById('date-to')?.value   || '').slice(0, 7);

  hist.forEach(([ym, cnt], i) => {
    const bh  = Math.max(2, (cnt / maxV) * (H - 8));
    const inR = (!fromYM || ym >= fromYM) && (!toYM || ym <= toYM);
    ctx.fillStyle = inR ? '#cba6f7' : '#45475a';
    ctx.fillRect(i * bw + 0.5, H - bh, bw - 1, bh);
  });

  ctx.fillStyle = '#585b70';
  ctx.font = '9px Segoe UI, sans-serif';
  if (hist.length) {
    ctx.fillText(hist[0][0], 2, 10);
    ctx.fillText(hist[hist.length - 1][0], W - 44, 10);
  }
}

// ════════════════════════════════════════════════════════════════
//  UI — STATS / LEGEND / LOADED STATE
// ════════════════════════════════════════════════════════════════

function showLoadedState() {
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('sb-body').classList.remove('hidden');
  document.getElementById('sb-footer').classList.remove('hidden');
  const rptBtn = document.getElementById('btn-generate-report');
  if (rptBtn) rptBtn.style.display = '';
}

function updateStats() {
  const el = document.getElementById('stat-count');
  if (el) el.textContent = APP.filtered.length.toLocaleString();
}

function updateActiveFiltersCount() {
  const n = (FILTERS.opIdxs.size   > 0 ? 1 : 0)
          + (FILTERS.plmnIdxs.size > 0 ? 1 : 0)
          + (FILTERS.isoIdxs.size  > 0 ? 1 : 0);
  const el = document.getElementById('active-filters-count');
  if (!el) return;
  el.textContent   = n > 0 ? n : '';
  el.style.display = n > 0 ? '' : 'none';
}

function updateLegendDim() {
  document.querySelectorAll('.legend-item').forEach(el => {
    const active = FILTERS.opIdxs.size === 0 || FILTERS.opIdxs.has(+el.dataset.opIdx);
    el.classList.toggle('dimmed', !active);
  });
}

// ════════════════════════════════════════════════════════════════
//  BUILD ALL THREE MULTI-SELECTS + LEGEND
// ════════════════════════════════════════════════════════════════

function buildAllMultiSelects() {
  const opCounts   = {};
  const plmnCounts = {};
  const isoCounts  = {};
  const opMccCounts = {};  // Track MCC associations for operators: opIdx -> { mcc -> count }

  APP.points.forEach(p => {
    const oi = p[3], pi = p[4];
    opCounts[oi]   = (opCounts[oi]   || 0) + 1;
    plmnCounts[pi] = (plmnCounts[pi] || 0) + 1;
    isoCounts[p[5]] = (isoCounts[p[5]] || 0) + 1;

    // Track MCC for this operator
    const plmn = APP.plmns[pi] || '';
    const mcc = plmn.replace('-', '').slice(0, 3);
    if (mcc) {
      if (!opMccCounts[oi]) opMccCounts[oi] = {};
      opMccCounts[oi][mcc] = (opMccCounts[oi][mcc] || 0) + 1;
    }
  });

  // Get most common MCC for each operator
  const opMcc = {};
  Object.entries(opMccCounts).forEach(([oi, mccMap]) => {
    let maxMcc = '', maxCount = 0;
    Object.entries(mccMap).forEach(([mcc, cnt]) => {
      if (cnt > maxCount) { maxMcc = mcc; maxCount = cnt; }
    });
    opMcc[oi] = maxMcc;
  });

  // Helper to get PLMN label with country name
  const getPlmnLabel = (plmn) => {
    const mcc = (plmn || '').replace('-', '').slice(0, 3);
    const info = MCC_TABLE[mcc];
    return info ? `${plmn} (${info.name})` : plmn;
  };

  // Helper to get operator label with MCC
  const getOpLabel = (op, idx) => {
    const mcc = opMcc[idx];
    return mcc ? `${op} (${mcc})` : op;
  };

  const toItems = (arr, counts) =>
    arr.map((v, i) => ({ label: v, idx: i, count: counts[i] || 0 }))
       .sort((a, b) => b.count - a.count);

  const toPlmnItems = (arr, counts) =>
    arr.map((v, i) => ({ label: getPlmnLabel(v), idx: i, count: counts[i] || 0 }))
       .sort((a, b) => b.count - a.count);

  const toOpItems = (arr, counts) =>
    arr.map((v, i) => ({ label: getOpLabel(v, i), idx: i, count: counts[i] || 0 }))
       .sort((a, b) => b.count - a.count);

  msOp.build  (toOpItems(APP.operators, opCounts));
  msPlmn.build(toPlmnItems(APP.plmns, plmnCounts));
  msIso.build (toItems(APP.isos, isoCounts));

  // Keep FILTERS in sync with the (freshly cleared) selected Sets
  FILTERS.opIdxs   = msOp.selected;
  FILTERS.plmnIdxs = msPlmn.selected;
  FILTERS.isoIdxs  = msIso.selected;
}

function buildLegend() {
  const container = document.getElementById('legend-items');
  container.innerHTML = '';

  const opCounts = {};
  const opMccCounts = {};  // Track MCC for each operator
  APP.points.forEach(p => {
    const oi = p[3], pi = p[4];
    opCounts[oi] = (opCounts[oi] || 0) + 1;
    // Track MCC for this operator
    const plmn = APP.plmns[pi] || '';
    const mcc = plmn.replace('-', '').slice(0, 3);
    if (mcc) {
      if (!opMccCounts[oi]) opMccCounts[oi] = {};
      opMccCounts[oi][mcc] = (opMccCounts[oi][mcc] || 0) + 1;
    }
  });

  // Get most common MCC for each operator
  const opMcc = {};
  Object.entries(opMccCounts).forEach(([oi, mccMap]) => {
    let maxMcc = '', maxCount = 0;
    Object.entries(mccMap).forEach(([mcc, cnt]) => {
      if (cnt > maxCount) { maxMcc = mcc; maxCount = cnt; }
    });
    opMcc[oi] = maxMcc;
  });

  APP.operators
    .map((op, i) => [op, i, opCounts[i] || 0])
    .sort((a, b) => b[2] - a[2])
    .forEach(([op, i, cnt]) => {
      const item = document.createElement('div');
      item.className     = 'legend-item';
      item.dataset.opIdx = i;

      const dot = document.createElement('div');
      dot.className        = 'leg-dot';
      dot.style.background = APP.colors[i];

      const mcc = opMcc[i] || '';
      const lbl = document.createElement('span');
      lbl.className   = 'leg-label';
      lbl.textContent = mcc ? `${op || '(unknown)'} (${mcc})` : (op || '(unknown)');

      const cntEl = document.createElement('span');
      cntEl.className   = 'leg-count';
      cntEl.textContent = cnt.toLocaleString();

      item.append(dot, lbl, cntEl);

      // Legend click → toggle that operator in the multi-select
      item.addEventListener('click', () => {
        msOp.toggle(i);
        FILTERS.opIdxs = msOp.selected;
        scheduleFilter();
      });

      container.appendChild(item);
    });
}

// ════════════════════════════════════════════════════════════════
//  UI EVENTS  (bound once after first data load)
// ════════════════════════════════════════════════════════════════

function bindUIEvents() {
  if (APP._uiBound) return;
  APP._uiBound = true;

  // ── Clear all filters ───────────────────────────────────────
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    msOp.clear();
    msPlmn.clear();
    msIso.clear();
    FILTERS.opIdxs   = msOp.selected;
    FILTERS.plmnIdxs = msPlmn.selected;
    FILTERS.isoIdxs  = msIso.selected;
    if (APP.hasTime) {
      FILTERS.tsFrom = APP.minTs;
      FILTERS.tsTo   = APP.maxTs;
      document.getElementById('date-from').value = APP.minDate;
      document.getElementById('date-to').value   = APP.maxDate;
    }
    applyFilters();
  });

  // ── Fit to data ─────────────────────────────────────────────
  document.getElementById('btn-fit')
    .addEventListener('click', () => fitToData(APP.filtered));

  // ── View toggle ─────────────────────────────────────────────
  document.getElementById('btn-heat').addEventListener('click', function () {
    viewMode = 'heat';
    this.classList.add('active');
    document.getElementById('btn-dots').classList.remove('active');
    render();
  });

  document.getElementById('btn-dots').addEventListener('click', function () {
    viewMode = 'dots';
    this.classList.add('active');
    document.getElementById('btn-heat').classList.remove('active');
    render();
  });

  // ── Date range pickers ──────────────────────────────────────
  ['date-from', 'date-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      const fv = document.getElementById('date-from').value;
      const tv = document.getElementById('date-to').value;
      FILTERS.tsFrom = fv ? new Date(fv).getTime()                : null;
      FILTERS.tsTo   = tv ? new Date(tv + 'T23:59:59').getTime()  : null;
      scheduleFilter();
      drawHistogram();
    });
  });

  // ── Table panel toggle ──────────────────────────────────────
  const tablePanel  = document.getElementById('table-panel');
  const tableToggle = document.getElementById('table-toggle');
  tableToggle.addEventListener('click', () => {
    const isOpen = tablePanel.classList.toggle('open');
    tableToggle.textContent = isOpen ? '▼ Table' : '▲ Table';
    // Re-validate Leaflet map size after CSS transition (220 ms)
    setTimeout(() => map && map.invalidateSize(), 240);
  });

  // (Old AI chat handlers removed - now using client-side report generation)

  window.addEventListener('resize', drawHistogram);
}

// ════════════════════════════════════════════════════════════════
//  CSV UPLOAD
// ════════════════════════════════════════════════════════════════

function setupUpload() {
  const fileInput   = document.getElementById('file-input');
  const uploadArea  = document.getElementById('upload-area');
  const mapwrap     = document.getElementById('mapwrap');
  const dropOverlay = document.getElementById('drop-overlay');

  // File picker via <label for="file-input">
  fileInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    try { fileInput.value = ''; } catch (_) {}
    if (file) handleFile(file);
  });

  // Drag-and-drop on map area
  mapwrap.addEventListener('dragover', e => {
    e.preventDefault();
    dropOverlay.classList.add('show');
  });
  mapwrap.addEventListener('dragleave', e => {
    if (!e.relatedTarget || !mapwrap.contains(e.relatedTarget))
      dropOverlay.classList.remove('show');
  });
  mapwrap.addEventListener('drop', e => {
    e.preventDefault();
    dropOverlay.classList.remove('show');
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith('.csv')) handleFile(f);
  });

  // Drag-and-drop on sidebar upload area
  uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith('.csv')) handleFile(f);
  });
}

function setStatus(msg, type) {
  const el = document.getElementById('upload-status');
  el.textContent   = msg;
  el.className     = type ? 'status-' + type : '';
  el.style.display = msg ? 'block' : 'none';
}

function handleFile(file) {
  setStatus('⏳ Reading ' + file.name + '…', 'loading');
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const { headers, rows } = parseCSV(e.target.result);
      setStatus('');
      showColumnMapper(headers, detectColumns(headers), rows, file.name);
    } catch (err) {
      setStatus('⚠ ' + err.message, 'error');
    }
  };
  reader.onerror = () => {
    setStatus('⚠ Could not read file: ' + (reader.error?.message || 'unknown error'), 'error');
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════════════════════
//  CSV PARSING
// ════════════════════════════════════════════════════════════════

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip BOM

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('File must have at least 2 rows (header + data)');

  function parseLine(line) {
    const out = [];
    let inQuote = false, cur = '';
    for (const ch of line) {
      if      (ch === '"')             { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { out.push(cur.trim()); cur = ''; }
      else                             { cur += ch; }
    }
    out.push(cur.trim());
    return out;
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  if (!headers.length || !headers[0]) throw new Error('Could not read header row');

  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj  = {};
    headers.forEach((h, i) => {
      obj[h] = (vals[i] !== undefined ? vals[i] : '').replace(/^"|"$/g, '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

function detectColumns(headers) {
  const lc   = headers.map(h => h.toLowerCase());
  const find = (...patterns) => {
    for (const p of patterns) {
      const i = lc.findIndex(h => h.includes(p));
      if (i >= 0) return headers[i];
    }
    return '';
  };
  return {
    lat:       find('lat'),
    lon:       find('lon', 'lng'),
    count:     find('count', 'cnt', 'weight', 'value', 'samples'),
    operator:  find('operator', 'carrier', 'provider'),
    plmn:      find('plmn', 'mcc', 'mnc'),
    iso:       find('iso', 'country'),
    timestamp: find('timestamp', 'time', 'date', 'datetime', 'ts', 'first_seen'),
    cell_enb:  find('cell_enb', 'enb', 'enodeb'),
    cell_eci:  find('cell_eci', 'eci', 'ecgi', 'cell_id'),
  };
}

// ════════════════════════════════════════════════════════════════
//  COLUMN MAPPER MODAL
// ════════════════════════════════════════════════════════════════

function showColumnMapper(headers, detected, rows, filename) {
  const grid = document.getElementById('mapper-grid');
  grid.innerHTML = '';

  FIELDS.forEach(({ key, label, required }) => {
    const wrap = document.createElement('div');
    wrap.className = 'mapper-field';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    if (required) {
      const star = document.createElement('span');
      star.className   = 'req';
      star.textContent = ' *';
      lbl.appendChild(star);
    }

    const sel = document.createElement('select');
    sel.id = 'map-' + key;
    sel.appendChild(new Option('(none)', ''));
    headers.forEach(h => {
      const opt = new Option(h, h);
      if (h === detected[key]) opt.selected = true;
      sel.appendChild(opt);
    });

    wrap.append(lbl, sel);
    grid.appendChild(wrap);
  });

  // Preview first row
  const preview = document.getElementById('mapper-preview');
  try {
    const sample = JSON.stringify(rows[0] || {});
    preview.textContent = 'Row 1: ' + (sample.length > 260 ? sample.slice(0, 260) + '…' : sample);
  } catch (_) { preview.textContent = ''; }

  document.getElementById('modal-desc').textContent =
    `${filename}  ·  ${rows.length.toLocaleString()} rows  ·  ${headers.length} columns`;

  const errEl = document.getElementById('mapper-error');
  errEl.textContent   = '';
  errEl.style.display = 'none';

  pendingCSV = { rows, filename };
  document.getElementById('modal-overlay').classList.add('show');

  document.getElementById('mapper-load').onclick = () => {
    const colMap = {};
    FIELDS.forEach(({ key }) => {
      const v = document.getElementById('map-' + key).value;
      if (v) colMap[key] = v;
    });
    if (!colMap.lat || !colMap.lon) {
      errEl.textContent   = '⚠ Latitude and Longitude columns are required.';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    document.getElementById('modal-overlay').classList.remove('show');
    loadCSVData(pendingCSV.rows, colMap, pendingCSV.filename);
  };

  document.getElementById('mapper-cancel').onclick = () => {
    document.getElementById('modal-overlay').classList.remove('show');
    setStatus('');
  };
}

// ════════════════════════════════════════════════════════════════
//  DATA LOADING
// ════════════════════════════════════════════════════════════════

function loadCSVData(rows, colMap, filename) {
  const overlay = document.getElementById('loading-overlay');
  const msgEl   = document.getElementById('loading-msg');
  msgEl.textContent = `Processing ${rows.length.toLocaleString()} rows…`;
  overlay.style.display = 'flex';

  // Defer one tick so the overlay renders before heavy work
  setTimeout(() => {
    try {
      _processData(rows, colMap, filename);
    } catch (err) {
      setStatus('⚠ Error: ' + err.message, 'error');
    } finally {
      overlay.style.display = 'none';
    }
  }, 30);
}

function _processData(rows, colMap, filename) {
  const points  = [];
  const opIdx   = {}, ops   = [];
  const plmnIdx = {}, plmns = [];
  const isoIdx  = {}, isos  = [];
  const months  = {};
  let minTs = null, maxTs = null;

  rows.forEach(row => {
    try {
      const lat = parseFloat(row[colMap.lat]);
      const lon = parseFloat(row[colMap.lon]);
      if (isNaN(lat) || isNaN(lon)) return;

      const cnt   = colMap.count     ? (parseInt(row[colMap.count])   || 1) : 1;
      const op    = colMap.operator  ? (row[colMap.operator]  || '')        : '';
      const plmn  = colMap.plmn      ? (row[colMap.plmn]      || '')        : '';
      const iso   = colMap.iso       ? (row[colMap.iso]        || '')        : '';
      const tsRaw = colMap.timestamp ? (row[colMap.timestamp]  || '')        : '';
      const enb   = colMap.cell_enb  ? (row[colMap.cell_enb]   || '')        : '';
      const eci   = colMap.cell_eci  ? (row[colMap.cell_eci]   || '')        : '';

      let ts = null;
      if (tsRaw) {
        const d = new Date(tsRaw);
        if (!isNaN(d.getTime())) {
          ts = d.getTime();
          if (minTs == null || ts < minTs) minTs = ts;
          if (maxTs == null || ts > maxTs) maxTs = ts;
          const ym = d.toISOString().slice(0, 7);
          months[ym] = (months[ym] || 0) + 1;
        }
      }

      for (const [val, lookup, list] of [
        [op, opIdx, ops], [plmn, plmnIdx, plmns], [iso, isoIdx, isos]
      ]) {
        if (!(val in lookup)) { lookup[val] = list.length; list.push(val); }
      }

      points.push([lat, lon, cnt, opIdx[op], plmnIdx[plmn], isoIdx[iso], ts, enb, eci]);
    } catch (_) { /* skip bad row */ }
  });

  if (!points.length) {
    setStatus('⚠ No valid lat/lon rows found in this file.', 'error');
    return;
  }

  const colors    = ops.map((op, i) => OP_COLORS[op] || COLOR_PALETTE[i % COLOR_PALETTE.length]);
  const toDate    = ms => (ms != null ? new Date(ms).toISOString().slice(0, 10) : '');
  const monthsArr = Object.entries(months).sort((a, b) => a[0] < b[0] ? -1 : 1);

  Object.assign(APP, {
    points, operators: ops, plmns, isos, colors,
    minTs, maxTs,
    minDate: toDate(minTs),
    maxDate: toDate(maxTs),
    monthsHist: monthsArr,
    hasTime: minTs != null,
    filtered: [...points],
    loaded: true,
  });

  // Reset all filters for fresh load
  FILTERS.tsFrom = minTs;
  FILTERS.tsTo   = maxTs;

  document.getElementById('data-source-label').textContent = filename;
  showLoadedState();
  buildAllMultiSelects();   // also syncs FILTERS.opIdxs/plmnIdxs/isoIdxs references
  buildLegend();
  bindUIEvents();

  const timeSection = document.getElementById('time-section');
  timeSection.style.display = APP.hasTime ? '' : 'none';
  if (APP.hasTime) {
    document.getElementById('date-from').value = APP.minDate;
    document.getElementById('date-to').value   = APP.maxDate;
  }

  updateStats();
  updateActiveFiltersCount();
  updateTable();
  drawHistogram();
  render();
  fitToData(points);
}

// ════════════════════════════════════════════════════════════════
//  FORENSIC REPORT GENERATOR
// ════════════════════════════════════════════════════════════════

let reportLang = localStorage.getItem('report_lang') || 'en';

const LANG = {
  en: {
    title: 'Cellular Network Anomaly Intelligence Report',
    subtitle: 'Forensic analysis of network signal records revealing potential unauthorized cellular infrastructure',
    badge: 'ACTIONABLE INTELLIGENCE',
    signalRecords: 'Signal Records',
    anomalousRecords: 'Anomalous Records',
    foreignMccs: 'Foreign MCCs',
    uniquePlmns: 'Unique PLMNs',
    execSummary: 'Executive Summary',
    execSummaryDesc: 'Critical findings from forensic analysis of cellular network signals',
    threatLandscape: 'Threat Landscape',
    threatLandscapeDesc: 'Classified anomalies by severity and potential threat vector',
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM',
    mccDistribution: 'Network Identity Distribution',
    mccDistributionDesc: 'Breakdown of Mobile Country Codes detected',
    anomalyEvidence: 'Key Anomaly Evidence',
    anomalyEvidenceDesc: 'Foreign PLMN/Operator mismatches — IMSI-catcher indicators',
    methodology: 'Detection Methodology',
    methodologyDesc: 'Multi-layer forensic analysis pipeline',
    callToAction: 'Threat Detection in Action',
    ctaText: 'This report demonstrates the capability to detect, map, and classify cellular network anomalies using passive signal collection and forensic analysis.',
    plmn: 'PLMN',
    mccCountry: 'MCC Country',
    operator: 'Operator',
    iso: 'ISO',
    records: 'Records',
    severity: 'Severity',
    assessment: 'Assessment',
    mismatchOp: 'Foreign MCC / Local operator mismatch',
    phantomPlmn: 'Phantom/unregistered PLMN',
    egyptianDeep: 'Egyptian signal deep inside territory',
    testInvalid: 'Test/Invalid network code',
    jordanDeep: 'Jordanian PLMN deep inside territory',
    foreignMcc: 'Foreign MCC detected',
    datasetPeriod: 'Dataset Period',
    generated: 'Generated',
    layer1: 'Layer 1 — MCC/PLMN Validation',
    layer1Desc: 'Each signal\'s PLMN is validated against the ITU MCC registry. Non-local MCCs are flagged. PLMNs are cross-referenced against known operator databases.',
    layer2: 'Layer 2 — Operator-PLMN Cross Matching',
    layer2Desc: 'Operator names are mapped to expected country origins. A local operator name paired with a foreign PLMN is a direct IMSI-catcher indicator.',
    layer3: 'Layer 3 — Geographic Feasibility',
    layer3Desc: 'Signal locations are compared against the broadcasting country\'s border. Signals from distant countries cannot be legitimate spillover.',
    layer4: 'Layer 4 — Temporal Burst Analysis',
    layer4Desc: 'Anomalous signals are analyzed for temporal clustering. Multiple foreign PLMNs appearing in the same location within short time windows suggest active interception.',
    realTime: 'Real-Time',
    continuous: 'Continuous Monitoring',
    aiPowered: 'AI-Powered',
    automated: 'Automated Classification',
    actionable: 'Actionable',
    forensic: 'Forensic Evidence',
    footer: 'Cellular Network Anomaly Intelligence Report',
    poweredBy: 'Powered by Advanced Cell Report — Network Signal Forensics Platform',
  },
  he: {
    title: 'דוח מודיעין חריגות רשת סלולרית',
    subtitle: 'ניתוח פורנזי של רשומות אותות רשת החושפות תשתית סלולרית בלתי מורשית אפשרית',
    badge: 'מודיעין בר-פעולה',
    signalRecords: 'רשומות אותות',
    anomalousRecords: 'רשומות חריגות',
    foreignMccs: 'קודי מדינה זרים',
    uniquePlmns: 'PLMNs ייחודיים',
    execSummary: 'תקציר מנהלים',
    execSummaryDesc: 'ממצאים קריטיים מניתוח פורנזי של אותות רשת סלולרית',
    threatLandscape: 'נוף האיומים',
    threatLandscapeDesc: 'חריגות מסווגות לפי חומרה ווקטור איום פוטנציאלי',
    critical: 'קריטי',
    high: 'גבוה',
    medium: 'בינוני',
    mccDistribution: 'התפלגות זהויות רשת',
    mccDistributionDesc: 'פירוט קודי מדינה סלולריים שזוהו',
    anomalyEvidence: 'ראיות חריגות מרכזיות',
    anomalyEvidenceDesc: 'אי-התאמות PLMN/מפעיל זר — אינדיקטורים ל-IMSI-catcher',
    methodology: 'מתודולוגיית זיהוי',
    methodologyDesc: 'צינור ניתוח פורנזי רב-שכבתי',
    callToAction: 'זיהוי איומים בפעולה',
    ctaText: 'דוח זה מדגים את היכולת לזהות, למפות ולסווג חריגות ברשת סלולרית באמצעות איסוף אותות פסיבי וניתוח פורנזי.',
    plmn: 'PLMN',
    mccCountry: 'מדינת MCC',
    operator: 'מפעיל',
    iso: 'ISO',
    records: 'רשומות',
    severity: 'חומרה',
    assessment: 'הערכה',
    mismatchOp: 'אי-התאמה בין MCC זר למפעיל מקומי',
    phantomPlmn: 'PLMN פנטום/לא רשום',
    egyptianDeep: 'אות מצרי עמוק בשטח',
    testInvalid: 'קוד רשת בדיקה/לא תקין',
    jordanDeep: 'PLMN ירדני עמוק בשטח',
    foreignMcc: 'זוהה MCC זר',
    datasetPeriod: 'תקופת נתונים',
    generated: 'נוצר',
    layer1: 'שכבה 1 — אימות MCC/PLMN',
    layer1Desc: 'ה-PLMN של כל אות מאומת מול רישום ה-MCC של ITU. קודי MCC לא מקומיים מסומנים. PLMNs מוצלבים מול מסדי נתוני מפעילים ידועים.',
    layer2: 'שכבה 2 — הצלבת מפעיל-PLMN',
    layer2Desc: 'שמות מפעילים ממופים למדינות מקור צפויות. שם מפעיל מקומי המשויך ל-PLMN זר הוא אינדיקטור ישיר ל-IMSI-catcher.',
    layer3: 'שכבה 3 — היתכנות גיאוגרפית',
    layer3Desc: 'מיקומי אותות מושווים לגבול מדינת השידור. אותות ממדינות רחוקות אינם יכולים להיות גלישה לגיטימית.',
    layer4: 'שכבה 4 — ניתוח התפרצויות זמניות',
    layer4Desc: 'אותות חריגים מנותחים לאשכולות זמניים. PLMNs זרים מרובים המופיעים באותו מיקום בחלונות זמן קצרים מצביעים על פעולת יירוט פעילה.',
    realTime: 'זמן אמת',
    continuous: 'ניטור רציף',
    aiPowered: 'מונע AI',
    automated: 'סיווג אוטומטי',
    actionable: 'בר-פעולה',
    forensic: 'ראיות פורנזיות',
    footer: 'דוח מודיעין חריגות רשת סלולרית',
    poweredBy: 'מופעל על ידי Advanced Cell Report — פלטפורמת פורנזיקת אותות רשת',
  }
};

function generateReport() {
  const L = LANG[reportLang];
  const isHe = reportLang === 'he';
  const dir = isHe ? 'rtl' : 'ltr';

  // Get current filename and filter state
  const filename = document.getElementById('data-source-label')?.textContent || 'Unknown';
  const activeFilters = [];
  if (FILTERS.opIdxs.size > 0) activeFilters.push(`${FILTERS.opIdxs.size} ${isHe ? 'מפעילים' : 'operators'}`);
  if (FILTERS.plmnIdxs.size > 0) activeFilters.push(`${FILTERS.plmnIdxs.size} PLMNs`);
  if (FILTERS.isoIdxs.size > 0) activeFilters.push(`${FILTERS.isoIdxs.size} ${isHe ? 'מדינות' : 'countries'}`);

  // Check if date range is filtered (not full range)
  const dateFromInput = document.getElementById('date-from')?.value;
  const dateToInput = document.getElementById('date-to')?.value;
  if (dateFromInput && dateFromInput !== APP.minDate) activeFilters.push(isHe ? 'תאריך התחלה' : 'start date');
  if (dateToInput && dateToInput !== APP.maxDate) activeFilters.push(isHe ? 'תאריך סיום' : 'end date');

  const filterText = activeFilters.length > 0 ? activeFilters.join(', ') : (isHe ? 'ללא סינון' : 'No filters');

  const data = APP.filtered;

  console.log('Generating report from:', filename, '| Records:', data.length, '| Filters:', filterText);

  // Count MCCs
  const mccCounts = {};
  const plmnDetails = {};

  data.forEach(([lat, lon, cnt, oi, pi, ii, ts]) => {
    const plmn = APP.plmns[pi] || '';
    const operator = APP.operators[oi] || '';
    const iso = APP.isos[ii] || '';

    if (plmn && plmn.length >= 3) {
      const mcc = plmn.replace('-', '').slice(0, 3);
      mccCounts[mcc] = (mccCounts[mcc] || 0) + 1;

      // Track PLMN details for anomaly table
      const key = `${plmn}|${operator}`;
      if (!plmnDetails[key]) {
        plmnDetails[key] = { plmn, operator, iso, mcc, count: 0, lats: [], lons: [] };
      }
      plmnDetails[key].count += cnt;
      plmnDetails[key].lats.push(lat);
      plmnDetails[key].lons.push(lon);
    }
  });

  // Identify suspicious entries
  const suspicious = [];
  Object.values(plmnDetails).forEach(entry => {
    const { plmn, operator, iso, mcc, count, lons } = entry;
    const mccInfo = MCC_TABLE[mcc];
    const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length;

    // Skip legitimate Jordanian spillover (near border, not 416-77)
    if (mcc === '416' && plmn !== '416-77' && avgLon > JORDAN_BORDER_LON) {
      return; // Natural border spillover
    }

    // Check if operator is Israeli but MCC is foreign
    const opKey = operator.toLowerCase().trim();
    const opHint = OPERATOR_COUNTRY_HINTS[opKey];
    const isIsraeliOp = opHint === 'il';

    let severity = 'medium';
    let assessmentKey = 'foreignMcc';

    // Critical hostile nation MCCs
    const criticalMccs = ['432', '417', '418']; // Iran, Syria, Iraq

    if (mcc === '000' || mcc === '255') {
      assessmentKey = 'testInvalid';
    } else if (plmn === '416-77') {
      severity = 'critical';
      assessmentKey = 'phantomPlmn';
    } else if (criticalMccs.includes(mcc)) {
      severity = 'critical';
      assessmentKey = 'foreignMcc';
    } else if (mcc === '602' && isIsraeliOp) {
      severity = 'critical';
      assessmentKey = 'egyptianDeep';
    } else if (isIsraeliOp && mccInfo && mccInfo.country !== 'il') {
      severity = 'critical';
      assessmentKey = 'mismatchOp';
    } else if (mcc === '416' && avgLon < JORDAN_BORDER_LON) {
      severity = 'high';
      assessmentKey = 'jordanDeep';
    } else if (mccInfo && mccInfo.country !== 'il' && !['000', '255'].includes(mcc)) {
      severity = 'high';
    }

    suspicious.push({
      plmn,
      operator: operator || '—',
      iso: iso || '—',
      mcc,
      mccCountry: mccInfo ? mccInfo.name : (mcc === '000' ? 'Test' : mcc === '255' ? 'Invalid' : 'Unknown'),
      count,
      severity,
      assessment: L[assessmentKey]
    });
  });

  // Sort by severity then count
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  suspicious.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.count - a.count;
  });

  // Get unique foreign MCCs (excluding test/invalid)
  const foreignMccs = Object.keys(mccCounts).filter(mcc => {
    const info = MCC_TABLE[mcc];
    return info && info.country !== 'il' && !['000', '255'].includes(mcc);
  });

  // Build MCC distribution bars
  const totalRecords = data.length;
  const mccEntries = Object.entries(mccCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const mccBarsHtml = mccEntries.map(([mcc, count]) => {
    const info = MCC_TABLE[mcc];
    const name = info ? info.name : (mcc === '000' ? 'Test/Unknown' : mcc === '255' ? 'Invalid' : 'Unknown');
    const pct = ((count / totalRecords) * 100).toFixed(1);
    const width = Math.max(2, (count / totalRecords) * 100);
    const color = info && info.country !== 'il' ? 'jordan' : 'unknown';
    const small = width < 15 ? ' small' : '';
    return `<div class="bar-row">
      <div class="bar-label">${name} — ${mcc}</div>
      <div class="bar-track"><div class="bar-fill ${color}${small}" style="width:${width}%"><span>${count.toLocaleString()} (${pct}%)</span></div></div>
    </div>`;
  }).join('');

  // Build anomaly table rows - show ALL critical first, then high/medium up to limit
  const criticalEntries = suspicious.filter(s => s.severity === 'critical');
  const otherEntries = suspicious.filter(s => s.severity !== 'critical').slice(0, Math.max(0, 25 - criticalEntries.length));
  const tableEntries = [...criticalEntries, ...otherEntries];

  const anomalyRowsHtml = tableEntries.map(s => {
    const severityClass = s.severity === 'critical' ? 'tag-critical' : s.severity === 'high' ? 'tag-high' : 'tag-medium';
    const severityLabel = s.severity === 'critical' ? L.critical : s.severity === 'high' ? L.high : L.medium;
    return `<tr>
      <td class="mono">${s.plmn}</td>
      <td>${s.mccCountry}</td>
      <td>${s.operator}</td>
      <td>${s.iso}</td>
      <td class="${s.severity === 'critical' ? 'red' : s.severity === 'high' ? 'orange' : ''}">${s.count.toLocaleString()}</td>
      <td><span class="tag ${severityClass}">${severityLabel}</span></td>
      <td>${s.assessment}</td>
    </tr>`;
  }).join('');

  // Build threat cards - show more critical threats
  const criticalThreats = suspicious.filter(s => s.severity === 'critical').slice(0, 5);
  const highThreats = suspicious.filter(s => s.severity === 'high').slice(0, 3);

  const threatCardsHtml = [
    ...criticalThreats.map(t => `<div class="threat-card">
      <h3><span class="tag tag-critical">${L.critical}</span> &nbsp; ${t.plmn} — ${t.mccCountry}</h3>
      <p><strong>${t.count.toLocaleString()} ${L.records}</strong> ${isHe ? 'עם' : 'with'} ${t.operator !== '—' ? `${L.operator}: ${t.operator}` : ''}<br><br><strong>${L.assessment}:</strong> ${t.assessment}</p>
    </div>`),
    ...highThreats.map(t => `<div class="threat-card medium">
      <h3><span class="tag tag-high">${L.high}</span> &nbsp; ${t.plmn} — ${t.mccCountry}</h3>
      <p><strong>${t.count.toLocaleString()} ${L.records}</strong> ${t.operator !== '—' ? `${L.operator}: ${t.operator}` : ''}<br><br><strong>${L.assessment}:</strong> ${t.assessment}</p>
    </div>`)
  ].join('');

  // Date range - ALWAYS calculate from the actual filtered data
  let dateFrom = 'N/A';
  let dateTo = 'N/A';

  if (data.length > 0) {
    const timestamps = data.map(p => p[6]).filter(ts => ts != null);
    if (timestamps.length > 0) {
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      dateFrom = new Date(minTs).toISOString().slice(0, 10);
      dateTo = new Date(maxTs).toISOString().slice(0, 10);
    }
  }

  const generatedDate = new Date().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const generatedTime = new Date().toLocaleTimeString(isHe ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // Build HTML
  const html = `<!DOCTYPE html>
<html lang="${isHe ? 'he' : 'en'}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
  :root {
    --navy: #0a1628; --dark: #0f1d32; --card: #162038; --border: #1e2d4a;
    --accent: #3b82f6; --accent2: #8b5cf6; --red: #ef4444; --orange: #f59e0b;
    --green: #10b981; --cyan: #06b6d4; --text: #e2e8f0; --sub: #94a3b8; --muted: #64748b;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: var(--navy); color: var(--text); line-height: 1.6; direction: ${dir}; }
  .cover { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: linear-gradient(160deg, #0a1628 0%, #1a1040 40%, #0f1d32 100%); position: relative; overflow: hidden; padding: 40px 20px; }
  .cover::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 30% 40%, rgba(59,130,246,.08) 0%, transparent 60%), radial-gradient(circle at 70% 60%, rgba(139,92,246,.06) 0%, transparent 50%); }
  .cover-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3); border-radius: 20px; padding: 6px 18px; font-size: 12px; color: var(--red); font-weight: 600; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 24px; position: relative; }
  .cover-badge::before { content: ''; width: 8px; height: 8px; background: var(--red); border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
  .cover h1 { font-size: clamp(32px, 5vw, 56px); font-weight: 800; background: linear-gradient(135deg, #fff 0%, #94a3b8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.15; margin-bottom: 16px; position: relative; }
  .cover h2 { font-size: clamp(16px, 2.5vw, 22px); font-weight: 400; color: var(--sub); max-width: 600px; position: relative; }
  .cover-stats { display: flex; gap: 32px; margin-top: 48px; position: relative; flex-wrap: wrap; justify-content: center; }
  .cover-stat { text-align: center; }
  .cover-stat .num { font-size: 36px; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .cover-stat .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .cover-meta { margin-top: 48px; color: var(--muted); font-size: 12px; position: relative; }
  .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
  section { padding: 64px 0; }
  section + section { border-top: 1px solid var(--border); }
  h2.section-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
  h2.section-title .icon { font-size: 24px; }
  .section-sub { color: var(--sub); font-size: 14px; margin-bottom: 32px; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
  .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 8px; }
  .card-value { font-size: 32px; font-weight: 800; }
  .card-desc { font-size: 13px; color: var(--sub); margin-top: 6px; }
  .threat-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; border-${isHe ? 'right' : 'left'}: 4px solid var(--red); }
  .threat-card.medium { border-${isHe ? 'right' : 'left'}-color: var(--orange); }
  .threat-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
  .threat-card p { font-size: 13px; color: var(--sub); line-height: 1.7; }
  .tag { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  .tag-critical { background: rgba(239,68,68,.15); color: var(--red); }
  .tag-high { background: rgba(245,158,11,.15); color: var(--orange); }
  .tag-medium { background: rgba(6,182,212,.15); color: var(--cyan); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
  th { text-align: ${isHe ? 'right' : 'left'}; padding: 10px 14px; background: var(--dark); color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .8px; font-weight: 600; border-bottom: 1px solid var(--border); }
  td { padding: 10px 14px; border-bottom: 1px solid rgba(30,45,74,.5); color: var(--text); }
  tr:hover td { background: rgba(59,130,246,.04); }
  .mono { font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; }
  .red { color: var(--red); font-weight: 600; }
  .orange { color: var(--orange); font-weight: 600; }
  .bar-chart { margin: 20px 0; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
  .bar-label { width: 140px; font-size: 12px; color: var(--sub); text-align: ${isHe ? 'left' : 'right'}; flex-shrink: 0; }
  .bar-track { flex: 1; height: 24px; background: var(--dark); border-radius: 4px; overflow: hidden; position: relative; }
  .bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; font-size: 11px; font-weight: 600; color: #fff; min-width: 10px; white-space: nowrap; position: relative; }
  .bar-fill span { position: absolute; ${isHe ? 'right' : 'left'}: 8px; }
  .bar-fill.small span { ${isHe ? 'right' : 'left'}: auto; ${isHe ? 'left' : 'right'}: -8px; transform: translateX(${isHe ? '-100%' : '100%'}); color: var(--sub); }
  .bar-fill.jordan { background: linear-gradient(90deg, #ef4444, #f97316); }
  .bar-fill.unknown { background: linear-gradient(90deg, #64748b, #94a3b8); }
  .timeline { position: relative; padding-${isHe ? 'right' : 'left'}: 32px; margin: 24px 0; }
  .timeline::before { content: ''; position: absolute; ${isHe ? 'right' : 'left'}: 11px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .timeline-item { position: relative; margin-bottom: 24px; }
  .timeline-item::before { content: ''; position: absolute; ${isHe ? 'right' : 'left'}: -27px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--navy); }
  .timeline-item h4 { font-size: 14px; font-weight: 600; }
  .timeline-item p { font-size: 12px; color: var(--sub); }
  .footer { text-align: center; padding: 48px 24px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
  .pdf-btn { position: fixed; top: 20px; ${isHe ? 'left' : 'right'}: 20px; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(59,130,246,.3); z-index: 1000; transition: transform .2s, box-shadow .2s; }
  .pdf-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(59,130,246,.4); }
  .pdf-btn svg { width: 18px; height: 18px; }
  @media print { body { background: #fff; color: #1a1a2e; } .cover { min-height: auto; padding: 40px; background: #f8fafc; } .card, .threat-card { border: 1px solid #e2e8f0; background: #fff; } th { background: #f1f5f9; } td { border-color: #e2e8f0; } .pdf-btn { display: none !important; } }
  @page { size: A4; margin: 1cm; }
</style>
</head>
<body>

<button class="pdf-btn" onclick="window.print()">
  <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
  ${isHe ? 'שמור כ-PDF' : 'Save as PDF'}
</button>

<div class="cover">
  <div class="cover-badge">${L.badge}</div>
  <h1>${L.title}</h1>
  <h2>${L.subtitle}</h2>
  <div class="cover-stats">
    <div class="cover-stat">
      <div class="num">${totalRecords.toLocaleString()}</div>
      <div class="label">${L.signalRecords}</div>
    </div>
    <div class="cover-stat">
      <div class="num" style="-webkit-text-fill-color: var(--red);">${suspicious.length}</div>
      <div class="label">${L.anomalousRecords}</div>
    </div>
    <div class="cover-stat">
      <div class="num">${foreignMccs.length}</div>
      <div class="label">${L.foreignMccs}</div>
    </div>
    <div class="cover-stat">
      <div class="num">${APP.plmns.length}</div>
      <div class="label">${L.uniquePlmns}</div>
    </div>
  </div>
  <div class="cover-meta">
    <strong>${isHe ? 'קובץ' : 'Source'}:</strong> ${filename}<br>
    <strong>${isHe ? 'סינון' : 'Filters'}:</strong> ${filterText}<br>
    ${L.datasetPeriod}: ${dateFrom} — ${dateTo} &nbsp;|&nbsp; ${L.generated}: ${generatedDate} ${generatedTime}
  </div>
</div>

<section>
<div class="container">
  <h2 class="section-title"><span class="icon">&#x1F6A8;</span> ${L.execSummary}</h2>
  <p class="section-sub">${L.execSummaryDesc}</p>
  <div class="card-grid">
    <div class="card">
      <div class="card-label">${L.signalRecords}</div>
      <div class="card-value">${totalRecords.toLocaleString()}</div>
      <div class="card-desc">${APP.operators.length} ${isHe ? 'מפעילים ייחודיים' : 'unique operators'}, ${APP.plmns.length} PLMNs</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:var(--red)">${suspicious.filter(s => s.severity === 'critical').length}</div>
      <div class="card-desc"><strong>${isHe ? 'ממצאים קריטיים' : 'Critical findings'}</strong> ${isHe ? 'הדורשים תשומת לב מיידית' : 'requiring immediate attention'}</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:var(--orange)">${suspicious.filter(s => s.severity === 'high').length}</div>
      <div class="card-desc"><strong>${isHe ? 'ממצאים בחומרה גבוהה' : 'High severity findings'}</strong> ${isHe ? 'לחקירה נוספת' : 'for further investigation'}</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:var(--cyan)">${foreignMccs.length}</div>
      <div class="card-desc"><strong>${isHe ? 'קודי מדינה זרים' : 'Foreign country codes'}</strong> ${isHe ? 'זוהו בנתונים' : 'detected in the data'}</div>
    </div>
  </div>
</div>
</section>

${threatCardsHtml ? `<section>
<div class="container">
  <h2 class="section-title"><span class="icon">&#x26A0;</span> ${L.threatLandscape}</h2>
  <p class="section-sub">${L.threatLandscapeDesc}</p>
  ${threatCardsHtml}
</div>
</section>` : ''}

<section>
<div class="container">
  <h2 class="section-title"><span class="icon">&#x1F4CA;</span> ${L.mccDistribution}</h2>
  <p class="section-sub">${L.mccDistributionDesc}</p>
  <div class="bar-chart">
    ${mccBarsHtml}
  </div>
</div>
</section>

${anomalyRowsHtml ? `<section>
<div class="container">
  <h2 class="section-title"><span class="icon">&#x1F50D;</span> ${L.anomalyEvidence}</h2>
  <p class="section-sub">${L.anomalyEvidenceDesc}</p>
  <div style="overflow-x:auto;">
  <table>
    <thead>
      <tr>
        <th>${L.plmn}</th>
        <th>${L.mccCountry}</th>
        <th>${L.operator}</th>
        <th>${L.iso}</th>
        <th>${L.records}</th>
        <th>${L.severity}</th>
        <th>${L.assessment}</th>
      </tr>
    </thead>
    <tbody>
      ${anomalyRowsHtml}
    </tbody>
  </table>
  </div>
</div>
</section>` : ''}

<section>
<div class="container">
  <h2 class="section-title"><span class="icon">&#x2699;</span> ${L.methodology}</h2>
  <p class="section-sub">${L.methodologyDesc}</p>
  <div class="timeline">
    <div class="timeline-item">
      <h4>${L.layer1}</h4>
      <p>${L.layer1Desc}</p>
    </div>
    <div class="timeline-item">
      <h4>${L.layer2}</h4>
      <p>${L.layer2Desc}</p>
    </div>
    <div class="timeline-item">
      <h4>${L.layer3}</h4>
      <p>${L.layer3Desc}</p>
    </div>
    <div class="timeline-item">
      <h4>${L.layer4}</h4>
      <p>${L.layer4Desc}</p>
    </div>
  </div>
</div>
</section>

<section style="background: linear-gradient(160deg, #1a1040 0%, #0f1d32 100%);">
<div class="container" style="text-align:center; padding: 48px 24px;">
  <h2 style="font-size:28px; font-weight:800; margin-bottom:16px;">${L.callToAction}</h2>
  <p style="color:var(--sub); max-width:600px; margin:0 auto 32px; font-size:15px; line-height:1.8;">${L.ctaText}</p>
  <div style="display:inline-flex; gap:16px; flex-wrap:wrap; justify-content:center;">
    <div style="background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px 24px; text-align:center;">
      <div style="font-size:24px; font-weight:800; color:var(--accent);">${L.realTime}</div>
      <div style="font-size:11px; color:var(--muted);">${L.continuous}</div>
    </div>
    <div style="background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px 24px; text-align:center;">
      <div style="font-size:24px; font-weight:800; color:var(--accent2);">${L.aiPowered}</div>
      <div style="font-size:11px; color:var(--muted);">${L.automated}</div>
    </div>
    <div style="background:var(--card); border:1px solid var(--border); border-radius:10px; padding:16px 24px; text-align:center;">
      <div style="font-size:24px; font-weight:800; color:var(--green);">${L.actionable}</div>
      <div style="font-size:11px; color:var(--muted);">${L.forensic}</div>
    </div>
  </div>
</div>
</section>

<div class="footer">
  <p>${L.footer} &nbsp;|&nbsp; ${L.generated}: ${generatedDate}</p>
  <p style="margin-top:8px;">${L.poweredBy}</p>
</div>

</body>
</html>`;

  // Open in new tab
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  } else {
    alert(isHe ? 'אנא אפשר חלונות קופצים כדי ליצור את הדוח' : 'Please allow popups to generate the report');
  }
}

function initReportControls() {
  // Language toggle
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reportLang = btn.dataset.lang;
      localStorage.setItem('report_lang', reportLang);
    });
  });

  // Restore saved language
  const savedLang = localStorage.getItem('report_lang') || 'en';
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === savedLang);
  });
  reportLang = savedLang;

  // Generate Report button
  document.getElementById('btn-generate-report')?.addEventListener('click', () => {
    if (!APP.loaded || !APP.filtered.length) {
      alert(reportLang === 'he' ? 'אנא טען נתונים תחילה' : 'Please load data first');
      return;
    }
    generateReport();
  });
}

// Initialize report controls on DOM ready
document.addEventListener('DOMContentLoaded', initReportControls);
