// Shared helpers: colours, number formatting, API calls.

// Backend address. Empty locally (Vite forwards /api to port 8000).
// For GitHub Pages it comes from frontend/.env.production.
export const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

// Fixed colour per model (validated for colour-blind separation on the dark surface).
export const MODEL_COLORS = {
  drift: '#338ced',
  trend: '#e76624',
  holt: '#00a888',
  arima: '#d28e05',
  rf: '#e24d8b',
  gb: '#0aac23',
  ensemble: '#9887ef',
}

export const PRICE_COLOR = '#e8ecf2'
export const AXIS = { fill: '#8a94a6', fontSize: 11 }
export const GRID = '#232b39'

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', HKD: 'HK$', AUD: 'A$', CAD: 'C$', SGD: 'S$' }

export function currencySymbol(code) {
  if (!code) return ''
  const c = String(code).toUpperCase()
  return SYMBOLS[c] || (c.length === 3 ? c + ' ' : code)
}

export function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtMoney(v, cur, digits = 2) {
  if (v === null || v === undefined) return '—'
  return currencySymbol(cur) + fmtNum(v, digits)
}

export function fmtPct(v, digits = 2, sign = false) {
  if (v === null || v === undefined) return '—'
  const s = sign && v > 0 ? '+' : ''
  return s + fmtNum(v, digits) + '%'
}

export function fmtCompact(v) {
  if (v === null || v === undefined) return '—'
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_NAMES = MONTHS

export function fmtDate(iso, withYear = true) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${withYear ? ' ' + y.slice(2) : ''}`
}

export function isoDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}

export function downloadFile(name, content, type = 'text/csv') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function handle(res) {
  let data = null
  try { data = await res.json() } catch (e) { /* ignore */ }
  if (!res.ok) {
    let msg = `Server error (${res.status})`
    if (data && data.detail) {
      msg = Array.isArray(data.detail)
        ? data.detail.map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join('; ')
        : data.detail
    }
    throw new Error(msg)
  }
  return data
}

export async function checkHealth() {
  try {
    const r = await fetch(`${API}/api/health`)
    return r.ok
  } catch (e) {
    return false
  }
}

export async function runForecast(form) {
  const common = {
    horizon: Number(form.horizon),
    test_days: Number(form.testDays),
    lags: Number(form.lags),
    confidence: Number(form.confidence),
    price_field: form.priceField,
    risk_free: Number(form.riskFree),
    currency: form.currency || null,
  }
  if (form.source === 'yahoo') {
    const res = await fetch(`${API}/api/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...common,
        ticker: form.ticker,
        start_date: form.start,
        end_date: form.end,
        models: form.models,
      }),
    })
    return handle(res)
  }
  const fd = new FormData()
  fd.append('file', form.file)
  Object.entries(common).forEach(([k, v]) => { if (v !== null) fd.append(k, v) })
  fd.append('models', form.models.join(','))
  if (form.useCsvDates) {
    fd.append('start_date', form.start)
    fd.append('end_date', form.end)
  }
  const res = await fetch(`${API}/api/forecast/csv`, { method: 'POST', body: fd })
  return handle(res)
}
