#!/usr/bin/env python3
"""
ClickHouse Proxy Server
Bypasses CORS restrictions for browser-based ClickHouse connections
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import urllib.request
import urllib.error
import ssl
import base64
import os

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
        self.send_header('Access-Control-Allow-Origin', '*')
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

            # Build ClickHouse URL
            url = f'https://{host}/?database={database}&default_format=JSON'

            # Create request
            req = urllib.request.Request(url, data=query.encode('utf-8'), method='POST')

            # Add auth header
            auth_string = base64.b64encode(f'{user}:{password}'.encode()).decode()
            req.add_header('Authorization', f'Basic {auth_string}')
            req.add_header('Content-Type', 'text/plain')

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
    print(f"""
╔════════════════════════════════════════════════════════════╗
║           ClickHouse Proxy Server Running                  ║
╠════════════════════════════════════════════════════════════╣
║  Local:     http://localhost:{port}                          ║
║  ClickHouse: {CH_HOST}           ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    POST /query  - Execute ClickHouse query                 ║
║    GET  /*      - Serve static files                       ║
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
