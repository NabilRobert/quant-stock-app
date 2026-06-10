import type { AnalysisResult } from '~/types'
import { fetchOHLCV } from '../utils/data'
import { runAnalysis } from '../utils/scorer'

export default defineEventHandler(async (event): Promise<AnalysisResult[]> => {
  throw new Error('not implemented')
})
