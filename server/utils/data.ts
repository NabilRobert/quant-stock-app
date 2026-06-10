import type { OHLCVBar } from '~/types'

export async function fetchOHLCV(ticker: string, period: string): Promise<OHLCVBar[]> {
  throw new Error('not implemented')
}
