# StockCast: Stock Price Forecasting Studio

### 🔗 Live demo: https://stock-price-forecasting.onrender.com
*(Hosted on Render's free plan. If it has been idle, the first load takes about a minute while the server wakes up.)*

A full-stack stock price forecasting app. You choose the stock and all the settings in a web interface. A Python backend trains 6 forecasting models, grades them on data they have never seen, and returns a full report with forecasts, confidence bands, model comparison, technical indicators and risk statistics.

**Tech stack:** Python · FastAPI · pandas · NumPy · scikit-learn · yfinance | React 18 · Vite 5 · Recharts

It is built to run on older hardware such as a 2015 MacBook Air. It doesn't use TensorFlow, PyTorch or Prophet, and a full run takes about 10–40 seconds.

---

## What you can enter (all from the UI)

| Input | What it does |
|---|---|
| Data source | Yahoo Finance ticker (e.g. `RELIANCE.NS`, `TCS.NS`, `AAPL`, `^NSEI`) **or** upload your own CSV |
| Start / end date | The history the models learn from (quick buttons: 1Y–10Y) |
| Forecast horizon | 1–180 trading days into the future |
| Backtest window | 5–250 days hidden from the models to test their accuracy |
| Lag window | 2–30 past returns used by ARIMA / Random Forest / Gradient Boosting |
| Confidence band | 80 / 90 / 95 / 99 % |
| Price field | Close or Adj Close |
| Risk-free rate | Used for Sharpe and Sortino ratios |
| Currency | Auto-detected, or set your own |
| Models | Choose any of the 6; a weighted ensemble is added automatically |

## What you get back

- **Headline cards:** forecast price, expected return, confidence range, probability of ending higher, backtest error
- **Plain-English summary** of the result
- **Forecast chart:** history, forecast path and confidence band, with the option to overlay all models
- **Model leaderboard:** MAE, RMSE, MAPE, 1-day MAPE, direction accuracy and improvement over the baseline
- **Backtest chart:** each model's prediction vs what really happened
- **Ensemble weights**
- **Technicals:** SMA 20/50/200, EMA 20, Bollinger Bands, volume, RSI, MACD
- **Signal summary:** trend, golden/death cross, RSI, MACD, Bollinger and forecast, each marked bullish, bearish or neutral
- **Risk report:** CAGR, volatility, Sharpe, Sortino, Calmar, max drawdown, VaR/CVaR, 52-week range, best/worst day, skew and kurtosis
- **Drawdown chart, return histogram and monthly returns heatmap**
- **Day-by-day forecast table** with CSV download, plus the full report as JSON

## The models

| Model | Idea |
|---|---|
| Random Walk + Drift | Baseline: tomorrow = today + average daily change. Every other model should beat this. |
| Linear Trend (1Y) | Straight line fitted to the last year |
| Holt Exponential Smoothing | Smoothed level + damped trend, parameters picked by grid search |
| ARIMA (p,1,0) | Autoregression on daily log-returns |
| Random Forest | 200 trees on lagged returns + rolling mean/volatility features |
| Gradient Boosting | Boosted trees on the same features |
| Weighted Ensemble | Blend of the selected models, weight ∝ 1 / backtest RMSE |

All models work on log-prices, so forecasts never go negative. Confidence bands come from each model's real one-day backtest errors, widened by √(days ahead).

---

## Setup on your Mac (step by step)

You need **Python 3.9+** and **Node 18** (Node 18.20.8 via nvm works on older Macs).

### 1. Put the project in your home folder
Unzip it so you have `~/stock-forecaster` with `backend/` and `frontend/` inside.

### 2. Start the backend (Terminal window 1)
```bash
cd ~/stock-forecaster/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Leave this window open. To check it, open `localhost:8000/docs` in your browser (this only works on the computer running the app).

### 3. Start the frontend (Terminal window 2)
```bash
cd ~/stock-forecaster/frontend
nvm use 18
npm install
npm run dev
```
Open `localhost:5173` in your browser (this only works on the computer running the app).

### Next time
You don't need to install again. Use the two scripts:
```bash
~/stock-forecaster/start-backend.sh     # window 1
~/stock-forecaster/start-frontend.sh    # window 2
```

---

## Deploying online (free, on Render)
The `Dockerfile` builds the React site and runs it together with the FastAPI backend in a single service.

1. Sign in at https://render.com with GitHub.
2. Click **New → Web Service** and pick this repository.
3. Render detects the Dockerfile. Choose the **Free** instance type and click **Create Web Service**.
4. After about 5–10 minutes the app is live at `https://<service-name>.onrender.com`.

Note: Yahoo Finance sometimes limits requests from cloud servers. If a ticker fails on the live site, wait a minute and retry, or use the CSV upload option.

## Using a CSV instead of Yahoo
Choose **Upload CSV** in the app. The file needs a `Date` column and a `Close` column. `Open`, `High`, `Low`, `Adj Close` and `Volume` are optional. NSE bhavcopy-style headers such as `Close Price` and `Total Traded Quantity` are also recognised.

A test file is included: `sample_data/DEMO_SYNTHETIC.csv`. It contains synthetic prices, not a real stock.

## Troubleshooting
| Problem | Fix |
|---|---|
| "API offline" badge in the app | The backend isn't running. Start it (step 2). |
| "No data found" | Indian stocks need `.NS` (NSE) or `.BO` (BSE). Check your internet connection. |
| Yahoo download fails or is rate-limited | Wait a minute, run `pip install -U yfinance`, or use the CSV option. |
| `npm run dev` crashes | Run `nvm use 18`. Newer Node versions don't run on older macOS. |
| Fan gets loud | Untick Random Forest / Gradient Boosting, or use a shorter date range. |

## Project structure
```
stock-forecaster/
├── backend/
│   ├── main.py          # FastAPI routes: /api/forecast, /api/forecast/csv, /api/models, /api/health
│   ├── data.py          # Yahoo Finance download + CSV parsing/cleaning
│   ├── forecasting.py   # The 6 models
│   ├── engine.py        # Backtest, refit, ensemble, confidence bands, report
│   ├── analysis.py      # Indicators, risk stats, signals, distributions
│   └── requirements.txt
├── frontend/
│   ├── src/App.jsx              # Layout, tabs, KPIs, summary
│   ├── src/components/InputPanel.jsx
│   ├── src/components/Charts.jsx
│   ├── src/components/Report.jsx
│   ├── src/utils.js             # API calls, formatting, colours
│   └── src/styles.css
└── sample_data/DEMO_SYNTHETIC.csv
```

## Disclaimer
This project is for learning only and is not financial advice. Daily stock prices are close to random, so a model that can't beat the random-walk baseline in the backtest shouldn't be trusted.
