import type { OHLCVBar, GarchResult } from '~/types'

const ALPHA = 0.1
const BETA = 0.85

export function computeGarch(bars: OHLCVBar[]): GarchResult {
  if (bars.length < 10) {
    throw new Error(`computeGarch: requires at least 10 bars, got ${bars.length}`)
  }

  // Log returns: ln(close[t] / close[t-1])
  const returns: number[] = new Array(bars.length - 1)
  for (let t = 1; t < bars.length; t++) {
    returns[t - 1] = Math.log(bars[t]!.close / bars[t - 1]!.close)
  }
  const n = returns.length

  // Population variance of the full return series — used as the unconditional variance
  let rMean = 0
  for (let i = 0; i < n; i++) rMean += returns[i]!
  rMean /= n

  let longRunVar = 0
  for (let i = 0; i < n; i++) {
    const d = returns[i]! - rMean
    longRunVar += d * d
  }
  longRunVar /= n

  const alpha = ALPHA
  const beta = BETA
  const omega = longRunVar * (1 - alpha - beta)

  // GARCH(1,1) variance path
  // sigma2[0] = longRunVar (warm start)
  // sigma2[t] = omega + alpha * returns[t-1]² + beta * sigma2[t-1]
  const sigma2: number[] = new Array(n)
  sigma2[0] = longRunVar
  for (let t = 1; t < n; t++) {
    sigma2[t] = omega + alpha * returns[t - 1]! ** 2 + beta * sigma2[t - 1]!
  }

  // One-step-ahead forecast using the last observed return and variance
  const sigma2Tomorrow =
    omega + alpha * returns[n - 1]! ** 2 + beta * sigma2[n - 1]!

  // Annualise to percent: sqrt(daily_var * 252) * 100
  const volToday = Math.sqrt(sigma2[n - 1]! * 252) * 100
  const volTomorrow = Math.sqrt(sigma2Tomorrow * 252) * 100

  const regimeLabel =
    volTomorrow > 60 ? 'HIGH' : volTomorrow > 30 ? 'MODERATE' : 'LOW'

  return { omega, alpha, beta, volToday, volTomorrow, regimeLabel }
}
