import type { AnalysisResult } from '~/types'
import { fetchOHLCV } from '../utils/data'
import { runAnalysis } from '../utils/scorer'

// Default universe — used when no request body is provided.
// Stored without .JK suffix; fetchOHLCV normalises them automatically.
const IDX_TICKERS = [
  'BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII',
  'BYAN', 'TPIA', 'GOTO', 'PGAS', 'ADRO',
  'UNVR', 'INDF', 'CPIN', 'BRPT', 'EMTK',
  'EXCL', 'ISAT', 'KLBF', 'SIDO', 'BUKA',
]

export default defineEventHandler(async (event) => {
  assertMethod(event, 'POST')

  // Attempt to read body; absent body is valid — falls back to IDX_TICKERS
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    body = null
  }

  let tickers: string[]

  if (body === null || body === undefined) {
    tickers = IDX_TICKERS
  } else {
    if (
      typeof body !== 'object' ||
      !('tickers' in (body as object)) ||
      !Array.isArray((body as { tickers: unknown }).tickers)
    ) {
      setResponseStatus(event, 400)
      return { error: 'Request body must be { tickers: string[] }' }
    }

    const raw = (body as { tickers: unknown[] }).tickers
    if (raw.length === 0) {
      setResponseStatus(event, 400)
      return { error: '"tickers" array must not be empty' }
    }
    if (raw.length > 20) {
      setResponseStatus(event, 400)
      return { error: '"tickers" array must contain at most 20 entries' }
    }

    tickers = raw.map(String)
  }

  const results: AnalysisResult[] = []

  for (const ticker of tickers) {
    try {
      const bars = await fetchOHLCV(ticker, '2y')
      const result = runAnalysis(ticker, bars)
      results.push(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[screener] skipping "${ticker}": ${message}`)
    }
  }

  results.sort((a, b) => b.prediction.score - a.prediction.score)

  return { results }
})
