export interface OHLCVBar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface SignalResult {
  name: string
  value: number
  interpretation: string
  weight: number
}

export interface RegimeResult {
  hurst: number
  regime: 'TREND' | 'REVERT' | 'RANDOM'
}

// Named alias used by the hurst util; structurally identical to RegimeResult
export type HurstResult = RegimeResult

export interface GarchResult {
  omega: number
  alpha: number
  beta: number
  volToday: number
  volTomorrow: number
  regimeLabel: string
}

export interface PredictionOutput {
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  score: number
  moveRange: { low: number; high: number }
}

export interface PatternResult {
  name: string
  detected: boolean
  priceTarget: number | null
  interpretation: string
}

export interface AnalysisResult {
  ticker: string
  lastClose: number
  regime: RegimeResult
  garch: GarchResult
  signals: SignalResult[]
  patterns: PatternResult[]
  prediction: PredictionOutput
}
