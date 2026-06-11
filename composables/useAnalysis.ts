import type { ChartData, ChartOptions, Plugin } from 'chart.js'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import type { AnalysisResult, PredictionOutput } from '~/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend)

const FUTURE = 10

const DATE_FMT    = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
const CAPTION_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

function parseIso(iso: string): Date {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(y!, mo! - 1, d!)
}

function nextTradingDays(lastIso: string, count: number): string[] {
  const result: string[] = []
  const cur = parseIso(lastIso)
  while (result.length < count) {
    cur.setDate(cur.getDate() + 1)
    if (cur.getDay() !== 0 && cur.getDay() !== 6) result.push(DATE_FMT.format(new Date(cur)))
  }
  return result
}

export const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', '1Y', 'All'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

const TIMEFRAME_BARS: Record<Timeframe, number> = {
  '1D':  1,
  '1W':  5,
  '1M':  21,
  '3M':  63,
  '6M':  126,
  '1Y':  252,
  'All': Infinity,
}

export function useAnalysis() {
  const tickerInput       = ref('BBCA')
  const activeTicker      = ref('BBCA')
  const detailsOpen       = ref(false)
  const showGarchBands    = ref(false)
  const selectedTimeframe = ref<Timeframe>('3M')

  const { data: analysis, pending, error } = useFetch<AnalysisResult>(
    () => `/api/analyze?ticker=${activeTicker.value}`,
  )

  watch(activeTicker, () => {
    detailsOpen.value       = false
    showGarchBands.value    = false
    selectedTimeframe.value = '3M'
  })

  const errorMessage = computed(() => {
    if (!error.value) return null
    const body = error.value.data as { error?: string } | null
    return body?.error ?? error.value.message ?? 'An unexpected error occurred'
  })

  function onTickerInput(e: Event) {
    tickerInput.value = (e.target as HTMLInputElement).value.toUpperCase()
  }

  function submitTicker() {
    const t = tickerInput.value.trim().toUpperCase()
    if (t && t !== activeTicker.value) activeTicker.value = t
  }

  // ── Visible slice (client-side timeframe filter) ─────────────────────────────

  const visibleSlice = computed(() => {
    const a = analysis.value
    if (!a) return { closes: [] as number[], dates: [] as string[] }
    const maxBars = TIMEFRAME_BARS[selectedTimeframe.value]
    const n = maxBars === Infinity ? a.closes.length : Math.min(maxBars, a.closes.length)
    return {
      closes: a.closes.slice(-n),
      dates:  a.dates.slice(-n),
    }
  })

  const chartCaption = computed(() => {
    const { dates } = visibleSlice.value
    if (dates.length === 0) return ''
    const first = CAPTION_FMT.format(parseIso(dates[0]!))
    const last  = CAPTION_FMT.format(parseIso(dates[dates.length - 1]!))
    return `${first} — ${last}`
  })

  // ── Display helpers ──────────────────────────────────────────────────────────

  function badgeClasses(signal: PredictionOutput['signal']): string {
    if (signal === 'BULLISH')
      return 'inline-flex items-center rounded-full border border-green-600/50 bg-green-900/40 px-6 py-2 text-base font-extrabold uppercase tracking-widest text-green-300'
    if (signal === 'BEARISH')
      return 'inline-flex items-center rounded-full border border-red-600/50 bg-red-900/40 px-6 py-2 text-base font-extrabold uppercase tracking-widest text-red-300'
    return 'inline-flex items-center rounded-full border border-gray-600/50 bg-gray-800/40 px-6 py-2 text-base font-extrabold uppercase tracking-widest text-gray-300'
  }

  function signalTextColor(signal: PredictionOutput['signal']): string {
    if (signal === 'BULLISH') return 'text-green-400'
    if (signal === 'BEARISH') return 'text-red-400'
    return 'text-gray-400'
  }

  function patternColor(interp: string): string {
    if (interp.startsWith('BEARISH')) return 'text-red-400'
    if (interp.startsWith('BULLISH')) return 'text-green-400'
    return 'text-gray-400'
  }

  // ── Chart data ───────────────────────────────────────────────────────────────

  const chartData = computed<ChartData<'line'>>(() => {
    const a     = analysis.value
    const slice = visibleSlice.value
    if (!a || slice.closes.length === 0) return { labels: [], datasets: [] }

    const closes     = slice.closes
    const n          = closes.length
    const total      = n + FUTURE
    const histLabels = slice.dates.map((iso) => DATE_FMT.format(parseIso(iso)))
    const lastIso    = slice.dates[slice.dates.length - 1] ?? ''
    const labels     = [...histLabels, ...nextTradingDays(lastIso, FUTURE)]

    // Linear regression over the visible slice
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
      const x = i + 1
      const y = closes[i]!
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x
    }
    const denom     = n * sumX2 - sumX * sumX
    const slope     = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
    const intercept = (sumY - slope * sumX) / n
    const trendData = Array.from({ length: total }, (_, i) => slope * (i + 1) + intercept)

    // S/R levels from server-side pattern detection
    const srPat = a.patterns.find((p) => p.name === 'Support/Resistance')
    let support: number | null    = null
    let resistance: number | null = null
    if (srPat) {
      const sm = srPat.interpretation.match(/Support:\s*([\d.]+)/)
      const rm = srPat.interpretation.match(/Resistance:\s*([\d.]+)/)
      if (sm?.[1]) support    = parseFloat(sm[1])
      if (rm?.[1]) resistance = parseFloat(rm[1])
    }

    // GARCH bands always project from the latest close (independent of timeframe)
    const dailyVol   = (a.garch.volTomorrow / 100) / Math.sqrt(252)
    const garchUpper = Array.from({ length: FUTURE }, (_, i) => a.lastClose * (1 + dailyVol * (i + 1)))
    const garchLower = Array.from({ length: FUTURE }, (_, i) => a.lastClose * (1 - dailyVol * (i + 1)))
    const histPad:   null[] = Array(n).fill(null)
    const futurePad: null[] = Array(FUTURE).fill(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = []

    datasets.push({
      label: 'Price',
      data: [...closes, ...futurePad],
      borderColor: '#4ade80',
      backgroundColor: 'rgba(74, 222, 128, 0.05)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    })

    datasets.push({
      label: 'Trend projection',
      data: trendData,
      borderColor: 'rgba(96, 165, 250, 0.75)',
      borderWidth: 1.5,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
      tension: 0,
    })

    if (support !== null) {
      datasets.push({
        label: `Support ${support.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        data: Array(total).fill(support),
        borderColor: 'rgba(74, 222, 128, 0.55)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      })
    }

    if (resistance !== null) {
      datasets.push({
        label: `Resistance ${resistance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        data: Array(total).fill(resistance),
        borderColor: 'rgba(248, 113, 113, 0.55)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      })
    }

    // Upper must be immediately before lower so fill: '+1' targets it
    if (showGarchBands.value) {
      datasets.push({
        label: 'Volatility upper bound',
        data: [...histPad, ...garchUpper],
        borderColor: 'rgba(74, 222, 128, 0.7)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: '+1',
        backgroundColor: 'rgba(74, 222, 128, 0.08)',
        tension: 0,
      })
      datasets.push({
        label: 'Volatility lower bound',
        data: [...histPad, ...garchLower],
        borderColor: 'rgba(248, 113, 113, 0.7)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      })
    }

    return { labels, datasets } as ChartData<'line'>
  })

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#1f2937',
        titleColor: '#d1d5db',
        bodyColor: '#9ca3af',
        borderColor: '#374151',
        borderWidth: 1,
        filter: (item) => item.parsed.y != null,
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (ctx) => {
            if (ctx.parsed.y == null) return ''
            const lbl = ctx.dataset.label
            return lbl ? ` ${lbl}: ${ctx.parsed.y.toFixed(2)}` : ` ${ctx.parsed.y.toFixed(2)}`
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          color: '#6b7280',
          font: { size: 10 },
          maxRotation: -45,
          minRotation: -45,
          maxTicksLimit: 8,
        },
        grid: { display: false },
        border: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 5 },
        border: { color: 'rgba(255,255,255,0.08)' },
      },
    },
  }

  // Vertical dashed divider at the history / projection boundary
  const histBarCount = computed(() => visibleSlice.value.closes.length)

  const dividerPlugin: Plugin<'line'> = {
    id: 'historyDivider',
    afterDraw(chart) {
      const n = histBarCount.value
      if (n === 0) return
      const xScale = chart.scales['x']
      const yScale = chart.scales['y']
      if (!xScale || !yScale) return
      const x = (xScale.getPixelForValue(n - 1) + xScale.getPixelForValue(n)) / 2
      const ctx = chart.ctx
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, yScale.top)
      ctx.lineTo(x, yScale.bottom)
      ctx.stroke()
      ctx.restore()
    },
  }

  const chartPlugins: Plugin<'line'>[] = [dividerPlugin]

  return {
    tickerInput,
    activeTicker,
    detailsOpen,
    showGarchBands,
    selectedTimeframe,
    analysis,
    pending,
    errorMessage,
    chartCaption,
    onTickerInput,
    submitTicker,
    badgeClasses,
    signalTextColor,
    patternColor,
    chartData,
    chartOptions,
    chartPlugins,
  }
}
