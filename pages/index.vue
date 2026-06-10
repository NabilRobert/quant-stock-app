<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
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
import { Line } from 'vue-chartjs'
import type { AnalysisResult, PredictionOutput } from '~/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend)

const FUTURE = 10

const tickerInput    = ref('BBCA')
const activeTicker   = ref('BBCA')
const detailsOpen    = ref(false)
const showGarchBands = ref(false)

const { data: analysis, pending, error } = await useFetch<AnalysisResult>(
  () => `/api/analyze?ticker=${activeTicker.value}`,
)

watch(activeTicker, () => {
  detailsOpen.value    = false
  showGarchBands.value = false
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

// ── Chart data ──────────────────────────────────────────────────────────────
const chartData = computed<ChartData<'line'>>(() => {
  const a = analysis.value
  if (!a || a.closes.length === 0) return { labels: [], datasets: [] }

  const closes = a.closes
  const n      = closes.length
  const total  = n + FUTURE
  const labels = Array.from({ length: total }, (_, i) => String(i + 1))

  // ── Linear regression (least squares over n historical bars) ──────────────
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    const x = i + 1
    const y = closes[i]!
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x
  }
  const denom    = n * sumX2 - sumX * sumX
  const slope    = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n
  const trendData = Array.from({ length: total }, (_, i) => slope * (i + 1) + intercept)

  // ── S/R levels from patterns ───────────────────────────────────────────────
  const srPat = a.patterns.find((p) => p.name === 'Support/Resistance')
  let support: number | null    = null
  let resistance: number | null = null
  if (srPat) {
    const sm = srPat.interpretation.match(/Support:\s*([\d.]+)/)
    const rm = srPat.interpretation.match(/Resistance:\s*([\d.]+)/)
    if (sm?.[1]) support    = parseFloat(sm[1])
    if (rm?.[1]) resistance = parseFloat(rm[1])
  }

  // ── GARCH bands for future days n = 1..FUTURE ─────────────────────────────
  const dailyVol  = (a.garch.volTomorrow / 100) / Math.sqrt(252)
  const garchUpper = Array.from({ length: FUTURE }, (_, i) => a.lastClose * (1 + dailyVol * (i + 1)))
  const garchLower = Array.from({ length: FUTURE }, (_, i) => a.lastClose * (1 - dailyVol * (i + 1)))
  const histPad:   null[] = Array(n).fill(null)
  const futurePad: null[] = Array(FUTURE).fill(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datasets: any[] = []

  // Price — fills the area under the line for historical bars only
  datasets.push({
    data: [...closes, ...futurePad],
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.4,
    fill: true,
  })

  // Trendline — dashed blue, spans all 70 positions
  datasets.push({
    data: trendData,
    borderColor: 'rgba(96, 165, 250, 0.75)',
    borderWidth: 1.5,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
    tension: 0,
  })

  // Support — dashed green horizontal line
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

  // Resistance — dashed red horizontal line
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

  // GARCH bands — upper must be immediately before lower for fill: '+1' to target it
  if (showGarchBands.value) {
    datasets.push({
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
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        filter: (item) => !!item.text && (item.text.startsWith('Support') || item.text.startsWith('Resistance')),
        color: '#6b7280',
        font: { size: 10 },
        boxWidth: 28,
        boxHeight: 0,
        padding: 8,
      },
    },
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
        title: () => '',
        label: (ctx) => {
          if (ctx.parsed.y == null) return ''
          const lbl = ctx.dataset.label
          return lbl ? ` ${lbl}: ${ctx.parsed.y.toFixed(2)}` : ` ${ctx.parsed.y.toFixed(2)}`
        },
      },
    },
  },
  scales: {
    x: { display: false },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 5 },
      border: { color: 'rgba(255,255,255,0.08)' },
    },
  },
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <Disclaimer />

    <div class="mx-auto max-w-2xl px-4 py-8 space-y-5">

      <!-- Header -->
      <div>
        <h1 class="text-lg font-bold tracking-wide text-white">IDX Stock Analysis</h1>
        <p class="mt-0.5 text-xs text-gray-600">Quantitative signals for Indonesia Stock Exchange</p>
      </div>

      <!-- Search bar -->
      <div class="flex gap-2">
        <input
          :value="tickerInput"
          @input="onTickerInput"
          @keyup.enter="submitTicker"
          placeholder="Enter ticker — e.g. BBCA"
          maxlength="15"
          class="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
        />
        <button
          @click="submitTicker"
          :disabled="pending"
          class="rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Analyse
        </button>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="flex h-64 items-center justify-center">
        <div class="h-7 w-7 animate-spin rounded-full border-2 border-gray-800 border-t-green-400" />
      </div>

      <!-- Error -->
      <div
        v-else-if="errorMessage"
        class="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
      >
        {{ errorMessage }}
      </div>

      <template v-else-if="analysis">

        <!-- ── Summary card ──────────────────────────────────────── -->
        <div class="rounded-2xl border border-gray-700/60 bg-gray-900 p-6 space-y-5">

          <div class="flex items-baseline justify-between gap-4">
            <span class="text-2xl font-bold tracking-wide">{{ analysis.ticker }}</span>
            <span class="font-mono text-xl tabular-nums text-gray-200">
              {{ analysis.lastClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-4">
            <span :class="badgeClasses(analysis.prediction.signal)">
              {{ analysis.prediction.signal }}
            </span>
            <span :class="['text-sm font-semibold tabular-nums', signalTextColor(analysis.prediction.signal)]">
              {{ analysis.prediction.confidenceScore }}% confident
            </span>
          </div>

          <!-- Rich interpretation from interpreter.ts -->
          <p class="text-sm leading-relaxed text-gray-300">
            {{ analysis.interpretation }}
          </p>

          <div class="border-t border-gray-800" />

          <div>
            <p class="text-xs font-medium uppercase tracking-wider text-gray-500">Expected 10-day range</p>
            <p class="mt-1.5 font-mono text-base tabular-nums text-gray-200">
              {{ analysis.prediction.moveRange.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              <span class="mx-2 text-gray-600">&mdash;</span>
              {{ analysis.prediction.moveRange.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </p>
          </div>

        </div>

        <!-- ── Price chart ──────────────────────────────────────── -->
        <ClientOnly>
          <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-4 pb-3 pt-3">

            <!-- Chart header: caption + GARCH toggle -->
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-medium text-gray-600">
                Last {{ analysis.closes.length }} sessions + 10-day projection
              </p>
              <label class="flex cursor-pointer select-none items-center gap-1.5">
                <input
                  v-model="showGarchBands"
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-gray-600 accent-green-500"
                />
                <span class="text-xs text-gray-500">GARCH bands</span>
              </label>
            </div>

            <div class="h-52" :key="`${activeTicker}-${showGarchBands}`">
              <Line :data="chartData" :options="chartOptions" />
            </div>

          </div>
          <template #fallback>
            <div class="h-64 animate-pulse rounded-xl border border-gray-800 bg-gray-900/60" />
          </template>
        </ClientOnly>

        <!-- ── Detailed Analysis (collapsible) ────────────────── -->
        <div class="rounded-xl border border-gray-800 bg-gray-900/40">

          <button
            @click="detailsOpen = !detailsOpen"
            :aria-expanded="detailsOpen"
            class="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-gray-400 transition-colors hover:text-white"
          >
            <span>Detailed Analysis</span>
            <svg
              :class="['h-4 w-4 transition-transform duration-300', detailsOpen ? 'rotate-180' : '']"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6l5 5 5-5" />
            </svg>
          </button>

          <div
            :class="[
              'grid transition-all duration-300 ease-in-out',
              detailsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            ]"
          >
            <div class="overflow-hidden">
              <div class="space-y-5 border-t border-gray-800 px-5 pb-5 pt-4">

                <section>
                  <h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Technical Signals
                  </h3>
                  <div class="space-y-1.5">
                    <SignalCard
                      v-for="signal in analysis.signals"
                      :key="signal.name"
                      :signal="signal"
                    />
                  </div>
                </section>

                <section class="flex gap-3">
                  <div class="flex-1 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3">
                    <p class="text-xs text-gray-500">Market Regime</p>
                    <p class="mt-1 text-sm font-semibold text-gray-200">
                      {{ analysis.regime.regime }}
                      <span class="ml-1 font-mono text-xs text-gray-500">H={{ analysis.regime.hurst.toFixed(3) }}</span>
                    </p>
                  </div>
                  <div class="flex-1 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3">
                    <p class="text-xs text-gray-500">GARCH Volatility</p>
                    <p class="mt-1 text-sm font-semibold text-gray-200">
                      {{ analysis.garch.regimeLabel }}
                      <span class="ml-1 font-mono text-xs text-gray-500">{{ analysis.garch.volTomorrow.toFixed(1) }}%</span>
                    </p>
                  </div>
                </section>

                <section>
                  <h3 class="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Detected Patterns
                  </h3>

                  <p v-if="analysis.patterns.length === 0" class="text-sm text-gray-600">
                    No patterns detected.
                  </p>

                  <div v-else class="space-y-1.5">
                    <div
                      v-for="p in analysis.patterns"
                      :key="p.name"
                      class="rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <span class="text-sm font-medium text-gray-300">{{ p.name }}</span>
                        <span :class="['shrink-0 text-xs font-semibold uppercase tracking-wide', patternColor(p.interpretation)]">
                          {{ p.interpretation.split('—')[0]?.trim() ?? p.interpretation }}
                        </span>
                      </div>
                      <p v-if="p.priceTarget !== null" class="mt-1 text-xs text-gray-500">
                        Target: <span class="font-mono tabular-nums text-gray-300">{{ p.priceTarget.toFixed(2) }}</span>
                      </p>
                      <p v-else class="mt-1 text-xs text-gray-500">{{ p.interpretation }}</p>
                    </div>
                  </div>
                </section>

              </div>
            </div>
          </div>

        </div>

      </template>

    </div>
  </div>
</template>
