#!/bin/bash
# Starts the FastAPI backend on http://localhost:8000
cd "$(dirname "$0")/backend" || exit 1
if [ ! -d ".venv" ]; then
  echo "First run: creating virtual environment and installing packages..."
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi
./.venv/bin/uvicorn main:app --reload --port 8000
