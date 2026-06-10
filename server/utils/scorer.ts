import type { OHLCVBar, AnalysisResult } from '~/types'
import { computeHurst } from './hurst'
import { computeGarch } from './garch'
import { computeRSI, computeMACD, computeZScore, computeMomentum, computeOBV } from './signals'
import { detectPatterns } from './patterns'

export async function scoreAnalysis(ticker: string, bars: OHLCVBar[]): Promise<AnalysisResult> {
  throw new Error('not implemented')
}
