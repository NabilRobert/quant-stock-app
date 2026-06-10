import type { AnalysisResult } from '~/types'
import { fetchOHLCV } from '../utils/data'
import { runAnalysis } from '../utils/scorer'

const TICKER_RE = /^[A-Z0-9.]{1,10}$/i

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const ticker = typeof query.ticker === 'string' ? query.ticker.trim() : ''
  const period = typeof query.period === 'string' ? query.period.trim() : '2y'

  if (!ticker) {
    setResponseStatus(event, 400)
    return { error: 'Query parameter "ticker" is required' }
  }
  if (!TICKER_RE.test(ticker)) {
    setResponseStatus(event, 400)
    return { error: `Invalid ticker format "${ticker}" — must match /^[A-Z0-9.]{1,10}$/i` }
  }

  try {
    const bars = await fetchOHLCV(ticker, period)
    const result: AnalysisResult = runAnalysis(ticker, bars)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isNotFound =
      message.includes('no data returned') || message.includes('delisted')
    setResponseStatus(event, isNotFound ? 404 : 500)
    return { error: message }
  }
})
