"""Runs the backtest, the final forecasts and assembles the full report."""
import time
from statistics import NormalDist

import numpy as np
import pandas as pd

from analysis import (_f, add_indicators, monthly_returns, return_distribution,
                      risk_stats, technical_signals)
from forecasting import MODEL_CLASSES, make_model

MIN_ROWS = 150


def _metrics(actual_log, pred_log, prev_actual_log, one_step_log):
    a = np.exp(actual_log)
    p = np.exp(pred_log)
    err = p - a
    o = np.exp(one_step_log)
    prev = np.exp(prev_actual_log)
    direction = np.mean(np.sign(o - prev) == np.sign(a - prev)) * 100
    ss_res = np.sum(err ** 2)
    ss_tot = np.sum((a - a.mean()) ** 2)
    return {
        "mae": _f(np.mean(np.abs(err))),
        "rmse": _f(np.sqrt(np.mean(err ** 2))),
        "mape": _f(np.mean(np.abs(err) / a) * 100, 3),
        "r2": _f(1 - ss_res / ss_tot, 3) if ss_tot > 0 else None,
        "one_step_rmse": _f(np.sqrt(np.mean((o - a) ** 2))),
        "one_step_mape": _f(np.mean(np.abs(o - a) / a) * 100, 3),
        "direction_accuracy": _f(direction, 1),
    }


