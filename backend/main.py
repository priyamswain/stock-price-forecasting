"""
StockCast API - stock price forecasting backend.

Run:  uvicorn main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from data import fetch_yahoo, parse_csv
from engine import build_report
from forecasting import model_catalog

DEFAULT_MODELS = ["drift", "trend", "holt", "arima", "rf", "gb"]

app = FastAPI(title="StockCast API", version="1.0.0",
              description="Stock price forecasting with backtesting, technical analysis and risk statistics.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ForecastRequest(BaseModel):
    ticker: str = Field(..., examples=["RELIANCE.NS"])
    start_date: date = Field(default_factory=lambda: date.today() - timedelta(days=365 * 3))
    end_date: date = Field(default_factory=date.today)
    horizon: int = Field(30, ge=1, le=180, description="Trading days to forecast")
    test_days: int = Field(30, ge=5, le=250, description="Days hidden for backtesting")
    models: List[str] = Field(default_factory=lambda: list(DEFAULT_MODELS))
    lags: int = Field(10, ge=2, le=30, description="Lag window for ARIMA / ML models")
    confidence: float = Field(0.95, ge=0.5, le=0.99)
    price_field: str = Field("Close", description="Close or Adj Close")
    risk_free: float = Field(6.5, ge=0, le=30, description="Annual risk-free rate in %")
    currency: Optional[str] = Field(None, description="Override currency symbol/code")


def _check_dates(start, end):
    if start >= end:
        raise HTTPException(400, "Start date must be before end date.")


def _run(df, meta, horizon, test_days, models, lags, confidence, price_field, risk_free, currency):
    if currency:
        meta["currency"] = currency
    try:
        return build_report(df, meta, horizon, test_days, models, lags, confidence, price_field, risk_free)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/models")
def models():
    return model_catalog()


@app.post("/api/forecast")
def forecast(req: ForecastRequest):
    _check_dates(req.start_date, req.end_date)
    try:
        df, meta = fetch_yahoo(req.ticker, req.start_date, req.end_date)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _run(df, meta, req.horizon, req.test_days, req.models, req.lags,
                req.confidence, req.price_field, req.risk_free, req.currency)


@app.post("/api/forecast/csv")
async def forecast_csv(
    file: UploadFile = File(...),
    start_date: Optional[date] = Form(None),
    end_date: Optional[date] = Form(None),
    horizon: int = Form(30),
    test_days: int = Form(30),
    models: str = Form(",".join(DEFAULT_MODELS)),
    lags: int = Form(10),
    confidence: float = Form(0.95),
    price_field: str = Form("Close"),
    risk_free: float = Form(6.5),
    currency: Optional[str] = Form(None),
):
    if start_date and end_date:
        _check_dates(start_date, end_date)
    if not (1 <= horizon <= 180 and 5 <= test_days <= 250 and 2 <= lags <= 30 and 0.5 <= confidence <= 0.99):
        raise HTTPException(400, "One of the inputs is out of range.")
    content = await file.read()
    try:
        df, meta = parse_csv(content, file.filename or "upload.csv", start_date, end_date)
    except ValueError as e:
        raise HTTPException(400, str(e))
    model_list = [m.strip() for m in models.split(",") if m.strip()]
    return _run(df, meta, horizon, test_days, model_list, lags, confidence, price_field, risk_free, currency)


# --------------------------------------------------------------------------- #
# Serve the built React app (frontend/dist) from the same server.
# Used when deployed online; in local development Vite serves the frontend.
# Mounted last so the /api routes above always win.
# --------------------------------------------------------------------------- #
import os
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = os.environ.get(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"),
)
if os.path.isdir(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
