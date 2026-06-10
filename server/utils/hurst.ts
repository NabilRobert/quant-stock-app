import type { OHLCVBar, HurstResult } from '~/types'

export function computeHurst(bars: OHLCVBar[]): HurstResult {
  if (bars.length < 30) {
    throw new Error(`computeHurst: requires at least 30 bars, got ${bars.length}`)
  }

  const prices = bars.map((b) => b.close)
  const n = prices.length

  const logLags: number[] = []
  const logRS: number[] = []

  for (let lag = 10; lag <= Math.floor(n / 2); lag++) {
    const sub = prices.slice(0, lag)

    // Mean of the subseries
    let mean = 0
    for (let i = 0; i < lag; i++) mean += sub[i]!
    mean /= lag

    // Cumulative deviations from the mean; track range inline to avoid spread
    let cumSum = 0
    let rMax = -Infinity
    let rMin = Infinity
    for (let i = 0; i < lag; i++) {
      cumSum += sub[i]! - mean
      if (cumSum > rMax) rMax = cumSum
      if (cumSum < rMin) rMin = cumSum
    }
    const r = rMax - rMin

    // Population std dev of the subseries
    let variance = 0
    for (let i = 0; i < lag; i++) {
      const d = sub[i]! - mean
      variance += d * d
    }
    const s = Math.sqrt(variance / lag)

    if (s === 0) continue

    logLags.push(Math.log(lag))
    logRS.push(Math.log(r / s))
  }

  if (logLags.length < 2) {
    throw new Error('computeHurst: too few valid lag points to fit regression')
  }

  // OLS slope of log(R/S) ~ log(lag); slope is the Hurst exponent
  const m = logLags.length
  let xMean = 0
  let yMean = 0
  for (let i = 0; i < m; i++) {
    xMean += logLags[i]!
    yMean += logRS[i]!
  }
  xMean /= m
  yMean /= m

  let num = 0
  let den = 0
  for (let i = 0; i < m; i++) {
    const dx = logLags[i]! - xMean
    num += dx * (logRS[i]! - yMean)
    den += dx * dx
  }

  const hurst = num / den

  const regime: HurstResult['regime'] =
    hurst > 0.55 ? 'TREND' : hurst < 0.45 ? 'REVERT' : 'RANDOM'

  return { hurst, regime }
}
