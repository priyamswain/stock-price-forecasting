import React, { useEffect, useMemo, useState } from 'react'
import InputPanel from './components/InputPanel.jsx'
import {
  BacktestChart, DistributionChart, DrawdownChart, ForecastChart, MacdChart,
  PriceIndicatorChart, RsiChart, VolumeChart,
} from './components/Charts.jsx'
import { Card, ForecastTable, Kpi, ModelTable, MonthlyHeatmap, Signals, StatsGrid } from './components/Report.jsx'
import { API, MODEL_COLORS, checkHealth, downloadFile, fmtDate, fmtMoney, fmtPct, isoDate, runForecast } from './utils.js'

const FALLBACK_CATALOG = [
  { key: 'drift', name: 'Random Walk + Drift', description: 'Baseline: today + average daily change.' },
  { key: 'trend', name: 'Linear Trend (1Y)', description: 'Straight-line trend over the last year.' },
  { key: 'holt', name: 'Holt Exponential Smoothing', description: 'Smoothed level + damped trend.' },
  { key: 'arima', name: 'ARIMA (p,1,0)', description: 'Autoregression on daily returns.' },
  { key: 'rf', name: 'Random Forest', description: 'Trees learning from recent returns.' },
  { key: 'gb', name: 'Gradient Boosting', description: 'Boosted trees on recent returns.' },
]

const TABS = [
  { key: 'forecast', label: 'Forecast' },
  { key: 'models', label: 'Model comparison' },
  { key: 'technicals', label: 'Technicals' },
  { key: 'risk', label: 'Risk & returns' },
  { key: 'table', label: 'Forecast table' },
]

const LOOKBACKS = [
  { label: '3M', n: 63 }, { label: '6M', n: 126 }, { label: '1Y', n: 252 }, { label: 'All', n: 0 },
]

const STEPS = ['Downloading price history', 'Backtesting models on hidden data', 'Refitting on full history', 'Computing indicators & risk']

function defaultForm() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(end.getFullYear() - 3)
  return {
    source: 'yahoo', ticker: 'RELIANCE.NS', file: null, useCsvDates: false,
    start: isoDate(start), end: isoDate(end),
    horizon: 30, testDays: 30, lags: 10, confidence: '0.95', priceField: 'Close',
    riskFree: 6.5, currency: '',
    models: FALLBACK_CATALOG.map((m) => m.key),
  }
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented small">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Loading() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="state">
      <div className="spinner big" />
      <h2>Running the forecast…</h2>
      <ul className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>{s}</li>
        ))}
      </ul>
      <p className="muted">Usually 10–40 seconds on an older laptop.</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="state">
      <div className="hero-mark">◆</div>
      <h2>Forecast any stock in a few clicks</h2>
      <p className="muted">Pick a ticker or upload a CSV, choose your settings on the left, then press <strong>Run forecast</strong>.</p>
      <div className="feature-grid">
        <div><strong>6 models + ensemble</strong><span>Baseline, trend, Holt, ARIMA, Random Forest, Gradient Boosting</span></div>
        <div><strong>Honest backtesting</strong><span>Models are graded on days they never saw</span></div>
        <div><strong>Technical analysis</strong><span>SMA, EMA, Bollinger Bands, RSI, MACD, volume</span></div>
        <div><strong>Risk report</strong><span>Sharpe, Sortino, drawdown, VaR, monthly returns</span></div>
      </div>
    </div>
  )
}

function Insight({ result, model, cur }) {
  const s = result.stats
  const m = model.summary
  const baseline = result.models.find((x) => x.key === 'drift')
  const beats = baseline && model.key !== 'drift' ? model.metrics.rmse < baseline.metrics.rmse : null
  return (
    <div className="insight">
      <strong>Summary.</strong>{' '}
      {result.meta.name} last closed at {fmtMoney(s.last_price, cur)}. Over the next {result.meta.horizon} trading days,{' '}
      <span style={{ color: MODEL_COLORS[model.key] }}>{model.name}</span> projects{' '}
      <strong>{fmtMoney(m.final_price, cur)}</strong> ({fmtPct(m.expected_return_pct, 2, true)}), with a{' '}
      {Math.round(result.meta.confidence * 100)}% range of {fmtMoney(m.final_lower, cur)} – {fmtMoney(m.final_upper, cur)}.
      In the {result.meta.test_days}-day backtest it was off by {fmtPct(model.metrics.mape)} on average
      {beats === null ? '.' : beats ? ', beating the random-walk baseline.' : ', and did not beat the random-walk baseline — treat the forecast with extra caution.'}
      {' '}The stock's annual volatility is {fmtPct(s.annual_volatility_pct, 1)}, so wide bands are normal.
    </div>
  )
}

