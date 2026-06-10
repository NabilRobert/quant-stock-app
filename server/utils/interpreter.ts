import type { AnalysisResult } from '~/types'

export function generateInterpretation(result: AnalysisResult): string {
  const { ticker, regime, garch, signals, patterns, prediction } = result

  const rsi      = signals.find((s) => s.name === 'RSI')
  const momentum = signals.find((s) => s.name === 'Momentum')

  const srPat = patterns.find((p) => p.name === 'Support/Resistance')
  let support: number | null = null
  if (srPat) {
    const m = srPat.interpretation.match(/Support:\s*([\d.]+)/)
    if (m?.[1]) support = parseFloat(m[1])
  }

  const sentences: string[] = []

  // ── Sentence 1: regime + direction + vol ────────────────────────────────
  const isStrong = regime.hurst > 0.65 || regime.hurst < 0.35
  const trendWord =
    prediction.signal === 'BEARISH' ? `${isStrong ? 'strong ' : ''}downtrend`
    : prediction.signal === 'BULLISH' ? `${isStrong ? 'strong ' : ''}uptrend`
    : 'sideways range'

  const regimeDesc =
    regime.regime === 'TREND' ? `a ${trendWord}`
    : regime.regime === 'REVERT' ? 'a mean-reverting range'
    : 'a directionless market'

  const volLevel =
    garch.volTomorrow > 60 ? 'above-average'
    : garch.volTomorrow > 30 ? 'moderate'
    : 'low'

  sentences.push(
    `${ticker} has been in ${regimeDesc} with ${volLevel} volatility (${garch.volTomorrow.toFixed(0)}% annualised).`
  )

  // ── Sentence 2: RSI + momentum ──────────────────────────────────────────
  if (rsi && momentum) {
    const rsiVal  = rsi.value.toFixed(1)
    const momDir  = momentum.interpretation.includes('BULLISH') ? 'upward' : 'downward'
    const momWeak = momentum.interpretation.startsWith('WEAK') || momentum.interpretation === 'BEARISH'

    if (rsi.interpretation === 'OVERSOLD') {
      sentences.push(
        `Selling pressure may be slowing — the stock is deeply oversold (RSI ${rsiVal}) and momentum is turning ${momDir}; a short-term bounce is possible.`
      )
    } else if (rsi.interpretation === 'OVERBOUGHT') {
      sentences.push(
        `Buying pressure may be fading — the stock is overbought (RSI ${rsiVal}) and momentum is pointing ${momDir}; a pullback is possible.`
      )
    } else {
      sentences.push(
        `RSI is neutral at ${rsiVal}${momWeak ? `, though momentum is tilting ${momDir}` : `, with momentum firmly ${momDir}`}.`
      )
    }
  }

  // ── Sentence 3: Overall conclusion ──────────────────────────────────────
  if (prediction.signal === 'BULLISH') {
    sentences.push('The overall outlook is bullish.')
  } else if (prediction.signal === 'BEARISH') {
    sentences.push('The overall trend remains negative.')
  } else {
    sentences.push('No strong directional edge is present at this time.')
  }

  // ── Sentence 4: Support level ────────────────────────────────────────────
  if (support !== null) {
    sentences.push(
      `Key support sits at ${support.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} IDR.`
    )
  }

  return sentences.join(' ')
}