def build_report(df, meta, horizon, test_days, model_keys, lags, confidence, price_field, risk_free):
    t0 = time.time()

    if price_field not in df.columns:
        price_field = "Close"
    df = df[df[price_field].notna() & (df[price_field] > 0)].copy()
    if len(df) < MIN_ROWS:
        raise ValueError(
            "Only {} trading days of data found. Please choose a longer date range "
            "(at least {} trading days, about 7 months).".format(len(df), MIN_ROWS)
        )

    model_keys = [k for k in model_keys if k in MODEL_CLASSES]
    if not model_keys:
        raise ValueError("Please select at least one forecasting model.")

    y = np.log(df[price_field].values.astype(float))
    n = len(y)
    test_n = int(min(test_days, n - 120))
    split = n - test_n
    z = NormalDist().inv_cdf(0.5 + confidence / 2)

    # ---------------- Backtest: train on the past, predict the hidden test window
    actual_test = y[split:]
    prev_actual = y[split - 1:-1]
    bt = {}
    for key in model_keys:
        m = make_model(key, lags).fit(y[:split])
        ms = m.forecast(test_n)
        os_ = m.one_step(y, split)
        bt[key] = {"name": m.name, "multi": ms, "one": os_,
                   "sigma": float(np.std(actual_test - os_, ddof=1))}
        bt[key]["metrics"] = _metrics(actual_test, ms, prev_actual, os_)

    # ---------------- Final models: refit on all data, forecast the future
    fc = {}
    for key in model_keys:
        m = make_model(key, lags).fit(y)
        fc[key] = m.forecast(horizon)

    # ---------------- Ensemble (weights = 1 / backtest RMSE)
    if len(model_keys) >= 2:
        inv = np.array([1 / max(bt[k]["metrics"]["rmse"] or 1e-9, 1e-9) for k in model_keys])
        w = inv / inv.sum()
        multi = sum(w[i] * bt[k]["multi"] for i, k in enumerate(model_keys))
        one = sum(w[i] * bt[k]["one"] for i, k in enumerate(model_keys))
        bt["ensemble"] = {
            "name": "Weighted Ensemble", "multi": multi, "one": one,
            "sigma": float(np.std(actual_test - one, ddof=1)),
            "metrics": _metrics(actual_test, multi, prev_actual, one),
            "weights": {k: _f(w[i] * 100, 1) for i, k in enumerate(model_keys)},
        }
        fc["ensemble"] = sum(w[i] * fc[k] for i, k in enumerate(model_keys))

    # ---------------- Dates for the future (business days)
    last_date = df.index[-1]
    future_dates = pd.bdate_range(last_date + pd.Timedelta(days=1), periods=horizon)
    last_log = y[-1]
    last_price = float(np.exp(last_log))
    steps = np.sqrt(np.arange(1, horizon + 1))

    models_out = []
    for key, res in bt.items():
        sigma = res["sigma"]
        f = fc[key]
        lower = np.exp(f - z * sigma * steps)
        upper = np.exp(f + z * sigma * steps)
        pred = np.exp(f)
        prob_up = NormalDist().cdf((f[-1] - last_log) / (sigma * steps[-1])) * 100 if sigma > 0 else None
        models_out.append({
            "key": key,
            "name": res["name"],
            "metrics": res["metrics"],
            "weights": res.get("weights"),
            "forecast": [
                {"date": d.strftime("%Y-%m-%d"), "pred": _f(pred[i]), "lower": _f(lower[i]), "upper": _f(upper[i])}
                for i, d in enumerate(future_dates)
            ],
            "summary": {
                "final_price": _f(pred[-1]),
                "final_lower": _f(lower[-1]),
                "final_upper": _f(upper[-1]),
                "expected_return_pct": _f((pred[-1] / last_price - 1) * 100, 3),
                "prob_up_pct": _f(prob_up, 1),
                "max_pred": _f(pred.max()),
                "min_pred": _f(pred.min()),
            },
            "backtest": [_f(v) for v in np.exp(res["multi"])],
        })

    models_out.sort(key=lambda m: m["metrics"]["rmse"] if m["metrics"]["rmse"] is not None else 1e18)
    best = models_out[0]["key"]
    baseline = next((m for m in models_out if m["key"] == "drift"), None)
    for i, m in enumerate(models_out):
        m["rank"] = i + 1
        if baseline and baseline["metrics"]["rmse"]:
            m["vs_baseline_pct"] = _f((1 - m["metrics"]["rmse"] / baseline["metrics"]["rmse"]) * 100, 2)

    # ---------------- Indicators, stats, signals
    ind = add_indicators(df, price_field)
    cols = ["Open", "High", "Low", "Volume"]
    history = []
    for d, row in ind.iterrows():
        item = {"date": d.strftime("%Y-%m-%d"), "close": _f(row[price_field])}
        for c in cols:
            if c in ind.columns:
                item[c.lower()] = _f(row[c], 0 if c == "Volume" else 4)
        for c in ("sma20", "sma50", "sma200", "ema20", "bb_upper", "bb_lower",
                  "rsi", "macd", "macd_signal", "macd_hist", "drawdown"):
            item[c] = _f(row[c], 3)
        history.append(item)

    best_model = models_out[0]
    signals = technical_signals(ind, price_field)
    er = best_model["summary"]["expected_return_pct"] or 0
    signals.append({
        "name": "Forecast ({}d)".format(horizon),
        "value": "{:+.2f}%".format(er),
        "verdict": "bullish" if er > 1 else ("bearish" if er < -1 else "neutral"),
        "detail": "{} expects {:+.2f}% with {}% chance of ending higher.".format(
            best_model["name"], er, best_model["summary"]["prob_up_pct"]),
    })

    return {
        "meta": {
            **meta,
            "price_field": price_field,
            "horizon": horizon,
            "test_days": test_n,
            "lags": lags,
            "confidence": confidence,
            "train_days": split,
            "backtest_start": df.index[split].strftime("%Y-%m-%d"),
            "compute_seconds": round(time.time() - t0, 2),
        },
        "best_model": best,
        "models": models_out,
        "backtest_dates": [d.strftime("%Y-%m-%d") for d in df.index[split:]],
        "backtest_actual": [_f(v) for v in np.exp(actual_test)],
        "history": history,
        "stats": risk_stats(df, price_field, risk_free),
        "signals": signals,
        "distribution": return_distribution(df, price_field),
        "monthly": monthly_returns(df, price_field),
    }
