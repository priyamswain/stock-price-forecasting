"""
Forecasting models.

Every model works on the natural log of the price (log-price). This keeps
forecasts positive and turns percentage moves into simple differences.

Each model has three methods:
    fit(y)              -> learn from a log-price array
    forecast(h)         -> predict the next h log-prices (multi-step)
    one_step(y, start)  -> for every t >= start, predict y[t] using only data up to t-1
                           (parameters are the ones learned in fit)

All models are light on CPU so they run quickly on an old laptop.
"""
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor


class BaseModel:
    key = ""
    name = ""
    description = ""

    def fit(self, y):
        raise NotImplementedError

    def forecast(self, h):
        raise NotImplementedError

    def one_step(self, y, start):
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# 1. Random walk with drift (baseline)
# --------------------------------------------------------------------------- #
class DriftModel(BaseModel):
    key = "drift"
    name = "Random Walk + Drift"
    description = "Baseline. Tomorrow = today + the average daily change. Hard to beat for stocks."

    def fit(self, y):
        self.mu = float(np.mean(np.diff(y)))
        self.last = float(y[-1])
        return self

    def forecast(self, h):
        return self.last + self.mu * np.arange(1, h + 1)

    def one_step(self, y, start):
        return y[start - 1:-1] + self.mu


# --------------------------------------------------------------------------- #
# 2. Linear trend on the last year of data
# --------------------------------------------------------------------------- #
class LinearTrendModel(BaseModel):
    key = "trend"
    name = "Linear Trend (1Y)"
    description = "Straight-line trend fitted to the last 252 trading days."

    def __init__(self, window=252):
        self.window = window

    def fit(self, y):
        n = len(y)
        w = min(self.window, n)
        t = np.arange(n - w, n)
        self.b, self.a = np.polyfit(t, y[-w:], 1)
        self.n = n
        return self

    def forecast(self, h):
        t = np.arange(self.n, self.n + h)
        return self.a + self.b * t

    def one_step(self, y, start):
        t = np.arange(start, len(y))
        return self.a + self.b * t


# --------------------------------------------------------------------------- #
# 3. Holt's damped-trend exponential smoothing
# --------------------------------------------------------------------------- #
def _holt_filter(y, alpha, beta, phi):
    """Runs Holt's method. preds[t] is the forecast of y[t] made at t-1."""
    level = y[0]
    trend = y[1] - y[0]
    preds = np.empty(len(y))
    preds[0] = y[0]
    for t in range(1, len(y)):
        f = level + phi * trend
        preds[t] = f
        new_level = alpha * y[t] + (1 - alpha) * f
        trend = beta * (new_level - level) + (1 - beta) * phi * trend
        level = new_level
    return preds, level, trend


class HoltModel(BaseModel):
    key = "holt"
    name = "Holt Exponential Smoothing"
    description = "Smoothed level + damped trend. Parameters chosen automatically by grid search."

    def fit(self, y):
        best = None
        # Fit on at most the last 3 years to keep it fast.
        y_fit = y[-756:]
        for alpha in (0.2, 0.4, 0.6, 0.8, 0.9, 1.0):
            for beta in (0.01, 0.05, 0.1, 0.2):
                for phi in (0.8, 0.9, 0.98):
                    preds, _, _ = _holt_filter(y_fit, alpha, beta, phi)
                    sse = float(np.sum((y_fit[2:] - preds[2:]) ** 2))
                    if best is None or sse < best[0]:
                        best = (sse, alpha, beta, phi)
        _, self.alpha, self.beta, self.phi = best
        self.offset = len(y) - len(y_fit)
        _, self.level, self.trend = _holt_filter(y_fit, self.alpha, self.beta, self.phi)
        return self

    def forecast(self, h):
        damp = np.cumsum(self.phi ** np.arange(1, h + 1))
        return self.level + damp * self.trend

    def one_step(self, y, start):
        y_run = y[self.offset:]
        preds, _, _ = _holt_filter(y_run, self.alpha, self.beta, self.phi)
        return preds[start - self.offset:]


