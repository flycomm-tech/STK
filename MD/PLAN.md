# Plan: Forensic Report Generation from Platform

## Overview
Replace the Groq AI chat feature with a **client-side forensic report generator** that analyzes the loaded data and opens a styled HTML report in a new tab. Support Hebrew/English language toggle. Use Material Icons (via MUI CDN).

## Changes Summary

### 1. Remove Groq/AI Chat (index.html + app.js + style.css)

**index.html:**
- Remove `#ai-report-wrap` block (lines 124-134): Groq API Key label, input, save button, key status
- Remove `#report-panel` block (lines 206-231): entire slide-out panel with chat UI
- Remove `marked.js` CDN script tag
- Add Material Icons CDN: `<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">`
- Replace AI Report button with **"Generate Report"** button + language toggle (HE/EN) in `#sb-footer`

**app.js:**
- Delete: `AI_SYSTEM_PROMPT`, `GROQ_MODEL`, `askAI()`, `buildDataContext()`, `requestAIReport()` (old)
- Delete: `openReportPanel()`, `closeReportPanel()`, `setReportLoading()`, `setReportError()`, `appendChat()`
- Delete: `renderMarkdown()`, `makeAnomalyRowsClickable()`
- Delete: All Groq API key localStorage code (lines 1047-1084)
- Delete: All report panel event handlers (lines 1086-1132)
- Keep: `analyzeAnomalies()`, `MCC_TABLE`, `OPERATOR_COUNTRY_HINTS` — these power the report

**style.css:**
- Delete: `#ai-report-wrap`, `#api-key-row`, `#api-key-input`, `#btn-save-key`, `#key-status` (lines 375-410)
- Delete: `#report-panel`, `#report-header`, `#report-close`, `#report-chat`, `#report-loading`, `#report-error`, `#report-input-bar`, `#report-question`, `#btn-ask-ai`, `.chat-q`, `.chat-a`, `#report-body` and all sub-styles (lines 413-548)
- Add: `#btn-generate-report` and `#lang-toggle` button styles

### 2. New "Generate Report" Button + Language Toggle (index.html)

Replace the old `#ai-report-wrap` in `#sb-footer` with:
```html
<div id="report-controls">
  <div id="lang-toggle">
    <button class="lang-btn active" data-lang="en">EN</button>
    <button class="lang-btn" data-lang="he">עב</button>
  </div>
  <button id="btn-generate-report" style="display:none">
    <span class="material-icons" style="font-size:16px">assessment</span>
    Generate Report
  </button>
</div>
```

### 3. New `generateReport()` Function (app.js)

A new function that:
1. Calls `analyzeAnomalies()` to get anomaly data
2. Filters out non-suspicious Jordanian PLMNs (those near the Jordan border)
3. Does NOT mention "0 Israeli PLMNs" — irrelevant since user doesn't upload them
4. Builds a complete HTML string (same design as report.html but with dynamic data)
5. Opens it in a new browser tab via `window.open()` + `document.write()`

**Jordan border logic:**
- Define Jordan border approximate longitude line (~35.4° and east)
- Jordanian PLMNs (416-xx) with longitude > ~35.3 are near the border = NOT suspicious
- Jordanian PLMNs with longitude < ~35.3 (deep inside Israel) = SUSPICIOUS
- Special case: 416-77 (phantom/unregistered) is always suspicious regardless of location

### 4. Bilingual Report Content

The report template will have all strings in both languages:
```javascript
const LANG = {
  en: { title: 'Cellular Network Anomaly Intelligence Report', ... },
  he: { title: 'דוח מודיעין אנומליות רשת סלולרית', ... }
};
```

Selected language stored in `localStorage.getItem('report_lang') || 'en'`.

### 5. Report Content (Dynamic, from data)

The generated report.html will include these sections (same design as the static report.html):
- **Cover page** with dynamic stats from data
- **Executive Summary** — cards with real numbers (no "0 Israeli PLMNs")
- **Threat Landscape** — only genuinely suspicious findings:
  - Egyptian/Greek/Spanish/Saudi/Iranian PLMNs (always suspicious)
  - Jordanian PLMNs DEEP inside Israel (lon < 35.3)
  - Phantom PLMN 416-77 (unregistered)
  - MCC-000 / 255-255 (lower priority)
- **MCC Distribution** — bar chart from actual data
- **Key Anomaly Evidence** — table from analyzeAnomalies() results
- **Operational Relevance** — 6 agency cards (static content, bilingual)
- **Detection Methodology** — timeline (static content, bilingual)
- **Call to Action** — closing section

### 6. Files Modified
| File | Action |
|------|--------|
| index.html | Remove AI chat UI, add report button + lang toggle + Material Icons CDN |
| app.js | Remove Groq/AI code, add `generateReport()` with border logic + bilingual |
| style.css | Remove AI panel styles, add report button + lang toggle styles |
| report.html | Keep as-is (static reference), the dynamic version is generated in JS |

### 7. Material Icons Usage
- Generate Report button: `assessment` icon
- Language toggle: text buttons (EN / עב)
- Could also use in the generated report for section headers
