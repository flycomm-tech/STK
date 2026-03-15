"""
Vercel Python serverless entrypoint.
Routes all /api/* requests to the FastAPI app in spectra-api/.
"""
import sys
import os

# Add spectra-api to the Python path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "spectra-api"))

from main import app  # noqa: F401 — Vercel detects the ASGI `app` variable
