import type { AnalysisResult, PredictionOutput } from '~/types'

export function useScreener() {
  const { data, pending, error, execute } = useFetch<{ results: AnalysisResult[] }>('/api/screener', {
    method: 'POST',
    immediate: false,
  })

  const scanDuration = ref<number | null>(null)

  async function scan() {
    const start = Date.now()
    scanDuration.value = null
    await execute()
    scanDuration.value = Math.round((Date.now() - start) / 100) / 10
  }

  const sortedResults = computed<AnalysisResult[]>(() => {
    if (!data.value?.results) return []
    return [...data.value.results].sort((a, b) => b.prediction.score - a.prediction.score)
  })

  const bullishCount = computed(() => sortedResults.value.filter((r) => r.prediction.signal === 'BULLISH').length)
  const bearishCount = computed(() => sortedResults.value.filter((r) => r.prediction.signal === 'BEARISH').length)
  const neutralCount = computed(() => sortedResults.value.filter((r) => r.prediction.signal === 'NEUTRAL').length)

  function analyse(ticker: string) {
    navigateTo(`/?ticker=${encodeURIComponent(ticker)}`)
  }

  // ── Display helpers ──────────────────────────────────────────────────────────

  function signalBadgeClass(signal: PredictionOutput['signal']): string {
    if (signal === 'BULLISH') return 'bg-green-900/50 text-green-300 border border-green-700/60'
    if (signal === 'BEARISH') return 'bg-red-900/50 text-red-300 border border-red-700/60'
    return 'bg-gray-800/60 text-gray-400 border border-gray-700/60'
  }

  function signalTextClass(signal: PredictionOutput['signal']): string {
    if (signal === 'BULLISH') return 'text-green-400'
    if (signal === 'BEARISH') return 'text-red-400'
    return 'text-gray-400'
  }

  function scoreText(score: number): string {
    return score > 0 ? `+${score}` : String(score)
  }

  function scoreClass(score: number): string {
    if (score > 0) return 'text-green-400 font-semibold'
    if (score < 0) return 'text-red-400 font-semibold'
    return 'text-gray-400'
  }

  function volClass(vol: number): string {
    return vol > 60 ? 'text-amber-400 font-medium' : 'text-gray-300'
  }

  // Applied to the first <td> in each row so the border renders reliably.
  // border-l-transparent keeps column width consistent for rows with no accent.
  function rowAccentClass(signal: PredictionOutput['signal']): string {
    if (signal === 'BULLISH') return 'border-l-2 border-l-green-700/50 pl-3'
    if (signal === 'BEARISH') return 'border-l-2 border-l-red-700/50 pl-3'
    return 'border-l-2 border-l-transparent pl-3'
  }

  return {
    pending,
    error,
    scanDuration,
    sortedResults,
    bullishCount,
    bearishCount,
    neutralCount,
    scan,
    analyse,
    signalBadgeClass,
    signalTextClass,
    scoreText,
    scoreClass,
    volClass,
    rowAccentClass,
  }
}
