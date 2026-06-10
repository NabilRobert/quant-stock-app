import type {
  OHLCVBar,
  AnalysisResult,
  PatternResult,
  SignalResult,
  PredictionOutput,
} from '~/types'
import { computeHurst } from './hurst'
import { computeGarch } from './garch'
import { computeRSI, computeMACD, computeZScore, computeMomentum, computeOBV } from './signals'
import { detectAllPatterns } from './patterns'

export function runAnalysis(ticker: string, bars: OHLCVBar[]): AnalysisResult {
  if (bars.length === 0) {
    throw new Error('runAnalysis: bars must not be empty')
  }

  const lastClose = bars[bars.length - 1]!.close

  // ── Step 1: Regime — gates downstream weights ─────────────────────────────
  const regime = computeHurst(bars)

  // ── Step 2: Volatility — used for confidence scaling and moveRange ─────────
  const garch = computeGarch(bars)

  // ── Step 3: Signals (all synchronous) ────────────────────────────────────
  const rsi = computeRSI(bars)
  const macd = computeMACD(bars)
  const zScore = computeZScore(bars)
  const momentum = computeMomentum(bars)
  const obv = computeOBV(bars)
  const signals: SignalResult[] = [rsi, macd, zScore, momentum, obv]

  // ── Step 4: Patterns ─────────────────────────────────────────────────────
  const patterns: PatternResult[] = detectAllPatterns(bars)

  // ── Step 5: Score tally ───────────────────────────────────────────────────
  const isTrend = regime.regime === 'TREND'
  const isRevert = regime.regime === 'REVERT'

  // Regime-gated multipliers (doubled for the favoured signals in each regime)
  const rsiMulti      = isRevert ? 2 : 1
  const macdMulti     = isTrend  ? 2 : 1
  const zScoreMulti   = isRevert ? 2 : 1
  const momentumMulti = isTrend  ? 2 : 1

  let score = 0

  // RSI
  if      (rsi.interpretation === 'OVERSOLD')   score += 1 * rsiMulti
  else if (rsi.interpretation === 'OVERBOUGHT') score -= 1 * rsiMulti

  // MACD
  if      (macd.interpretation === 'BULLISH CROSSOVER') score += 1 * macdMulti
  else if (macd.interpretation === 'BEARISH CROSSOVER') score -= 1 * macdMulti

  // Z-Score
  if      (zScore.interpretation === 'OVERSOLD')   score += 1 * zScoreMulti
  else if (zScore.interpretation === 'OVERBOUGHT') score -= 1 * zScoreMulti

  // Momentum
  if      (momentum.interpretation === 'STRONG BULLISH') score += 2 * momentumMulti
  else if (momentum.interpretation === 'WEAK BULLISH')   score += 1 * momentumMulti
  else if (momentum.interpretation === 'BEARISH')        score -= 1 * momentumMulti
  else if (momentum.interpretation === 'STRONG BEARISH') score -= 2 * momentumMulti

  // OBV
  if      (obv.interpretation === 'BULLISH VOLUME') score += 1
  else if (obv.interpretation === 'BEARISH VOLUME') score -= 1

  // Patterns — S/R has neither prefix so contributes 0
  for (const p of patterns) {
    if      (p.interpretation.startsWith('BEARISH')) score -= 1
    else if (p.interpretation.startsWith('BULLISH')) score += 1
  }

  // Clamp to spec range before GARCH scaling
  score = Math.max(-5, Math.min(5, score))

  // GARCH volatility dampening: high vol → shrink conviction
  if (garch.volTomorrow > 60) {
    score = Math.round(score * 0.7)
  }

  // ── Step 6: Map score → signal + confidence ───────────────────────────────
  let signal: PredictionOutput['signal']
  let confidence: PredictionOutput['confidence']

  if (score >= 3) {
    signal = 'BULLISH'; confidence = 'HIGH'
  } else if (score >= 1) {
    signal = 'BULLISH'; confidence = 'MODERATE'
  } else if (score <= -3) {
    signal = 'BEARISH'; confidence = 'HIGH'
  } else if (score <= -1) {
    signal = 'BEARISH'; confidence = 'MODERATE'
  } else {
    signal = 'NEUTRAL'; confidence = 'LOW'
  }

  // ── Step 7: Move range ────────────────────────────────────────────────────
  // Convert annualised vol% → single-day fractional vol, then scale for range
  const dailyVol = (garch.volTomorrow / 100) / Math.sqrt(252)
  const moveRange = {
    low:  lastClose * (1 - dailyVol * 10),
    high: lastClose * (1 + dailyVol * 10),
  }

  const prediction: PredictionOutput = { signal, confidence, score, moveRange }

  return { ticker, lastClose, regime, garch, signals, patterns, prediction }
}