export default function App() {
  const [form, setForm] = useState(defaultForm)
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG)
  const [api, setApi] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('forecast')
  const [selected, setSelected] = useState(null)
  const [compare, setCompare] = useState(false)
  const [showBand, setShowBand] = useState(true)
  const [lookback, setLookback] = useState(252)
  const [techRange, setTechRange] = useState(252)
  const [ind, setInd] = useState({ sma20: true, sma50: true, sma200: true, ema20: false, bb: true })

  useEffect(() => {
    const ping = () => checkHealth().then(setApi)
    ping()
    const id = setInterval(ping, 15000)
    fetch(`${API}/api/models`).then((r) => (r.ok ? r.json() : null)).then((c) => { if (c) setCatalog(c) }).catch(() => {})
    return () => clearInterval(id)
  }, [])

  const run = async () => {
    setLoading(true); setError('')
    try {
      const r = await runForecast(form)
      setResult(r); setSelected(r.best_model); setTab('forecast')
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const cur = result ? result.meta.currency : ''
  const model = result ? result.models.find((m) => m.key === selected) || result.models[0] : null
  const techData = useMemo(() => (result ? (techRange ? result.history.slice(-techRange) : result.history) : []), [result, techRange])
  const ddData = useMemo(() => (result ? result.history.map((h) => ({ date: h.date, drawdown: h.drawdown })) : []), [result])
  const hasVolume = result && result.history.some((h) => h.volume)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◆</span> StockCast <span className="brand-sub">Price Forecasting Studio</span></div>
        <div className={'api ' + (api === null ? '' : api ? 'ok' : 'bad')}>
          <span className="api-dot" />{api === null ? 'Checking API…' : api ? 'API connected' : 'Server waking up or offline — retrying…'}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <InputPanel form={form} setForm={setForm} catalog={catalog} onRun={run} loading={loading} />
        </aside>

        <main className="main">
          {error && <div className="alert"><strong>Could not run the forecast.</strong> {error}</div>}

          {loading ? <Loading /> : !result ? <EmptyState /> : (
            <>
              <div className="result-head">
                <div>
                  <div className="ticker-line">
                    <h1>{result.meta.name}</h1>
                    <span className="tag mono">{result.meta.ticker}</span>
                    {result.meta.exchange && <span className="tag">{result.meta.exchange}</span>}
                    {result.meta.sector && <span className="tag">{result.meta.sector}</span>}
                  </div>
                  <div className="meta-line">
                    {result.meta.source} · {fmtDate(result.stats.start_date)} → {fmtDate(result.stats.end_date)} ·{' '}
                    {result.stats.trading_days} trading days · trained on {result.meta.train_days}, tested on {result.meta.test_days} ·{' '}
                    {result.meta.compute_seconds}s
                  </div>
                </div>
                <div className="price-box">
                  <div className="price">{fmtMoney(result.stats.last_price, cur)}</div>
                  <div className="changes">
                    <span className={result.stats.change_1d_pct >= 0 ? 'up' : 'down'}>1D {fmtPct(result.stats.change_1d_pct, 2, true)}</span>
                    <span className={result.stats.change_1m_pct >= 0 ? 'up' : 'down'}>1M {fmtPct(result.stats.change_1m_pct, 2, true)}</span>
                  </div>
                </div>
              </div>

              <div className="kpi-row">
                <Kpi label={`Forecast in ${result.meta.horizon} days`} value={fmtMoney(model.summary.final_price, cur)}
                  sub={fmtDate(model.forecast[model.forecast.length - 1].date)} />
                <Kpi label="Expected return" value={fmtPct(model.summary.expected_return_pct, 2, true)}
                  tone={model.summary.expected_return_pct >= 0 ? 'up' : 'down'} sub="vs last close" />
                <Kpi label={`${Math.round(result.meta.confidence * 100)}% range`}
                  value={`${fmtMoney(model.summary.final_lower, cur, 0)} – ${fmtMoney(model.summary.final_upper, cur, 0)}`} sub="at horizon" />
                <Kpi label="Chance of ending higher" value={fmtPct(model.summary.prob_up_pct, 0)} sub="from error spread" />
                <Kpi label="Backtest error (MAPE)" value={fmtPct(model.metrics.mape)} sub={`Direction hit ${fmtPct(model.metrics.direction_accuracy, 0)}`} />
                <Kpi label="Model" value={<span style={{ color: MODEL_COLORS[model.key] }}>{model.name}</span>}
                  sub={model.key === result.best_model ? 'Best in backtest' : `Rank #${model.rank}`} />
              </div>

              <Insight result={result} model={model} cur={cur} />

              <nav className="tabs">
                {TABS.map((t) => (
                  <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
                ))}
                <div className="tabs-right">
                  <label className="inline-select">Model
                    <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                      {result.models.map((m) => <option key={m.key} value={m.key}>{m.name}{m.key === result.best_model ? ' ★' : ''}</option>)}
                    </select>
                  </label>
                </div>
              </nav>

              {tab === 'forecast' && (
                <div className="stack">
                  <Card title="Price forecast" subtitle="Actual history, the model's path and its confidence band."
                    actions={<>
                      <Segmented value={lookback} onChange={setLookback} options={LOOKBACKS.map((l) => ({ label: l.label, value: l.n }))} />
                      <label className="check"><input type="checkbox" checked={showBand} onChange={(e) => setShowBand(e.target.checked)} /> Band</label>
                      <label className="check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> All models</label>
                    </>}>
                    <ForecastChart result={result} cur={cur} lookback={lookback} showBand={showBand}
                      modelKeys={compare ? [model.key, ...result.models.filter((m) => m.key !== model.key).map((m) => m.key)] : [model.key]} />
                  </Card>
                  <Signals signals={result.signals} />
                </div>
              )}

              {tab === 'models' && (
                <div className="stack">
                  <Card title="Model leaderboard" subtitle={`Ranked by RMSE on the last ${result.meta.test_days} days, which no model saw during training. Click a row to select it.`}>
                    <ModelTable models={result.models} best={result.best_model} selected={model.key} onSelect={setSelected} cur={cur} />
                  </Card>
                  <Card title="Backtest: predicted vs actual" subtitle={`Each model forecasts the hidden window from ${fmtDate(result.meta.backtest_start)} in one go.`}>
                    <BacktestChart result={result} cur={cur} modelKeys={result.models.map((m) => m.key)} />
                  </Card>
                  {result.models.find((m) => m.weights) && (
                    <Card title="Ensemble weights" subtitle="Better backtest accuracy earns a bigger share (weight ∝ 1 / RMSE).">
                      <div className="weights">
                        {Object.entries(result.models.find((m) => m.weights).weights).map(([k, w]) => (
                          <div className="weight" key={k}>
                            <span className="weight-name"><span className="dot" style={{ background: MODEL_COLORS[k] }} />{result.models.find((m) => m.key === k)?.name}</span>
                            <div className="weight-bar"><div style={{ width: w + '%', background: MODEL_COLORS[k] }} /></div>
                            <span className="num">{fmtPct(w, 1)}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {tab === 'technicals' && (
                <div className="stack">
                  <Card title="Price & moving averages"
                    actions={<>
                      <Segmented value={techRange} onChange={setTechRange} options={LOOKBACKS.map((l) => ({ label: l.label, value: l.n }))} />
                      {[['sma20', 'SMA20'], ['sma50', 'SMA50'], ['sma200', 'SMA200'], ['ema20', 'EMA20'], ['bb', 'Bollinger']].map(([k, l]) => (
                        <label key={k} className="check"><input type="checkbox" checked={ind[k]} onChange={(e) => setInd({ ...ind, [k]: e.target.checked })} /> {l}</label>
                      ))}
                    </>}>
                    <PriceIndicatorChart data={techData} cur={cur} show={ind} />
                    {hasVolume && <VolumeChart data={techData} />}
                  </Card>
                  <div className="grid2">
                    <Card title="RSI (14)" subtitle="Above 70 = overbought, below 30 = oversold."><RsiChart data={techData} /></Card>
                    <Card title="MACD (12, 26, 9)" subtitle="MACD crossing above its signal line is a bullish sign."><MacdChart data={techData} /></Card>
                  </div>
                </div>
              )}

              {tab === 'risk' && (
                <div className="stack">
                  <StatsGrid s={result.stats} cur={cur} />
                  <div className="grid2">
                    <Card title="Drawdown from peak" subtitle="How far the price was below its previous high."><DrawdownChart data={ddData} /></Card>
                    <Card title="Daily return distribution" subtitle="How often each size of daily move happened."><DistributionChart data={result.distribution} var95={result.stats.var95_pct} /></Card>
                  </div>
                  <Card title="Monthly returns (%)"><MonthlyHeatmap monthly={result.monthly} /></Card>
                </div>
              )}

              {tab === 'table' && (
                <div className="stack">
                  <ForecastTable model={model} lastPrice={result.stats.last_price} cur={cur} ticker={result.meta.ticker} />
                  <div className="row-end">
                    <button className="btn-ghost" onClick={() => downloadFile(`${result.meta.ticker}_full_report.json`, JSON.stringify(result, null, 2), 'application/json')}>
                      Download full report (JSON)
                    </button>
                  </div>
                </div>
              )}

              <p className="disclaimer">
                For education only. Stock prices are hard to predict, and no model here is financial advice.
                Always compare against the random-walk baseline before trusting a forecast.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
