import type { OHLCVBar, AnalysisResult } from '~/types'
import { calcHurst } from './hurst'
import { fitGarch } from './garch'
import { calcSignals } from './signals'
import { detectPatterns } from './patterns'

export async function scoreAnalysis(ticker: string, bars: OHLCVBar[]): Promise<AnalysisResult> {
  throw new Error('not implemented')
}
