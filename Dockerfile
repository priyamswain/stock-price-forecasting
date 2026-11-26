# One container that runs the whole app: FastAPI serves the API and the built React site.

# ---- Stage 1: build the React frontend ----
FROM node:18-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python backend ----
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY sample_data/ ./sample_data/
COPY --from=frontend /frontend/dist ./frontend/dist

WORKDIR /app/backend
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
