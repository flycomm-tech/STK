#!/usr/bin/env python3
"""
Local HTTP server for Advanced Cell Report.
Also proxies Claude AI API calls to avoid browser CORS restrictions.

Usage:
    python3 server.py
Then open:  http://localhost:8080
"""
import http.server
import socketserver
import os
import sys
import json
import ssl
import urllib.request
import urllib.error

PORT = 8000
DIR  = os.path.dirname(os.path.abspath(__file__))

# Coverage thresholds (RSRP dBm)
_RSRP_THRESHOLDS = [
    ("excellent", -80),
    ("good",      -90),
    ("fair",      -100),
    ("poor",      -110),
    ("bad",       float("-inf")),
]

_COVERAGE_COLORS = {
    "excellent": "#22c55e",
    "good":      "#84cc16",
    "fair":      "#eab308",
    "poor":      "#f97316",
    "bad":       "#dc2626",
}

_COVERAGE_SCORES = {
    "excellent": 95,
    "good":      75,
    "fair":      50,
    "poor":      25,
    "bad":       5,
}


def _classify_coverage(cells):
    """
    Classify cells by coverage level.
    Uses scikit-learn RandomForestClassifier when available;
    falls back to an RSRP/sample-density heuristic.
    """
    import math

    # Extract numeric features
    def safe_float(v, default=None):
        try:
            f = float(v)
            return None if math.isnan(f) else f
        except (TypeError, ValueError):
            return default

    features = []
    for c in cells:
        rsrp    = safe_float(c.get("avg_rsrp") or c.get("signal_rsrp"))
        samples = safe_float(c.get("samples") or c.get("counted") or c.get("count"), 1)
        features.append({"rsrp": rsrp, "samples": samples or 1})

    has_rsrp = any(f["rsrp"] is not None for f in features)

    # --- Try scikit-learn Random Forest ---
    try:
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier

        # Build training data from RSRP thresholds (synthetic labels)
        train_X, train_y = [], []
        for rsrp_val, label in [
            (-75, "excellent"), (-85, "good"), (-95, "fair"),
            (-105, "poor"), (-115, "bad"),
            (-72, "excellent"), (-88, "good"), (-98, "fair"),
            (-108, "poor"), (-120, "bad"),
        ]:
            for s in [5, 50, 500]:
                train_X.append([rsrp_val, math.log1p(s)])
                train_y.append(label)

        clf = RandomForestClassifier(n_estimators=50, random_state=42)
        clf.fit(train_X, train_y)

        results = []
        for i, (cell, feat) in enumerate(zip(cells, features)):
            if feat["rsrp"] is not None:
                row = [feat["rsrp"], math.log1p(feat["samples"])]
            else:
                # No RSRP — map sample density to a synthetic RSRP
                synthetic = max(-120, min(-75, -120 + math.log1p(feat["samples"]) * 6))
                row = [synthetic, math.log1p(feat["samples"])]

            level = clf.predict([row])[0]
            results.append(_build_result(cell, level))

        return results, "Random Forest", has_rsrp

    except ImportError:
        pass

    # --- Heuristic fallback ---
    results = []
    for cell, feat in zip(cells, features):
        if feat["rsrp"] is not None:
            rsrp = feat["rsrp"]
            level = "bad"
            for lbl, threshold in _RSRP_THRESHOLDS:
                if rsrp >= threshold:
                    level = lbl
                    break
        else:
            # Estimate from sample count
            s = feat["samples"]
            if s >= 500:   level = "excellent"
            elif s >= 100: level = "good"
            elif s >= 20:  level = "fair"
            elif s >= 5:   level = "poor"
            else:          level = "bad"

        results.append(_build_result(cell, level))

    return results, "Heuristic (install scikit-learn for RF)", has_rsrp


def _build_result(cell, level):
    return {
        "lat":            cell.get("latitude")  or cell.get("lat"),
        "lon":            cell.get("longitude") or cell.get("lon"),
        "enb":            cell.get("cell_enb"),
        "eci":            cell.get("cell_eci"),
        "mcc":            cell.get("network_mcc"),
        "mnc":            cell.get("network_mnc"),
        "samples":        cell.get("samples") or cell.get("counted") or 1,
        "avg_rsrp":       cell.get("avg_rsrp") or cell.get("signal_rsrp"),
        "coverage_level": level,
        "coverage_color": _COVERAGE_COLORS.get(level, "#94a3b8"),
        "coverage_score": _COVERAGE_SCORES.get(level, 50),
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8000")
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8000")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/claude":
            self._proxy_claude()
        elif self.path == "/ml/coverage":
            self._ml_coverage()
        else:
            self.send_error(404)

    def _proxy_claude(self):
        """Proxy POST /api/claude → https://api.anthropic.com/v1/messages"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            data   = json.loads(body)

            api_key   = data.get("api_key", "")
            model     = data.get("model", "claude-haiku-4-5-20251001")
            messages  = data.get("messages", [])
            max_tokens = data.get("max_tokens", 1200)

            payload = json.dumps({
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages
            }).encode()

            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=payload,
                headers={
                    "Content-Type":  "application/json",
                    "x-api-key":     api_key,
                    "anthropic-version": "2023-06-01",
                },
                method="POST"
            )

            # macOS needs an explicit SSL context (system certs)
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                result = resp.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(result)

        except urllib.error.HTTPError as e:
            err_body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": {"message": str(e)}}).encode())

    def _ml_coverage(self):
        """POST /ml/coverage — Random Forest coverage classification."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            data   = json.loads(body)
            cells  = data.get("cells", [])

            if not cells:
                raise ValueError("No cell data provided")

            results, model_name, has_rsrp = _classify_coverage(cells)

            coverage_stats = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "bad": 0}
            for r in results:
                lvl = r.get("coverage_level", "fair")
                if lvl in coverage_stats:
                    coverage_stats[lvl] += 1

            payload = json.dumps({
                "total_cells": len(results),
                "model": model_name,
                "has_rsrp": has_rsrp,
                "coverage_stats": coverage_stats,
                "results": results
            }).encode()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(payload)

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in ("200", "204", "304"):
            super().log_message(fmt, *args)


def main():
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            httpd.allow_reuse_address = True
            print(f"\n  Advanced Cell Report is running")
            print(f"  Open: http://localhost:{PORT}")
            print(f"  Claude AI proxy: http://localhost:{PORT}/api/claude")
            print(f"\n  Press Ctrl+C to stop\n")
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n  Port {PORT} is already in use.")
            print(f"  Kill it: lsof -ti:{PORT} | xargs kill\n")
        else:
            raise
    except KeyboardInterrupt:
        print("\n\nServer stopped.\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
