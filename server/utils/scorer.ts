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
import { generateInterpretation } from './interpreter'

// ── Tuneable constants ────────────────────────────────────────────────────────
const HIGH_VOL_THRESHOLD    = 60   // annualised vol% that triggers dampening
const SCORE_CLAMP           = 5    // max absolute composite score (±)
const VOL_DAMPEN_FACTOR     = 0.7  // score multiplier under high volatility
const CS_BASELINE           = 50   // confidence-score neutral starting point
const CS_AGREE_BONUS        = 7    // per signal that aligns with the direction
const CS_CONTRADICT_PENALTY = 5    // per signal that contradicts the direction
const CS_REGIME_BONUS       = 8    // strong Hurst conviction adds this
const CS_HURST_HIGH         = 0.7  // Hurst above this → strong-trend bonus
const CS_HURST_LOW          = 0.3  // Hurst below this → strong-reversion bonus
const CS_MIN                = 5    // floor for confidenceScore output
const CS_MAX                = 95   // ceiling for confidenceScore output

// Score contribution (+ve = bullish, -ve = bearish) keyed by interpretation string.
// Any interpretation not listed here contributes 0 (e.g. 'NEUTRAL').
const SIGNAL_SCORES: Record<string, number> = {
  'OVERSOLD':          1,
  'OVERBOUGHT':       -1,
  'BULLISH CROSSOVER':  1,
  'BEARISH CROSSOVER': -1,
  'STRONG BULLISH':    2,
  'WEAK BULLISH':      1,
  'BEARISH':          -1,
  'STRONG BEARISH':   -2,
  'BULLISH VOLUME':    1,
  'BEARISH VOLUME':   -1,
}

// Which signals get a 2× multiplier in which regime.
// Signals not listed always use a multiplier of 1.
const REGIME_MULTIPLIERS: Record<string, Partial<Record<string, number>>> = {
  'RSI':      { REVERT: 2 },
  'MACD':     { TREND:  2 },
  'Z-Score':  { REVERT: 2 },
  'Momentum': { TREND:  2 },
}

function buildInterpretation(
  signal: PredictionOutput['signal'],
  confidence: PredictionOutput['confidence'],
  regime: ReturnType<typeof computeHurst>,
  garch: ReturnType<typeof computeGarch>,
  signals: SignalResult[],
): string {
  if (signal === 'NEUTRAL') {
    const volNote = garch.volTomorrow > HIGH_VOL_THRESHOLD
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

  const dirWord    = signal === 'BULLISH' ? 'upward' : 'downward'
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

  const volSentence = garch.volTomorrow > HIGH_VOL_THRESHOLD
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

  // ── Step 1: Regime ────────────────────────────────────────────────────────
  const regime = computeHurst(bars)

  // ── Step 2: Volatility ────────────────────────────────────────────────────
  const garch = computeGarch(bars)

  // ── Step 3: Signals ───────────────────────────────────────────────────────
  const rsi      = computeRSI(bars)
  const macd     = computeMACD(bars)
  const zScore   = computeZScore(bars)
  const momentum = computeMomentum(bars)
  const obv      = computeOBV(bars)
  const signals: SignalResult[] = [rsi, macd, zScore, momentum, obv]

  // ── Step 4: Patterns ──────────────────────────────────────────────────────
  const patterns: PatternResult[] = detectAllPatterns(bars)

  // ── Step 5: Score tally ───────────────────────────────────────────────────
  let score = 0

  for (const sig of signals) {
    const base  = SIGNAL_SCORES[sig.interpretation] ?? 0
    const multi = REGIME_MULTIPLIERS[sig.name]?.[regime.regime] ?? 1
    score += base * multi
  }

  for (const p of patterns) {
    if      (p.interpretation.startsWith('BEARISH')) score -= 1
    else if (p.interpretation.startsWith('BULLISH')) score += 1
  }

  score = Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, score))

  if (garch.volTomorrow > HIGH_VOL_THRESHOLD) {
    score = Math.round(score * VOL_DAMPEN_FACTOR)
  }

  // ── Step 6: Map score → signal + confidence ───────────────────────────────
  let signal: PredictionOutput['signal']
  let confidence: PredictionOutput['confidence']

  if      (score >= 3)  { signal = 'BULLISH'; confidence = 'HIGH'     }
  else if (score >= 1)  { signal = 'BULLISH'; confidence = 'MODERATE' }
  else if (score <= -3) { signal = 'BEARISH'; confidence = 'HIGH'     }
  else if (score <= -1) { signal = 'BEARISH'; confidence = 'MODERATE' }
  else                  { signal = 'NEUTRAL'; confidence = 'LOW'      }

  // ── Step 7: Confidence score (0–100) ─────────────────────────────────────
  const isBullish = signal === 'BULLISH'
  const isBearish = signal === 'BEARISH'
  let cs = CS_BASELINE

  for (const sig of signals) {
    const agreesBull = sig.interpretation.includes('BULLISH') || sig.interpretation === 'OVERSOLD'
    const agreesBear = sig.interpretation.includes('BEARISH') || sig.interpretation === 'OVERBOUGHT'
    if (isBullish) {
      if (agreesBull) cs += CS_AGREE_BONUS
      if (agreesBear) cs -= CS_CONTRADICT_PENALTY
    } else if (isBearish) {
      if (agreesBear) cs += CS_AGREE_BONUS
      if (agreesBull) cs -= CS_CONTRADICT_PENALTY
    }
  }

  if (regime.hurst > CS_HURST_HIGH || regime.hurst < CS_HURST_LOW) cs += CS_REGIME_BONUS
  if (garch.volTomorrow > HIGH_VOL_THRESHOLD) cs = CS_BASELINE + (cs - CS_BASELINE) * VOL_DAMPEN_FACTOR

  const confidenceScore = Math.round(Math.max(CS_MIN, Math.min(CS_MAX, cs)))

  // ── Step 8: Plain-English interpretation ─────────────────────────────────
  const interpretation = buildInterpretation(signal, confidence, regime, garch, signals)

  // ── Step 9: Move range ────────────────────────────────────────────────────
  const dailyVol = (garch.volTomorrow / 100) / Math.sqrt(252)
  const moveRange = {
    low:  lastClose * (1 - dailyVol * 10),
    high: lastClose * (1 + dailyVol * 10),
  }

  const prediction: PredictionOutput = { signal, confidence, score, confidenceScore, interpretation, moveRange }

  const closes = bars.slice(-60).map((b) => b.close)

  const resultBase = { ticker, lastClose, closes, regime, garch, signals, patterns, prediction }
  const resultInterpretation = generateInterpretation({ ...resultBase, interpretation: '' })

  return { ...resultBase, interpretation: resultInterpretation }
}
