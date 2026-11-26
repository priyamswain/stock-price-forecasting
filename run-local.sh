#!/bin/bash
# Starts the backend and the frontend together.
# Press Ctrl+C once to stop both.

echo "Starting backend..."
cd ~/stock-forecaster/backend
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
trap "kill $BACKEND_PID 2>/dev/null" EXIT

sleep 6
if curl -s http://127.0.0.1:8000/api/health | grep -q ok; then
  echo "Backend is running."
else
  echo "Backend did NOT start. Read the error above and send a screenshot."
  exit 1
fi

echo "Starting frontend..."
cd ~/stock-forecaster/frontend
source ~/.nvm/nvm.sh
nvm use 18
npm run dev
