import type { AnalysisResult } from '~/types'

const HIGH_VOL          = 60
const MOD_VOL           = 30
const STRONG_HURST_HIGH = 0.65
const STRONG_HURST_LOW  = 0.35

export function generateInterpretation(result: AnalysisResult): string {
  const { ticker, regime, garch, signals, patterns, prediction, closes } = result

  const rsi      = signals.find((s) => s.name === 'RSI')
  const momentum = signals.find((s) => s.name === 'Momentum')
  const macd     = signals.find((s) => s.name === 'MACD')

  // S/R parsing
  const srPat = patterns.find((p) => p.name === 'Support/Resistance')
  let support: number | null    = null
  let resistance: number | null = null
  if (srPat) {
    const mSup = srPat.interpretation.match(/Support:\s*([\d.]+)/)
    const mRes = srPat.interpretation.match(/Resistance:\s*([\d.]+)/)
    if (mSup?.[1]) support    = parseFloat(mSup[1])
    if (mRes?.[1]) resistance = parseFloat(mRes[1])
  }

  // Momentum time window derived from how many closes we have
  const timeWindow =
    closes.length < 63  ? 'month'
    : closes.length < 189 ? '3 months'
    : 'year'

  // These accumulate in priority order; optionals are trimmed last to stay ≤ 6 sentences.
  const sentences: string[] = []
  const optionals: string[] = []

  // ── Sentence 1: regime + vol (plain English, no formula names) ──────────────
  const isStrong = regime.hurst > STRONG_HURST_HIGH || regime.hurst < STRONG_HURST_LOW
  const trendWord =
    prediction.signal === 'BEARISH' ? `${isStrong ? 'strong ' : ''}downtrend`
    : prediction.signal === 'BULLISH' ? `${isStrong ? 'strong ' : ''}uptrend`
    : 'sideways range'

  const regimeDesc =
    regime.regime === 'TREND'  ? `a ${trendWord}`
    : regime.regime === 'REVERT' ? 'a mean-reverting range'
    : 'a directionless market'

  const volDesc =
    garch.volTomorrow > HIGH_VOL
      ? `volatility is unusually high — large moves in either direction are possible (${garch.volTomorrow.toFixed(0)}% annualised)`
      : garch.volTomorrow > MOD_VOL
      ? `volatility is moderate (${garch.volTomorrow.toFixed(0)}% annualised)`
      : `volatility is low — price is moving steadily (${garch.volTomorrow.toFixed(0)}% annualised)`

  sentences.push(`${ticker} has been in ${regimeDesc} and ${volDesc}.`)

  // ── Sentence 2: RSI + actual momentum % ─────────────────────────────────────
  if (rsi && momentum) {
    const rsiVal = rsi.value.toFixed(1)
    const momPct = Math.abs(momentum.value).toFixed(1)
    const momDir = momentum.value >= 0 ? 'gained' : 'lost'

    if (rsi.interpretation === 'OVERSOLD') {
      sentences.push(
        `The stock is deeply oversold (RSI ${rsiVal}) and has ${momDir} ${momPct}% over the past ${timeWindow}.`
      )
    } else if (rsi.interpretation === 'OVERBOUGHT') {
      sentences.push(
        `The stock is overbought (RSI ${rsiVal}) and has ${momDir} ${momPct}% over the past ${timeWindow}.`
      )
    } else {
      sentences.push(
        `RSI is neutral at ${rsiVal} and the stock has ${momDir} ${momPct}% over the past ${timeWindow}.`
      )
    }
  }

  // ── Conflict warnings (high priority — go into sentences, not optionals) ────
  const rsiConflict =
    (prediction.signal === 'BEARISH' && rsi?.interpretation === 'OVERSOLD') ||
    (prediction.signal === 'BULLISH' && rsi?.interpretation === 'OVERBOUGHT')

  const macdConflict =
    (prediction.signal === 'BEARISH' && macd?.interpretation === 'BULLISH CROSSOVER') ||
    (prediction.signal === 'BULLISH' && macd?.interpretation === 'BEARISH CROSSOVER')

  if (rsiConflict) {
    if (prediction.signal === 'BEARISH') {
      sentences.push(
        'Signals are mixed — the stock is oversold which could trigger a short-term bounce, but the broader trend remains negative.'
      )
    } else {
      sentences.push(
        'Signals are mixed — the stock is overbought which may cause a short-term pullback, but the broader trend remains positive.'
      )
    }
  } else if (macdConflict) {
    if (prediction.signal === 'BEARISH') {
      sentences.push(
        'Signals are mixed — short-term momentum is building, but the broader trend remains negative.'
      )
    } else {
      sentences.push(
        'Signals are mixed — short-term momentum is fading despite the broader bullish trend.'
      )
    }
  }

  // ── Lower priority optionals ─────────────────────────────────────────────────

  // MACD alignment (only when it agrees with the signal and no conflict sentence was added)
  if (macd && !macdConflict && !rsiConflict) {
    if (macd.interpretation === 'BULLISH CROSSOVER' && prediction.signal === 'BULLISH') {
      optionals.push('Short-term momentum is building, adding weight to the bullish case.')
    } else if (macd.interpretation === 'BEARISH CROSSOVER' && prediction.signal === 'BEARISH') {
      optionals.push('Short-term momentum is fading, reinforcing the bearish case.')
    }
  }

  // Detected chart patterns (excluding S/R which is handled separately)
  const detectedPatterns = patterns.filter(
    (p) => p.detected && p.name !== 'Support/Resistance'
  )
  if (detectedPatterns.length > 0) {
    const patternText = detectedPatterns.map((p) => {
      const isBull = p.interpretation.startsWith('BULLISH')
      const dir    = isBull ? 'higher' : 'downward'
      const target = p.priceTarget !== null
        ? ` with a price target of ${p.priceTarget.toLocaleString('en-US', { maximumFractionDigits: 0 })} IDR`
        : ''
      return `A ${p.name} pattern has formed, suggesting a potential move ${dir}${target}.`
    }).join(' ')
    optionals.push(patternText)
  }

  // ── Conclusion ───────────────────────────────────────────────────────────────
  const conclusion =
    prediction.signal === 'BULLISH' ? 'The overall outlook is bullish.'
    : prediction.signal === 'BEARISH' ? 'The overall trend remains negative.'
    : 'No strong directional edge is present at this time.'

  // ── S/R levels ───────────────────────────────────────────────────────────────
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const srSentence =
    support !== null && resistance !== null
      ? `Key support at ${fmt(support)} IDR and resistance at ${fmt(resistance)} IDR.`
      : support !== null
      ? `Key support sits at ${fmt(support)} IDR.`
      : resistance !== null
      ? `Key resistance sits at ${fmt(resistance)} IDR.`
      : ''

  // ── Assemble, capped at 6 sentences ──────────────────────────────────────────
  const endSentences = [conclusion, srSentence].filter(Boolean)
  const available    = 6 - sentences.length - endSentences.length
  const trimmed      = optionals.slice(0, Math.max(0, available))

  return [...sentences, ...trimmed, ...endSentences].join(' ')
}
