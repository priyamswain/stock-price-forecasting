"""Loading price data from Yahoo Finance or from a CSV file."""
import io
from datetime import timedelta

import pandas as pd

COLUMN_ALIASES = {
    "date": "Date", "datetime": "Date", "timestamp": "Date",
    "open": "Open", "high": "High", "low": "Low",
    "close": "Close", "close price": "Close", "price": "Close", "ltp": "Close",
    "adj close": "Adj Close", "adj_close": "Adj Close", "adjclose": "Adj Close", "adjusted close": "Adj Close",
    "volume": "Volume", "vol": "Volume", "total traded quantity": "Volume",
}


def _clean(df):
    df = df[~df.index.duplicated(keep="last")].sort_index()
    for c in ("Open", "High", "Low", "Close", "Adj Close", "Volume"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    if "Adj Close" not in df.columns:
        df["Adj Close"] = df["Close"]
    df = df[df["Close"].notna()]
    return df


def fetch_yahoo(ticker, start, end):
    try:
        import yfinance as yf
    except ImportError:
        raise ValueError("yfinance is not installed. Run: pip install yfinance")

    ticker = ticker.strip().upper()
    if not ticker:
        raise ValueError("Please enter a ticker symbol.")

    t = yf.Ticker(ticker)
    try:
        df = t.history(start=start, end=end + timedelta(days=1), auto_adjust=False, actions=False)
    except Exception as e:  # network / rate-limit problems
        raise ValueError("Could not download data for {}: {}".format(ticker, e))

    if df is None or df.empty:
        raise ValueError(
            "No data found for '{}'. Check the symbol (Indian stocks need .NS or .BO, "
            "e.g. RELIANCE.NS) and your internet connection.".format(ticker)
        )

    df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    df.index = df.index.normalize()
    df = _clean(df[[c for c in ("Open", "High", "Low", "Close", "Adj Close", "Volume") if c in df.columns]])

    meta = {"ticker": ticker, "name": ticker, "currency": "", "exchange": "", "source": "Yahoo Finance"}
    try:
        fi = t.fast_info
        meta["currency"] = fi["currency"] or ""
        meta["exchange"] = fi["exchange"] or ""
    except Exception:
        pass
    try:
        info = t.info or {}
        meta["name"] = info.get("longName") or info.get("shortName") or ticker
        meta["sector"] = info.get("sector")
        meta["industry"] = info.get("industry")
    except Exception:
        pass
    return df, meta


def parse_csv(content, filename="upload.csv", start=None, end=None):
    try:
        raw = pd.read_csv(io.BytesIO(content), thousands=",")
    except Exception as e:
        raise ValueError("Could not read the CSV file: {}".format(e))

    rename = {}
    for c in raw.columns:
        key = str(c).strip().lower()
        if key in COLUMN_ALIASES:
            rename[c] = COLUMN_ALIASES[key]
    raw = raw.rename(columns=rename)

    if "Date" not in raw.columns or "Close" not in raw.columns:
        raise ValueError("CSV must have at least a 'Date' column and a 'Close' column. "
                         "Found columns: {}".format(", ".join(map(str, raw.columns))))

    raw["Date"] = pd.to_datetime(raw["Date"], errors="coerce", dayfirst=False)
    raw = raw[raw["Date"].notna()]
    if raw.empty:
        raise ValueError("Could not understand the dates in the 'Date' column. Use the format YYYY-MM-DD.")
    df = raw.set_index("Date")
    df.index = df.index.normalize()
    keep = [c for c in ("Open", "High", "Low", "Close", "Adj Close", "Volume") if c in df.columns]
    df = _clean(df[keep])

    if start is not None:
        df = df[df.index >= pd.Timestamp(start)]
    if end is not None:
        df = df[df.index <= pd.Timestamp(end)]

    name = filename.rsplit(".", 1)[0]
    meta = {"ticker": name.upper(), "name": name, "currency": "", "exchange": "", "source": "CSV upload"}
    return df, meta
