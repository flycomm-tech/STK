#!/usr/bin/env python3
"""
ClickHouse Proxy Server with ML Coverage Analysis
Bypasses CORS restrictions for browser-based ClickHouse connections
Includes Random Forest / Isolation Forest for cell coverage anomaly detection
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import urllib.request
import urllib.error
import ssl
import base64
import os
import math

# Try to import ML libraries (optional)
try:
    import numpy as np
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("[Warning] scikit-learn not installed. ML features disabled.")
    print("         Install with: pip install scikit-learn numpy")

# ClickHouse connection settings (can be overridden by environment variables)
CH_HOST = os.environ.get('CH_HOST', 'vusqo3wrfh.us-east-2.aws.clickhouse.cloud')
CH_PORT = os.environ.get('CH_PORT', '443')
CH_USER = os.environ.get('CH_USER', '')
CH_PASS = os.environ.get('CH_PASS', '')

class ProxyHandler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        """Handle POST requests - proxy to ClickHouse or serve files"""
        if self.path == '/query':
            self.handle_query()
        elif self.path == '/ml/coverage':
            self.handle_coverage_analysis()
        else:
            self.send_error(404, 'Not Found')

    def do_GET(self):
        """Serve static files"""
        # Serve index.html for root
        if self.path == '/':
            self.path = '/index.html'
        return SimpleHTTPRequestHandler.do_GET(self)

    def send_cors_headers(self):
        """Add CORS headers to response"""
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def handle_query(self):
        """Proxy query to ClickHouse"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            query = data.get('query', '')
            host = data.get('host', CH_HOST)
            database = data.get('database', 'default')
            user = data.get('user', CH_USER)
            password = data.get('password', CH_PASS)

            if not query:
                self.send_json_error('No query provided')
                return

            if not user or not password:
                self.send_json_error('Missing credentials')
                return

            # Build ClickHouse URL with performance settings
            url = f'https://{host}/?database={database}&default_format=JSON'

            # Create request
            req = urllib.request.Request(url, data=query.encode('utf-8'), method='POST')

            # Add auth header
            auth_string = base64.b64encode(f'{user}:{password}'.encode()).decode()
            req.add_header('Authorization', f'Basic {auth_string}')
            req.add_header('Content-Type', 'text/plain')
            req.add_header('Accept-Encoding', 'gzip, deflate')

            # Create SSL context (allow self-signed certs if needed)
            ctx = ssl.create_default_context()

            # Execute request
            with urllib.request.urlopen(req, context=ctx, timeout=60) as response:
                result = response.read().decode('utf-8')

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(result.encode('utf-8'))

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else str(e)
            self.send_json_error(f'ClickHouse error: {error_body}', e.code)
        except urllib.error.URLError as e:
            self.send_json_error(f'Connection error: {str(e.reason)}')
        except json.JSONDecodeError as e:
            self.send_json_error(f'Invalid JSON: {str(e)}')
        except Exception as e:
            self.send_json_error(f'Server error: {str(e)}')

    def handle_coverage_analysis(self):
        """Analyze cell coverage using RSRP-based Random Forest classification"""
        if not ML_AVAILABLE:
            self.send_json_error('ML libraries not installed. Run: pip install scikit-learn numpy')
            return

        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            cells = data.get('cells', [])
            if len(cells) < 5:
                self.send_json_error('Need at least 5 data points for analysis')
                return

            # Extract features for ML - now including RSRP
            features = []
            cell_info = []
            has_rsrp = False

            for cell in cells:
                lat = float(cell.get('latitude', 0))
                lon = float(cell.get('longitude', 0))
                samples = int(cell.get('samples', cell.get('counted', 1)))
                enb = cell.get('cell_enb', '')
                eci = cell.get('cell_eci', '')
                mcc = cell.get('network_mcc', '')
                mnc = cell.get('network_mnc', '')

                # RSRP values (can be avg, min, max)
                avg_rsrp = cell.get('avg_rsrp')
                min_rsrp = cell.get('min_rsrp')
                max_rsrp = cell.get('max_rsrp')

                # Use avg_rsrp if available, otherwise try to get any RSRP value
                rsrp = None
                if avg_rsrp is not None and avg_rsrp != '':
                    try:
                        rsrp = float(avg_rsrp)
                        has_rsrp = True
                    except (ValueError, TypeError):
                        pass

                enb_num = int(enb) if enb and str(enb).isdigit() else 0
                eci_num = int(eci) if eci and str(eci).isdigit() else 0

                # Feature engineering with RSRP
                feature_row = [
                    lat,
                    lon,
                    math.log1p(samples),
                    enb_num % 1000,
                    eci_num % 256,
                ]

                # Add RSRP as feature if available
                if rsrp is not None:
                    feature_row.append(rsrp)
                else:
                    feature_row.append(-100)  # Default RSRP if not available

                features.append(feature_row)

                cell_info.append({
                    'lat': lat,
                    'lon': lon,
                    'enb': enb,
                    'eci': eci,
                    'samples': samples,
                    'mcc': mcc,
                    'mnc': mnc,
                    'avg_rsrp': rsrp,
                    'min_rsrp': float(min_rsrp) if min_rsrp else None,
                    'max_rsrp': float(max_rsrp) if max_rsrp else None,
                })

            # Convert to numpy array
            X = np.array(features)

            # Normalize features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)

            # RSRP-based coverage classification
            # Excellent: > -80 dBm, Good: -80 to -90, Fair: -90 to -100, Poor: -100 to -110, Bad: < -110
            def classify_rsrp(rsrp):
                if rsrp is None:
                    return 2  # Fair (unknown)
                if rsrp > -80:
                    return 4  # Excellent
                elif rsrp > -90:
                    return 3  # Good
                elif rsrp > -100:
                    return 2  # Fair
                elif rsrp > -110:
                    return 1  # Poor
                else:
                    return 0  # Bad

            # Create labels based on RSRP if available
            if has_rsrp:
                y_labels = np.array([classify_rsrp(c['avg_rsrp']) for c in cell_info])
            else:
                # Fallback to sample-based classification
                median_samples = np.median([c['samples'] for c in cell_info])
                y_labels = np.array([3 if c['samples'] >= median_samples else 1 for c in cell_info])

            # Train Random Forest for coverage prediction
            rf = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )

            # Need at least 2 classes for RF
            unique_labels = np.unique(y_labels)
            if len(unique_labels) < 2:
                # Add dummy variation
                y_labels[0] = (y_labels[0] + 1) % 5

            rf.fit(X_scaled, y_labels)

            # Get predictions
            predictions = rf.predict(X_scaled)
            proba = rf.predict_proba(X_scaled)
            confidence = np.max(proba, axis=1)

            # Coverage level mapping
            coverage_levels = {
                0: {'level': 'bad', 'color': '#dc2626', 'label': 'Bad (< -110 dBm)'},
                1: {'level': 'poor', 'color': '#f97316', 'label': 'Poor (-110 to -100 dBm)'},
                2: {'level': 'fair', 'color': '#eab308', 'label': 'Fair (-100 to -90 dBm)'},
                3: {'level': 'good', 'color': '#84cc16', 'label': 'Good (-90 to -80 dBm)'},
                4: {'level': 'excellent', 'color': '#22c55e', 'label': 'Excellent (> -80 dBm)'},
            }

            # Build results
            results = []
            coverage_stats = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}

            for i, cell in enumerate(cell_info):
                pred_class = int(predictions[i])
                coverage_info = coverage_levels.get(pred_class, coverage_levels[2])
                coverage_stats[pred_class] += 1

                # Calculate coverage score (0-100, higher = better coverage)
                rsrp = cell.get('avg_rsrp')
                if rsrp is not None:
                    # Map RSRP (-140 to -40) to score (0 to 100)
                    coverage_score = int(max(0, min(100, (rsrp + 140) * 100 / 100)))
                else:
                    coverage_score = pred_class * 25  # Fallback based on prediction

                results.append({
                    'lat': cell['lat'],
                    'lon': cell['lon'],
                    'enb': cell['enb'],
                    'eci': cell['eci'],
                    'samples': cell['samples'],
                    'mcc': cell['mcc'],
                    'mnc': cell['mnc'],
                    'avg_rsrp': cell['avg_rsrp'],
                    'min_rsrp': cell['min_rsrp'],
                    'max_rsrp': cell['max_rsrp'],
                    'coverage_level': coverage_info['level'],
                    'coverage_color': coverage_info['color'],
                    'coverage_label': coverage_info['label'],
                    'coverage_score': coverage_score,
                    'confidence': float(confidence[i]),
                })

            # Sort by coverage score (worst coverage first for attention)
            results.sort(key=lambda x: x['coverage_score'])

            response = {
                'success': True,
                'total_cells': len(cells),
                'has_rsrp': has_rsrp,
                'coverage_stats': {
                    'excellent': coverage_stats[4],
                    'good': coverage_stats[3],
                    'fair': coverage_stats[2],
                    'poor': coverage_stats[1],
                    'bad': coverage_stats[0],
                },
                'model': 'RandomForest + RSRP Coverage',
                'results': results
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            self.send_json_error(f'ML analysis error: {str(e)}')

    def send_json_error(self, message, status=400):
        """Send JSON error response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[Proxy] {args[0]}")


def run_server(port=8000):
    """Start the proxy server"""
    server = HTTPServer(('', port), ProxyHandler)
    ml_status = "✓ Enabled" if ML_AVAILABLE else "✗ Disabled (pip install scikit-learn numpy)"
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     ClickHouse Proxy Server with ML Coverage Analysis      ║
╠════════════════════════════════════════════════════════════╣
║  Local:       http://localhost:{port}                        ║
║  ClickHouse:  {CH_HOST}         ║
║  ML Features: {ml_status}
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    POST /query       - Execute ClickHouse query            ║
║    POST /ml/coverage - Analyze cell coverage (Random Forest)║
║    GET  /*           - Serve static files                  ║
╚════════════════════════════════════════════════════════════╝
    """)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
