import React from 'react'
import {
  Area, Bar, BarChart, Cell, ComposedChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AXIS, GRID, MODEL_COLORS, PRICE_COLOR, fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct } from '../utils.js'

const UP = '#22c55e'
const DOWN = '#ef4444'

function ChartTooltip({ active, payload, label, cur, pct }) {
  if (!active || !payload || !payload.length) return null
  const seen = new Set()
  return (
    <div className="tooltip">
      <div className="tooltip-date">{fmtDate(label)}</div>
      {payload.map((p) => {
        if (p.value === null || p.value === undefined || seen.has(p.name)) return null
        seen.add(p.name)
        const v = Array.isArray(p.value)
          ? `${fmtMoney(p.value[0], cur)} – ${fmtMoney(p.value[1], cur)}`
          : pct ? fmtPct(p.value) : cur !== undefined ? fmtMoney(p.value, cur) : fmtNum(p.value)
        return (
          <div className="tooltip-row" key={p.name}>
            <span className="dot" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="tooltip-name">{p.name}</span>
            <span className="tooltip-val">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

const xProps = {
  dataKey: 'date', tick: AXIS, tickLine: false, axisLine: { stroke: GRID },
  minTickGap: 40, tickFormatter: (d) => fmtDate(d),
}
const yProps = (cur) => ({
  tick: AXIS, tickLine: false, axisLine: false, width: 72, domain: ['auto', 'auto'],
  tickFormatter: (v) => (cur !== undefined ? fmtMoney(v, cur, 0) : fmtNum(v, 0)),
})

/* ------------------------------------------------------------------ */
/* Forecast: recent history + forecast line + confidence band          */
/* ------------------------------------------------------------------ */
export function ForecastChart({ result, modelKeys, lookback, cur, showBand }) {
  const hist = lookback ? result.history.slice(-lookback) : result.history
  const last = hist[hist.length - 1]
  const rows = hist.map((h) => ({ date: h.date, close: h.close }))
  const byKey = Object.fromEntries(result.models.map((m) => [m.key, m]))
  const primary = byKey[modelKeys[0]]

  // Join the forecast to the last real price so the lines connect.
  const lastRow = rows[rows.length - 1]
  modelKeys.forEach((k) => { lastRow[k] = last.close })
  if (showBand) lastRow.band = [last.close, last.close]

  primary.forecast.forEach((p, i) => {
    const row = { date: p.date }
    modelKeys.forEach((k) => { row[k] = byKey[k].forecast[i].pred })
    if (showBand) row.band = [p.lower, p.upper]
    rows.push(row)
  })

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRICE_COLOR} stopOpacity={0.12} />
            <stop offset="100%" stopColor={PRICE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis {...yProps(cur)} />
        <Tooltip content={<ChartTooltip cur={cur} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {showBand && (
          <Area type="monotone" dataKey="band" name={`${Math.round(result.meta.confidence * 100)}% band`}
            stroke="none" fill={MODEL_COLORS[modelKeys[0]]} fillOpacity={0.16} isAnimationActive={false} />
        )}
        <Area type="monotone" dataKey="close" name="Actual price" stroke={PRICE_COLOR} strokeWidth={1.6}
          fill="url(#histFill)" dot={false} isAnimationActive={false} />
        {modelKeys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} name={byKey[k].name} stroke={MODEL_COLORS[k]}
            strokeWidth={i === 0 ? 2.4 : 1.6} strokeDasharray={i === 0 ? '0' : '5 4'} dot={false}
            isAnimationActive={false} />
        ))}
        <ReferenceLine x={last.date} stroke="#5b6475" strokeDasharray="3 3"
          label={{ value: 'Today', fill: '#8a94a6', fontSize: 11, position: 'insideTopRight' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Backtest: actual vs each model's prediction on hidden window        */
/* ------------------------------------------------------------------ */
export function BacktestChart({ result, modelKeys, cur }) {
  const ctx = result.history.slice(-(result.backtest_dates.length + 40), -result.backtest_dates.length)
  const rows = ctx.map((h) => ({ date: h.date, actual: h.close }))
  const byKey = Object.fromEntries(result.models.map((m) => [m.key, m]))
  result.backtest_dates.forEach((d, i) => {
    const row = { date: d, actual: result.backtest_actual[i] }
    modelKeys.forEach((k) => { row[k] = byKey[k].backtest[i] })
    rows.push(row)
  })
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis {...yProps(cur)} />
        <Tooltip content={<ChartTooltip cur={cur} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <ReferenceLine x={result.backtest_dates[0]} stroke="#5b6475" strokeDasharray="3 3"
          label={{ value: 'Models stop seeing data', fill: '#8a94a6', fontSize: 11, position: 'insideTopLeft' }} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={PRICE_COLOR} strokeWidth={2.2} dot={false} isAnimationActive={false} />
        {modelKeys.map((k) => (
          <Line key={k} type="monotone" dataKey={k} name={byKey[k].name} stroke={MODEL_COLORS[k]}
            strokeWidth={1.6} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Technical charts                                                    */
/* ------------------------------------------------------------------ */
export function PriceIndicatorChart({ data, cur, show }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} syncId="tech">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis {...yProps(cur)} />
        <Tooltip content={<ChartTooltip cur={cur} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {show.bb && (
          <Area type="monotone" dataKey={(d) => (d.bb_lower != null ? [d.bb_lower, d.bb_upper] : null)}
            name="Bollinger (20, 2)" stroke="none" fill="#338ced" fillOpacity={0.1} isAnimationActive={false} />
        )}
        <Line type="monotone" dataKey="close" name="Price" stroke={PRICE_COLOR} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        {show.sma20 && <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#d28e05" strokeWidth={1.3} dot={false} isAnimationActive={false} />}
        {show.sma50 && <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#00a888" strokeWidth={1.3} dot={false} isAnimationActive={false} />}
        {show.sma200 && <Line type="monotone" dataKey="sma200" name="SMA 200" stroke="#e24d8b" strokeWidth={1.3} dot={false} isAnimationActive={false} />}
        {show.ema20 && <Line type="monotone" dataKey="ema20" name="EMA 20" stroke="#9887ef" strokeWidth={1.3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function VolumeChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="tech">
        <XAxis {...xProps} hide />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={fmtCompact} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="volume" name="Volume" isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={i > 0 && d.close < data[i - 1].close ? DOWN : UP} fillOpacity={0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RsiChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="tech">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={AXIS} tickLine={false} axisLine={false} width={72} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={70} stroke={DOWN} strokeDasharray="3 3" />
        <ReferenceLine y={30} stroke={UP} strokeDasharray="3 3" />
        <Line type="monotone" dataKey="rsi" name="RSI 14" stroke="#9887ef" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function MacdChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} syncId="tech">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => fmtNum(v, 1)} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="#3a4354" />
        <Bar dataKey="macd_hist" name="Histogram" isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={(d.macd_hist || 0) >= 0 ? UP : DOWN} fillOpacity={0.6} />)}
        </Bar>
        <Line type="monotone" dataKey="macd" name="MACD" stroke="#338ced" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="macd_signal" name="Signal" stroke="#e76624" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Risk charts                                                         */
/* ------------------------------------------------------------------ */
export function DrawdownChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DOWN} stopOpacity={0.05} />
            <stop offset="100%" stopColor={DOWN} stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis {...xProps} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={72} tickFormatter={(v) => v.toFixed(0) + '%'} />
        <Tooltip content={<ChartTooltip pct />} />
        <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke={DOWN} strokeWidth={1.2}
          fill="url(#ddFill)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function DistributionChart({ data, var95 }) {
  // Snap the VaR line to the nearest bin so it works on a category axis.
  let varMid = null
  if (var95 != null && data.length) {
    varMid = data.reduce((best, d) => (Math.abs(d.mid + var95) < Math.abs(best.mid + var95) ? d : best), data[0]).mid
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }} barCategoryGap={1}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="mid" tick={AXIS} tickLine={false} minTickGap={24}
          axisLine={{ stroke: GRID }} tickFormatter={(v) => Number(v).toFixed(1) + '%'} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={({ active, payload }) => active && payload && payload.length ? (
            <div className="tooltip">
              <div className="tooltip-date">{fmtPct(payload[0].payload.from)} to {fmtPct(payload[0].payload.to)}</div>
              <div className="tooltip-row"><span className="tooltip-name">Days</span><span className="tooltip-val">{payload[0].value}</span></div>
            </div>
          ) : null} />
        {varMid != null && <ReferenceLine x={varMid} stroke="#d28e05" strokeDasharray="3 3"
          label={{ value: 'VaR 95%', fill: '#d28e05', fontSize: 11, position: 'insideTopLeft' }} />}
        <Bar dataKey="count" name="Days" isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.mid >= 0 ? UP : DOWN} fillOpacity={0.7} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
