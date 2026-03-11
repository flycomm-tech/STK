#!/bin/bash
# ── Spectra API — quick start (uses venv to avoid macOS pip restrictions) ─────
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo ""
    echo "  .env not found — copy .env.example and fill in your ClickHouse credentials:"
    echo "  cp .env.example .env"
    echo ""
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d .venv ]; then
    echo "  Creating Python virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install deps into venv if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "  Installing dependencies into .venv..."
    pip install -r requirements.txt -q
fi

echo ""
echo "  Spectra API starting on http://localhost:8001"
echo "  Docs:   http://localhost:8001/docs"
echo "  Health: http://localhost:8001/api/health/clickhouse"
echo "  Press Ctrl+C to stop"
echo ""

python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
