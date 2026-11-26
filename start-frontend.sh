#!/bin/bash
# Starts the React frontend on http://localhost:5173
cd "$(dirname "$0")/frontend" || exit 1
if [ ! -d "node_modules" ]; then
  echo "First run: installing packages..."
  npm install
fi
npm run dev