# --------------------------------------------------------------------------- #
# 4. ARIMA(p,1,0): autoregression on daily log-returns
# --------------------------------------------------------------------------- #
class ARIMAModel(BaseModel):
    key = "arima"
    name = "ARIMA (p,1,0)"
    description = "Autoregressive model on daily returns. p = the lag window you choose."

    def __init__(self, p=10):
        self.p = p

    def _lag_matrix(self, d):
        p = self.p
        cols = [d[p - i - 1:len(d) - i - 1] for i in range(p)]  # lag 1 .. lag p
        X = np.column_stack(cols)
        return np.column_stack([np.ones(len(X)), X])

    def fit(self, y):
        d = np.diff(y)
        X = self._lag_matrix(d)
        target = d[self.p:]
        self.coef, *_ = np.linalg.lstsq(X, target, rcond=None)
        self.hist = list(d[-self.p:])
        self.last = float(y[-1])
        return self

    def forecast(self, h):
        hist = list(self.hist)
        level = self.last
        out = []
        for _ in range(h):
            lags = np.array(hist[::-1][:self.p])
            dhat = self.coef[0] + float(np.dot(self.coef[1:], lags))
            hist.append(dhat)
            level += dhat
            out.append(level)
        return np.array(out)

    def one_step(self, y, start):
        d = np.diff(y)
        dhat = self._lag_matrix(d) @ self.coef  # dhat[j] predicts d[j + p]
        idx = np.arange(start, len(y))  # y[t] = y[t-1] + d[t-1]
        return y[idx - 1] + dhat[idx - 1 - self.p]


# --------------------------------------------------------------------------- #
# 5 & 6. Machine learning on lagged returns
# --------------------------------------------------------------------------- #
def _features(r, p):
    """Feature vector used to predict the NEXT return from past returns r."""
    last = r[-p:][::-1]
    return np.concatenate([
        last,
        [r[-5:].mean(), r[-5:].std(), r[-20:].mean(), r[-20:].std(), r[-60:].mean()],
    ])


class _MLModel(BaseModel):
    def __init__(self, p=10):
        self.p = p
        self.min_hist = max(p, 60)

    def _make(self):
        raise NotImplementedError

    def fit(self, y):
        r = np.diff(y)
        X = np.array([_features(r[:t], self.p) for t in range(self.min_hist, len(r))])
        target = r[self.min_hist:]
        self.model = self._make().fit(X, target)
        self.r = r
        self.last = float(y[-1])
        return self

    def forecast(self, h):
        r = list(self.r)
        level = self.last
        out = []
        for _ in range(h):
            rhat = float(self.model.predict(_features(np.array(r), self.p).reshape(1, -1))[0])
            r.append(rhat)
            level += rhat
            out.append(level)
        return np.array(out)

    def one_step(self, y, start):
        r = np.diff(y)
        idx = np.arange(start, len(y))  # predict r[t-1] from r[:t-1]
        X = np.array([_features(r[:t - 1], self.p) for t in idx])
        return y[idx - 1] + self.model.predict(X)


class RandomForestModel(_MLModel):
    key = "rf"
    name = "Random Forest"
    description = "200 decision trees learning from recent returns and volatility."

    def _make(self):
        return RandomForestRegressor(
            n_estimators=200, max_depth=6, min_samples_leaf=5, n_jobs=-1, random_state=42
        )


class GradientBoostingModel(_MLModel):
    key = "gb"
    name = "Gradient Boosting"
    description = "Boosted trees that correct each other's errors step by step."

    def _make(self):
        return GradientBoostingRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=42
        )


MODEL_CLASSES = {
    cls.key: cls
    for cls in (DriftModel, LinearTrendModel, HoltModel, ARIMAModel, RandomForestModel, GradientBoostingModel)
}


def make_model(key, lags):
    cls = MODEL_CLASSES[key]
    if key in ("arima", "rf", "gb"):
        return cls(p=lags)
    return cls()


def model_catalog():
    items = [{"key": c.key, "name": c.name, "description": c.description} for c in MODEL_CLASSES.values()]
    items.append({
        "key": "ensemble",
        "name": "Weighted Ensemble",
        "description": "Blend of the selected models, weighted by their backtest accuracy (added automatically when 2+ models are selected).",
    })
    return items
