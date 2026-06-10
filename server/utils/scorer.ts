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

function buildInterpretation(
  signal: PredictionOutput['signal'],
  confidence: PredictionOutput['confidence'],
  regime: ReturnType<typeof computeHurst>,
  garch: ReturnType<typeof computeGarch>,
  signals: SignalResult[],
): string {
  if (signal === 'NEUTRAL') {
    const volNote = garch.volTomorrow > 60
      ? ' Volatility is currently elevated, so larger price swings are possible in either direction.'
      : ''
    return `Technical indicators are giving mixed readings — there is no strong case for buying or selling at this time.${volNote} Consider waiting for a clearer signal before acting.`
  }

  let agreeing = 0
  for (const sig of signals) {
    const bull = sig.interpretation.includes('BULLISH') || sig.interpretation === 'OVERSOLD'
    const bear = sig.interpretation.includes('BEARISH') || sig.interpretation === 'OVERBOUGHT'
    if (signal === 'BULLISH' && bull) agreeing++
    if (signal === 'BEARISH' && bear) agreeing++
  }

  const dirWord = signal === 'BULLISH' ? 'upward' : 'downward'
  const signalWord = signal === 'BULLISH' ? 'bullish' : 'bearish'

  const agreePhrase = agreeing >= 4 ? 'Most indicators are'
    : agreeing === 3 ? 'Several indicators are'
    : agreeing === 2 ? 'A couple of indicators are'
    : agreeing === 1 ? 'One indicator is'
    : 'Pattern analysis is broadly'

  let regimeSentence = ''
  if (regime.regime === 'TREND') {
    regimeSentence = ` The market is in a trending phase, which adds conviction to the ${signalWord} case.`
  } else if (regime.regime === 'REVERT') {
    regimeSentence = signal === 'BULLISH'
      ? ' Mean-reversion dynamics suggest the stock may be bouncing back from an oversold level.'
      : ' Mean-reversion dynamics suggest the stock may be retreating from an overbought level.'
  }

  const volSentence = garch.volTomorrow > 60
    ? ' Volatility is elevated — expect larger-than-normal price swings in the near term.'
    : ''

  const conclusionSentence = confidence === 'HIGH'
    ? ' Overall, the signal is strong and well-supported.'
    : confidence === 'MODERATE'
    ? ' The signal is moderate — some conflicting readings remain.'
    : ' The signal is weak; treat this outlook with caution.'

  return `${agreePhrase} pointing ${dirWord}.${regimeSentence}${volSentence}${conclusionSentence}`
}

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

  // ── Step 7: Confidence score (0–100) ────────────────────────────────────
  let cs = 50

  // Each signal that aligns with the final direction adds 7; contradictions subtract 5
  const isBullish = signal === 'BULLISH'
  const isBearish = signal === 'BEARISH'
  for (const sig of signals) {
    const agresBullish = sig.interpretation.includes('BULLISH') || sig.interpretation === 'OVERSOLD'
    const agresBearish = sig.interpretation.includes('BEARISH') || sig.interpretation === 'OVERBOUGHT'
    if (isBullish) {
      if (agresBullish)  cs += 7
      if (agresBearish)  cs -= 5
    } else if (isBearish) {
      if (agresBearish)  cs += 7
      if (agresBullish)  cs -= 5
    }
  }

  // Strong regime conviction
  if (regime.hurst > 0.7 || regime.hurst < 0.3) cs += 8

  // High volatility pulls score toward 50 (less certainty)
  if (garch.volTomorrow > 60) cs = 50 + (cs - 50) * 0.7

  // Cap and round
  const confidenceScore = Math.round(Math.max(5, Math.min(95, cs)))

  // ── Step 8: Plain-English interpretation ─────────────────────────────────
  const interpretation = buildInterpretation(signal, confidence, regime, garch, signals)

  // ── Step 9: Move range ────────────────────────────────────────────────────
  // Convert annualised vol% → single-day fractional vol, then scale for range
  const dailyVol = (garch.volTomorrow / 100) / Math.sqrt(252)
  const moveRange = {
    low:  lastClose * (1 - dailyVol * 10),
    high: lastClose * (1 + dailyVol * 10),
  }

  const prediction: PredictionOutput = { signal, confidence, score, confidenceScore, interpretation, moveRange }

  const closes = bars.slice(-60).map((b) => b.close)

  return { ticker, lastClose, closes, regime, garch, signals, patterns, prediction }
}
