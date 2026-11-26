import React from 'react'
import { MODEL_COLORS, MONTH_NAMES, downloadFile, fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct } from '../utils.js'

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={'card ' + className}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={'kpi-value ' + (tone || '')}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

const tone = (v) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '')

/* ---------------- Model leaderboard ---------------- */
export function ModelTable({ models, best, selected, onSelect, cur }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th><th>Model</th>
            <th title="Mean absolute error over the backtest">MAE</th>
            <th title="Root mean squared error. Lower is better; used for ranking.">RMSE</th>
            <th title="Mean absolute percentage error">MAPE</th>
            <th title="Error of next-day predictions (model sees each real day before predicting the next)">1-day MAPE</th>
            <th title="How often the next-day prediction got the up/down direction right">Direction hit</th>
            <th title="RMSE improvement over the random-walk baseline">vs baseline</th>
            <th>Forecast end</th><th>Exp. return</th><th>P(up)</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.key} className={(m.key === selected ? 'selected ' : '') + 'clickable'} onClick={() => onSelect(m.key)}>
              <td className="muted">{m.rank}</td>
              <td>
                <span className="dot" style={{ background: MODEL_COLORS[m.key] }} />
                {m.name}
                {m.key === best && <span className="badge">Best</span>}
              </td>
              <td className="num">{fmtMoney(m.metrics.mae, cur)}</td>
              <td className="num">{fmtMoney(m.metrics.rmse, cur)}</td>
              <td className="num">{fmtPct(m.metrics.mape)}</td>
              <td className="num">{fmtPct(m.metrics.one_step_mape)}</td>
              <td className="num">{fmtPct(m.metrics.direction_accuracy, 1)}</td>
              <td className={'num ' + tone(m.vs_baseline_pct)}>{m.key === 'drift' ? '—' : fmtPct(m.vs_baseline_pct, 1, true)}</td>
              <td className="num">{fmtMoney(m.summary.final_price, cur)}</td>
              <td className={'num ' + tone(m.summary.expected_return_pct)}>{fmtPct(m.summary.expected_return_pct, 2, true)}</td>
              <td className="num">{fmtPct(m.summary.prob_up_pct, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- Forecast table ---------------- */
export function ForecastTable({ model, lastPrice, cur, ticker }) {
  const download = () => {
    const lines = ['date,predicted,lower,upper,change_pct']
    model.forecast.forEach((r) => {
      lines.push([r.date, r.pred, r.lower, r.upper, ((r.pred / lastPrice - 1) * 100).toFixed(3)].join(','))
    })
    downloadFile(`${ticker}_${model.key}_forecast.csv`, lines.join('\n'))
  }
  return (
    <Card title={`Day-by-day forecast · ${model.name}`} subtitle="Business days; exchange holidays are not removed."
      actions={<button className="btn-ghost" onClick={download}>Download CSV</button>}>
      <div className="table-wrap tall">
        <table className="table">
          <thead><tr><th>Day</th><th>Date</th><th>Predicted</th><th>Lower</th><th>Upper</th><th>Change vs today</th></tr></thead>
          <tbody>
            {model.forecast.map((r, i) => {
              const ch = (r.pred / lastPrice - 1) * 100
              return (
                <tr key={r.date}>
                  <td className="muted">{i + 1}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td className="num strong">{fmtMoney(r.pred, cur)}</td>
                  <td className="num muted">{fmtMoney(r.lower, cur)}</td>
                  <td className="num muted">{fmtMoney(r.upper, cur)}</td>
                  <td className={'num ' + tone(ch)}>{fmtPct(ch, 2, true)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Signals ---------------- */
export function Signals({ signals }) {
  const score = signals.reduce((s, x) => s + (x.verdict === 'bullish' ? 1 : x.verdict === 'bearish' ? -1 : 0), 0)
  const overall = score > 1 ? 'bullish' : score < -1 ? 'bearish' : 'neutral'
  return (
    <Card title="Signal summary" subtitle="Rule-based reading of the latest indicators and the forecast."
      actions={<span className={'pill ' + overall}>Overall: {overall}</span>}>
      <div className="signals">
        {signals.map((s) => (
          <div className="signal" key={s.name}>
            <div className="signal-top">
              <span className="signal-name">{s.name}</span>
              <span className={'pill small ' + s.verdict}>{s.verdict}</span>
            </div>
            <div className="signal-value">{s.value}</div>
            <div className="signal-detail">{s.detail}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ---------------- Risk statistics grid ---------------- */
export function StatsGrid({ s, cur }) {
  const items = [
    ['Total return', fmtPct(s.total_return_pct, 2, true), tone(s.total_return_pct), `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`],
    ['CAGR', fmtPct(s.cagr_pct, 2, true), tone(s.cagr_pct), 'Compound annual growth'],
    ['Annual volatility', fmtPct(s.annual_volatility_pct), '', `Daily ${fmtPct(s.daily_volatility_pct)}`],
    ['Sharpe ratio', fmtNum(s.sharpe), tone(s.sharpe), `Risk-free ${s.risk_free_pct}%`],
    ['Sortino ratio', fmtNum(s.sortino), tone(s.sortino), 'Penalises only downside'],
    ['Calmar ratio', fmtNum(s.calmar), tone(s.calmar), 'CAGR ÷ max drawdown'],
    ['Max drawdown', fmtPct(s.max_drawdown_pct), 'down', `${fmtDate(s.max_drawdown_peak)} → ${fmtDate(s.max_drawdown_trough)}`],
    ['Current drawdown', fmtPct(s.current_drawdown_pct), s.current_drawdown_pct < -0.01 ? 'down' : '', 'From all-time high in range'],
    ['VaR 95% (1 day)', fmtPct(s.var95_pct), '', `CVaR ${fmtPct(s.cvar95_pct)} · VaR 99% ${fmtPct(s.var99_pct)}`],
    ['52-week range', `${fmtMoney(s.low_52w, cur, 0)} – ${fmtMoney(s.high_52w, cur, 0)}`, '', 'Low – high'],
    ['Best day', fmtPct(s.best_day_pct, 2, true), 'up', fmtDate(s.best_day)],
    ['Worst day', fmtPct(s.worst_day_pct, 2, true), 'down', fmtDate(s.worst_day)],
    ['Positive days', fmtPct(s.positive_days_pct, 1), '', `${s.trading_days} trading days`],
    ['Skew / kurtosis', `${fmtNum(s.skewness)} / ${fmtNum(s.kurtosis)}`, '', 'Shape of daily returns'],
    ['Avg volume (1Y)', s.avg_volume ? fmtCompact(s.avg_volume) : '—', '', 'Shares per day'],
  ]
  return (
    <div className="stats-grid">
      {items.map(([label, value, t, sub]) => <Kpi key={label} label={label} value={value} tone={t} sub={sub} />)}
    </div>
  )
}

/* ---------------- Monthly returns heatmap ---------------- */
function heat(v) {
  if (v == null) return 'transparent'
  const a = Math.min(Math.abs(v) / 10, 1) * 0.75 + 0.08
  return v >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`
}

export function MonthlyHeatmap({ monthly }) {
  const years = [...new Set(monthly.map((m) => m.year))].sort()
  const map = {}
  monthly.forEach((m) => { map[`${m.year}-${m.month}`] = m.return_pct })
  return (
    <div className="table-wrap">
      <table className="heatmap">
        <thead>
          <tr><th>Year</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}<th>Year</th></tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const vals = MONTH_NAMES.map((_, i) => map[`${y}-${i + 1}`])
            const yr = vals.reduce((acc, v) => (v == null ? acc : acc * (1 + v / 100)), 1)
            const yrPct = (yr - 1) * 100
            return (
              <tr key={y}>
                <td className="muted">{y}</td>
                {vals.map((v, i) => (
                  <td key={i} style={{ background: heat(v) }}>{v == null ? '' : v.toFixed(1)}</td>
                ))}
                <td className="strong" style={{ background: heat(yrPct / 3) }}>{yrPct.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
