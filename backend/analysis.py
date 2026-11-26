"""Technical indicators, risk statistics and trading signals."""
import numpy as np
import pandas as pd

TRADING_DAYS = 252


def add_indicators(df, col):
    """Adds SMA, EMA, Bollinger Bands, RSI, MACD and drawdown columns."""
    c = df[col]
    out = df.copy()
    out["sma20"] = c.rolling(20).mean()
    out["sma50"] = c.rolling(50).mean()
    out["sma200"] = c.rolling(200).mean()
    out["ema20"] = c.ewm(span=20, adjust=False).mean()

    std20 = c.rolling(20).std()
    out["bb_upper"] = out["sma20"] + 2 * std20
    out["bb_lower"] = out["sma20"] - 2 * std20

    delta = c.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    out["rsi"] = 100 - 100 / (1 + rs)

    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()
    out["macd_hist"] = out["macd"] - out["macd_signal"]

    out["drawdown"] = (c / c.cummax() - 1) * 100
    return out


def _f(x, nd=4):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if np.isnan(x) or np.isinf(x):
        return None
    return round(x, nd)


def risk_stats(df, col, risk_free_pct):
    c = df[col]
    r = c.pct_change().dropna()
    dates = c.index
    years = max((dates[-1] - dates[0]).days / 365.25, 1e-9)

    cagr = (c.iloc[-1] / c.iloc[0]) ** (1 / years) - 1
    ann_ret = r.mean() * TRADING_DAYS
    vol = r.std() * np.sqrt(TRADING_DAYS)
    rf = risk_free_pct / 100
    sharpe = (ann_ret - rf) / vol if vol > 0 else None
    downside = r[r < 0].std() * np.sqrt(TRADING_DAYS)
    sortino = (ann_ret - rf) / downside if downside and downside > 0 else None

    dd = c / c.cummax() - 1
    mdd = dd.min()
    mdd_date = dd.idxmin()
    peak_date = c.loc[:mdd_date].idxmax()
    calmar = cagr / abs(mdd) if mdd < 0 else None

    var95 = -np.percentile(r, 5)
    cvar95 = -r[r <= -var95].mean()
    var99 = -np.percentile(r, 1)

    last_year = df.iloc[-TRADING_DAYS:]
    high_col = "High" if "High" in df and df["High"].notna().any() else col
    low_col = "Low" if "Low" in df and df["Low"].notna().any() else col

    stats = {
        "start_date": dates[0].strftime("%Y-%m-%d"),
        "end_date": dates[-1].strftime("%Y-%m-%d"),
        "trading_days": int(len(c)),
        "first_price": _f(c.iloc[0]),
        "last_price": _f(c.iloc[-1]),
        "change_1d_pct": _f((c.iloc[-1] / c.iloc[-2] - 1) * 100) if len(c) > 1 else None,
        "change_1m_pct": _f((c.iloc[-1] / c.iloc[-22] - 1) * 100) if len(c) > 22 else None,
        "total_return_pct": _f((c.iloc[-1] / c.iloc[0] - 1) * 100),
        "cagr_pct": _f(cagr * 100),
        "annual_volatility_pct": _f(vol * 100),
        "daily_volatility_pct": _f(r.std() * 100),
        "sharpe": _f(sharpe, 3),
        "sortino": _f(sortino, 3),
        "calmar": _f(calmar, 3),
        "max_drawdown_pct": _f(mdd * 100),
        "max_drawdown_peak": peak_date.strftime("%Y-%m-%d"),
        "max_drawdown_trough": mdd_date.strftime("%Y-%m-%d"),
        "current_drawdown_pct": _f(dd.iloc[-1] * 100),
        "var95_pct": _f(var95 * 100),
        "cvar95_pct": _f(cvar95 * 100),
        "var99_pct": _f(var99 * 100),
        "high_52w": _f(last_year[high_col].max()),
        "low_52w": _f(last_year[low_col].min()),
        "best_day_pct": _f(r.max() * 100),
        "best_day": r.idxmax().strftime("%Y-%m-%d"),
        "worst_day_pct": _f(r.min() * 100),
        "worst_day": r.idxmin().strftime("%Y-%m-%d"),
        "positive_days_pct": _f((r > 0).mean() * 100),
        "skewness": _f(r.skew(), 3),
        "kurtosis": _f(r.kurt(), 3),
        "avg_volume": _f(df["Volume"].tail(TRADING_DAYS).mean(), 0) if "Volume" in df and df["Volume"].notna().any() else None,
        "risk_free_pct": risk_free_pct,
    }
    return stats


