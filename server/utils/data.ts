import YahooFinance from 'yahoo-finance2'
import type { OHLCVBar } from '~/types'

interface CacheEntry {
  data: OHLCVBar[]
  expiresAt: number
}

const yf = new YahooFinance()
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15 * 60 * 1000

// Maps human-readable period strings to number of calendar days to look back
const PERIOD_TO_DAYS: Record<string, number> = {
  '1d':  1,
  '5d':  5,
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y':  365,
  '2y':  730,
  '5y':  1825,
}

// Allows: AAPL, CUAN, BRK-B, CUAN.JK, AAPL.US (1-10 alphanum chars, optional .EXCHANGE)
const TICKER_RE = /^[A-Za-z0-9-]{1,10}(\.[A-Za-z]{1,6})?$/

function normalizeTicker(ticker: string): string {
  // If no exchange suffix present, assume IDX stock and append .JK
  return ticker.includes('.') ? ticker : `${ticker}.JK`
}

export async function fetchOHLCV(ticker: string, period: string): Promise<OHLCVBar[]> {
  const trimmed = ticker.trim()

  if (!trimmed) {
    throw new Error('fetchOHLCV: ticker must not be empty')
  }
  if (!TICKER_RE.test(trimmed)) {
    throw new Error(
      `fetchOHLCV: invalid ticker format "${trimmed}" — expected alphanumeric symbols like AAPL, CUAN, or CUAN.JK`,
    )
  }

  const days = PERIOD_TO_DAYS[period]
  if (days === undefined) {
    throw new Error(
      `fetchOHLCV: unsupported period "${period}" — valid values: ${Object.keys(PERIOD_TO_DAYS).join(', ')}`,
    )
  }

  const symbol = normalizeTicker(trimmed)
  const cacheKey = `${symbol}_${period}`
  const now = Date.now()

  const cached = cache.get(cacheKey)
  if (cached && now < cached.expiresAt) {
    return cached.data
  }

  const period1 = new Date(now - days * 24 * 60 * 60 * 1000)

  // period2 must be explicit — yahoo-finance2 v3 maps historical → chart internally
  // and ChartOptions validation fails when period2 is left undefined (AJV rejects it)
  const rows = await yf
    .historical(symbol, { period1, period2: new Date(), events: 'history' as const })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`fetchOHLCV: yahoo-finance2 failed for "${symbol}": ${message}`)
    })

  if (!rows || rows.length === 0) {
    throw new Error(
      `fetchOHLCV: no data returned for "${symbol}" over period "${period}" — ticker may be delisted or invalid`,
    )
  }

  const bars: OHLCVBar[] = rows
    .map((row) => ({
      date:   row.date,
      open:   row.open,
      high:   row.high,
      low:    row.low,
      close:  row.close,
      volume: row.volume,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  cache.set(cacheKey, { data: bars, expiresAt: now + CACHE_TTL_MS })

  return bars
}
