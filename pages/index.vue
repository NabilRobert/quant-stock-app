<script setup lang="ts">
import { Line } from 'vue-chartjs'
import type { Timeframe } from '~/composables/useAnalysis'

const CHART_TIMEFRAMES: readonly Timeframe[] = ['1W', '1M', '3M', '6M', '1Y', 'All']

const {
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
} = useAnalysis()
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

            <!-- Timeframe selector -->
            <div class="mb-3 flex items-center gap-1">
              <button
                v-for="tf in CHART_TIMEFRAMES"
                :key="tf"
                :class="[
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  selectedTimeframe === tf
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                ]"
                @click="selectedTimeframe = tf"
              >
                {{ tf }}
              </button>
            </div>

            <!-- Caption + GARCH toggle -->
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-medium text-gray-600">{{ chartCaption }}</p>
              <label class="flex cursor-pointer select-none items-center gap-1.5">
                <input
                  v-model="showGarchBands"
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded border-gray-600 accent-green-500"
                />
                <span class="text-xs text-gray-500">GARCH bands</span>
              </label>
            </div>

            <div class="h-60" :key="`${activeTicker}-${showGarchBands}-${selectedTimeframe}`">
              <Line :data="chartData" :options="chartOptions" :plugins="chartPlugins" />
            </div>

            <!-- Static legend -->
            <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-gray-800/50 pt-2.5">
              <div class="flex items-center gap-1.5">
                <svg width="20" height="10" class="shrink-0">
                  <line x1="0" y1="5" x2="20" y2="5" stroke="#4ade80" stroke-width="1.5" />
                </svg>
                <span class="text-xs text-gray-500">Price</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg width="20" height="10" class="shrink-0">
                  <line x1="0" y1="5" x2="20" y2="5" stroke="rgba(96,165,250,0.75)" stroke-width="1.5" stroke-dasharray="4,4" />
                </svg>
                <span class="text-xs text-gray-500">Trend projection</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg width="20" height="10" class="shrink-0">
                  <line x1="0" y1="5" x2="20" y2="5" stroke="rgba(74,222,128,0.55)" stroke-width="1" stroke-dasharray="5,4" />
                </svg>
                <span class="text-xs text-gray-500">Support level</span>
              </div>
              <div class="flex items-center gap-1.5">
                <svg width="20" height="10" class="shrink-0">
                  <line x1="0" y1="5" x2="20" y2="5" stroke="rgba(248,113,113,0.55)" stroke-width="1" stroke-dasharray="5,4" />
                </svg>
                <span class="text-xs text-gray-500">Resistance level</span>
              </div>
              <div v-if="showGarchBands" class="flex items-center gap-1.5">
                <svg width="20" height="10" class="shrink-0">
                  <rect x="0" y="1" width="20" height="8" fill="rgba(74,222,128,0.08)" />
                  <line x1="0" y1="2" x2="20" y2="2" stroke="rgba(74,222,128,0.7)" stroke-width="1" stroke-dasharray="3,3" />
                  <line x1="0" y1="8" x2="20" y2="8" stroke="rgba(248,113,113,0.7)" stroke-width="1" stroke-dasharray="3,3" />
                </svg>
                <span class="text-xs text-gray-500">Volatility range</span>
              </div>
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