def return_distribution(df, col, bins=40):
    r = df[col].pct_change().dropna() * 100
    counts, edges = np.histogram(r, bins=bins)
    return [
        {"from": _f(edges[i], 3), "to": _f(edges[i + 1], 3),
         "mid": _f((edges[i] + edges[i + 1]) / 2, 3), "count": int(counts[i])}
        for i in range(len(counts))
    ]


def monthly_returns(df, col):
    c = df[col]
    month_end = c.groupby([c.index.year, c.index.month]).last()
    first_price = c.iloc[0]
    rets = month_end.pct_change()
    rets.iloc[0] = month_end.iloc[0] / first_price - 1
    return [
        {"year": int(y), "month": int(m), "return_pct": _f(v * 100, 2)}
        for (y, m), v in rets.items()
    ]


def technical_signals(ind, col):
    last = ind.iloc[-1]
    price = last[col]
    signals = []

    def add(name, value, verdict, detail):
        signals.append({"name": name, "value": value, "verdict": verdict, "detail": detail})

    sma50, sma200 = last.get("sma50"), last.get("sma200")
    if pd.notna(sma50) and pd.notna(sma200):
        if price > sma50 > sma200:
            add("Trend", "Strong uptrend", "bullish", "Price is above the 50-day average, which is above the 200-day average.")
        elif price < sma50 < sma200:
            add("Trend", "Strong downtrend", "bearish", "Price is below the 50-day average, which is below the 200-day average.")
        else:
            add("Trend", "Mixed", "neutral", "Price and moving averages do not agree on a direction.")
        cross = "Golden cross" if sma50 > sma200 else "Death cross"
        add("50/200 DMA", cross, "bullish" if sma50 > sma200 else "bearish",
            "50-day average is {} the 200-day average.".format("above" if sma50 > sma200 else "below"))
    elif pd.notna(sma50):
        add("Trend", "Above 50 DMA" if price > sma50 else "Below 50 DMA",
            "bullish" if price > sma50 else "bearish", "Not enough data for a 200-day average.")

    rsi = last.get("rsi")
    if pd.notna(rsi):
        if rsi >= 70:
            add("RSI (14)", "{:.1f} · Overbought".format(rsi), "bearish", "RSI above 70 often comes before a pull-back.")
        elif rsi <= 30:
            add("RSI (14)", "{:.1f} · Oversold".format(rsi), "bullish", "RSI below 30 often comes before a bounce.")
        else:
            add("RSI (14)", "{:.1f} · Neutral".format(rsi), "neutral", "RSI between 30 and 70.")

    macd, sig = last.get("macd"), last.get("macd_signal")
    if pd.notna(macd) and pd.notna(sig):
        add("MACD", "Above signal" if macd > sig else "Below signal",
            "bullish" if macd > sig else "bearish",
            "MACD {:.2f} vs signal line {:.2f}.".format(macd, sig))

    up, lo = last.get("bb_upper"), last.get("bb_lower")
    if pd.notna(up) and pd.notna(lo) and up > lo:
        pb = (price - lo) / (up - lo)
        if pb > 1:
            v, d = "bearish", "Price is above the upper band (stretched)."
        elif pb < 0:
            v, d = "bullish", "Price is below the lower band (stretched)."
        else:
            v, d = "neutral", "Price is inside the bands."
        add("Bollinger %B", "{:.2f}".format(pb), v, d)

    return signals
