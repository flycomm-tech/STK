#!/usr/bin/env python3
"""
Simple local HTTP server for Advanced Cell Report.
Run this instead of opening index.html directly —
the FileReader / upload API requires an http:// origin.

Usage:
    python3 server.py
Then open:  http://localhost:8080
"""
import http.server
import socketserver
import os
import sys

PORT = 8080
DIR  = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in ("200", "304"):
            super().log_message(fmt, *args)


def main():
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print(f"\n  ✅  Network Signal Map is running")
            print(f"  👉  Open in your browser: http://localhost:{PORT}")
            print(f"  🤖  AI Report: enter your Gemini API key in the sidebar")
            print(f"\n  Press Ctrl+C to stop\n")
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n  ⚠  Port {PORT} is already in use.")
            print(f"  Try: python3 server.py  (or kill the process on port {PORT})\n")
        else:
            raise
    except KeyboardInterrupt:
        print("\n\n  Server stopped.\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
