import React, { useRef } from 'react'
import { MODEL_COLORS, isoDate } from '../utils.js'

const QUICK_TICKERS = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', '^NSEI', 'AAPL', 'MSFT', 'NVDA']

const RANGES = [
  { label: '1Y', years: 1 },
  { label: '2Y', years: 2 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
]

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint" title={hint}>?</span>}
      </span>
      {children}
    </label>
  )
}

function Slider({ value, min, max, step = 1, onChange, suffix }) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="slider-num" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span className="slider-suffix">{suffix}</span>}
    </div>
  )
}

export default function InputPanel({ form, setForm, catalog, onRun, loading }) {
  const fileRef = useRef(null)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setE = (k) => (e) => set(k)(e.target.value)

  const setRange = (years) => {
    const end = new Date()
    const start = new Date()
    start.setFullYear(end.getFullYear() - years)
    setForm((f) => ({ ...f, start: isoDate(start), end: isoDate(end) }))
  }

  const toggleModel = (key) =>
    setForm((f) => ({
      ...f,
      models: f.models.includes(key) ? f.models.filter((m) => m !== key) : [...f.models, key],
    }))

  const selectable = catalog.filter((m) => m.key !== 'ensemble')
  const canRun = !loading && form.models.length > 0 &&
    (form.source === 'yahoo' ? form.ticker.trim() : form.file)

  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); if (canRun) onRun() }}>
      <section className="panel-section">
        <h3 className="panel-title">1 · Data source</h3>
        <div className="segmented">
          <button type="button" className={form.source === 'yahoo' ? 'active' : ''}
            onClick={() => set('source')('yahoo')}>Ticker (Yahoo)</button>
          <button type="button" className={form.source === 'csv' ? 'active' : ''}
            onClick={() => set('source')('csv')}>Upload CSV</button>
        </div>

        {form.source === 'yahoo' ? (
          <>
            <Field label="Ticker symbol" hint="Indian stocks need .NS (NSE) or .BO (BSE). Indices start with ^, e.g. ^NSEI for Nifty 50.">
              <input className="input mono" value={form.ticker} placeholder="e.g. RELIANCE.NS"
                onChange={(e) => set('ticker')(e.target.value.toUpperCase())} />
            </Field>
            <div className="chips">
              {QUICK_TICKERS.map((t) => (
                <button type="button" key={t} className={'chip' + (form.ticker === t ? ' active' : '')}
                  onClick={() => set('ticker')(t)}>{t}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="dropzone" onClick={() => fileRef.current && fileRef.current.click()}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
                onChange={(e) => set('file')(e.target.files[0] || null)} />
              {form.file ? (
                <><strong>{form.file.name}</strong><span>{(form.file.size / 1024).toFixed(1)} KB · click to change</span></>
              ) : (
                <><strong>Choose a CSV file</strong><span>Needs Date and Close columns (Open, High, Low, Volume optional)</span></>
              )}
            </div>
            <label className="check">
              <input type="checkbox" checked={form.useCsvDates}
                onChange={(e) => set('useCsvDates')(e.target.checked)} />
              Filter the file to the date range below
            </label>
          </>
        )}
      </section>

      <section className="panel-section">
        <h3 className="panel-title">2 · History window</h3>
        <div className="chips">
          {RANGES.map((r) => (
            <button type="button" key={r.label} className="chip" onClick={() => setRange(r.years)}>{r.label}</button>
          ))}
        </div>
        <div className="row2">
          <Field label="Start date"><input type="date" className="input" value={form.start} onChange={setE('start')} /></Field>
          <Field label="End date"><input type="date" className="input" value={form.end} onChange={setE('end')} /></Field>
        </div>
      </section>

      <section className="panel-section">
        <h3 className="panel-title">3 · Forecast settings</h3>
        <Field label="Forecast horizon" hint="How many trading days into the future to predict.">
          <Slider value={form.horizon} min={1} max={180} onChange={set('horizon')} suffix="days" />
        </Field>
        <Field label="Backtest window" hint="The last N days are hidden from the models, then used to grade their accuracy.">
          <Slider value={form.testDays} min={5} max={250} onChange={set('testDays')} suffix="days" />
        </Field>
        <Field label="Lag window" hint="How many past daily returns ARIMA, Random Forest and Gradient Boosting look at.">
          <Slider value={form.lags} min={2} max={30} onChange={set('lags')} suffix="lags" />
        </Field>
        <div className="row2">
          <Field label="Confidence band">
            <select className="input" value={form.confidence} onChange={setE('confidence')}>
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
              <option value="0.95">95%</option>
              <option value="0.99">99%</option>
            </select>
          </Field>
          <Field label="Price field" hint="Adj Close accounts for dividends and splits.">
            <select className="input" value={form.priceField} onChange={setE('priceField')}>
              <option value="Close">Close</option>
              <option value="Adj Close">Adj Close</option>
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Risk-free rate %" hint="Used for Sharpe and Sortino ratios. ~6.5% for India, ~4% for the US.">
            <input type="number" step="0.1" min="0" max="30" className="input" value={form.riskFree} onChange={setE('riskFree')} />
          </Field>
          <Field label="Currency" hint="Leave blank to detect automatically (e.g. INR, USD).">
            <input className="input mono" maxLength={4} placeholder="auto" value={form.currency}
              onChange={(e) => set('currency')(e.target.value.toUpperCase())} />
          </Field>
        </div>
      </section>

      <section className="panel-section">
        <h3 className="panel-title">4 · Models <span className="muted">({form.models.length} selected)</span></h3>
        <div className="model-list">
          {selectable.map((m) => (
            <label key={m.key} className={'model-item' + (form.models.includes(m.key) ? ' on' : '')} title={m.description}>
              <input type="checkbox" checked={form.models.includes(m.key)} onChange={() => toggleModel(m.key)} />
              <span className="dot" style={{ background: MODEL_COLORS[m.key] }} />
              <span className="model-text">
                <span className="model-name">{m.name}</span>
                <span className="model-desc">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="note">With 2+ models, a weighted ensemble is added automatically.</p>
      </section>

      <div className="panel-footer">
        <button type="submit" className="btn-primary" disabled={!canRun}>
          {loading ? <><span className="spinner" /> Running models…</> : 'Run forecast'}
        </button>
      </div>
    </form>
  )
}
