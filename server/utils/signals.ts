import { RSI, MACD, BollingerBands } from 'technicalindicators'
import type { OHLCVBar, SignalResult } from '~/types'

export function computeRSI(bars: OHLCVBar[]): SignalResult {
  if (bars.length < 15) {
    throw new Error(`computeRSI: requires at least 15 bars, got ${bars.length}`)
  }

  const closes = bars.map((b) => b.close)
  const results = RSI.calculate({ period: 14, values: closes })

  if (results.length === 0) {
    throw new Error('computeRSI: indicator returned no values')
  }

  const value = results[results.length - 1]!
  const interpretation =
    value < 30 ? 'OVERSOLD' : value > 70 ? 'OVERBOUGHT' : 'NEUTRAL'

  return { name: 'RSI', value, interpretation, weight: 1.0 }
}

export function computeMACD(bars: OHLCVBar[]): SignalResult {
  // Minimum: slowPeriod(26) + signalPeriod(9) - 1 = 34 bars for first valid output
  if (bars.length < 34) {
    throw new Error(`computeMACD: requires at least 34 bars, got ${bars.length}`)
  }

  const closes = bars.map((b) => b.close)
  const results = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })

  if (results.length === 0) {
    throw new Error('computeMACD: indicator returned no values')
  }

  const last = results[results.length - 1]!
  const macdLine = last.MACD ?? 0
  const signalLine = last.signal ?? 0
  const histogram = last.histogram ?? 0

  const interpretation =
    macdLine > signalLine ? 'BULLISH CROSSOVER' : 'BEARISH CROSSOVER'

  return { name: 'MACD', value: histogram, interpretation, weight: 1.0 }
}

export function computeZScore(bars: OHLCVBar[], window: number = 20): SignalResult {
  if (bars.length < window) {
    throw new Error(`computeZScore: requires at least ${window} bars, got ${bars.length}`)
  }

  const closes = bars.slice(-window).map((b) => b.close)

  let mean = 0
  for (const c of closes) mean += c
  mean /= window

  let variance = 0
  for (const c of closes) {
    const d = c - mean
    variance += d * d
  }
  const std = Math.sqrt(variance / window)

  if (std === 0) {
    return { name: 'Z-Score', value: 0, interpretation: 'NEUTRAL', weight: 1.0 }
  }

  const lastClose = closes[closes.length - 1]!
  const z = (lastClose - mean) / std
  const interpretation = z < -2 ? 'OVERSOLD' : z > 2 ? 'OVERBOUGHT' : 'NEUTRAL'

  return { name: 'Z-Score', value: z, interpretation, weight: 1.0 }
}

export function computeMomentum(bars: OHLCVBar[]): SignalResult {
  // Need t-21 to be a valid bar: minimum 22 bars
  if (bars.length < 22) {
    throw new Error(`computeMomentum: requires at least 22 bars, got ${bars.length}`)
  }

  const n = bars.length
  // t-252 (fall back to oldest bar if series is shorter)
  const startIdx = Math.max(0, n - 253)
  // t-21
  const endIdx = n - 22

  const startPrice = bars[startIdx]!.close
  const endPrice = bars[endIdx]!.close

  const value = ((endPrice - startPrice) / startPrice) * 100

  const interpretation =
    value < -20 ? 'STRONG BEARISH'
    : value < 0  ? 'BEARISH'
    : value > 20 ? 'STRONG BULLISH'
    : 'WEAK BULLISH'

  return { name: 'Momentum', value, interpretation, weight: 1.0 }
}

export function computeOBV(bars: OHLCVBar[]): SignalResult {
  // Need at least 6 bars to compare OBV[n-1] vs OBV[n-6] for the 5-bar trend check
  if (bars.length < 6) {
    throw new Error(`computeOBV: requires at least 6 bars, got ${bars.length}`)
  }

  const n = bars.length
  const obv: number[] = new Array(n)
  obv[0] = 0

  for (let t = 1; t < n; t++) {
    const curr = bars[t]!
    const prev = bars[t - 1]!
    obv[t] = curr.close > prev.close
      ? obv[t - 1]! + curr.volume
      : obv[t - 1]! - curr.volume
  }

  const value = obv[n - 1]!
  const isTrendingUp = obv[n - 1]! > obv[n - 6]!
  const interpretation = isTrendingUp ? 'BULLISH VOLUME' : 'BEARISH VOLUME'

  return { name: 'OBV', value, interpretation, weight: 1.0 }
}
