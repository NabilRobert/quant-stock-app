<script setup lang="ts">
const {
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
} = useScreener()
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">

    <!-- Disclaimer -->
    <Disclaimer />

    <!-- Page header -->
    <div class="mx-auto max-w-6xl px-6 pt-10 pb-6">
      <h1 class="text-2xl font-bold tracking-tight text-white">IDX Stock Screener</h1>
      <p class="mt-1 text-sm text-gray-400">Scan and rank IDX stocks by signal strength</p>
    </div>

    <!-- Scan button -->
    <div class="mx-auto max-w-6xl px-6 pb-8">
      <button
        :disabled="pending"
        class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        @click="scan"
      >
        <svg
          v-if="pending"
          class="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {{ pending ? 'Scanning…' : 'Scan IDX Universe' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-24">
      <div class="flex flex-col items-center gap-3">
        <svg class="h-8 w-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="text-sm text-gray-400">Analysing 20 tickers…</span>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-auto max-w-6xl px-6">
      <div class="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
        Scan failed: {{ error.message }}
      </div>
    </div>

    <!-- Results -->
    <template v-else-if="sortedResults.length > 0">

      <!-- Summary line -->
      <div class="mx-auto max-w-6xl px-6 pb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="font-medium text-green-400">{{ bullishCount }} bullish</span>
        <span class="text-gray-600">·</span>
        <span class="font-medium text-red-400">{{ bearishCount }} bearish</span>
        <span class="text-gray-600">·</span>
        <span class="text-gray-400">{{ neutralCount }} neutral</span>
        <span v-if="scanDuration !== null" class="text-xs text-gray-600">
          — scanned in {{ scanDuration }}s
        </span>
      </div>

      <!-- Table -->
      <div class="mx-auto max-w-6xl px-6 pb-16 overflow-x-auto">
        <table class="w-full min-w-[760px] border-separate border-spacing-0">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
              <th class="pb-3 pl-3 pr-4 font-medium">Ticker</th>
              <th class="pb-3 pr-4 font-medium">Last Close</th>
              <th class="pb-3 pr-4 font-medium">Signal</th>
              <th class="pb-3 pr-4 font-medium">Confidence</th>
              <th class="pb-3 pr-4 font-medium">Score</th>
              <th class="pb-3 pr-4 font-medium">Volatility</th>
              <th class="pb-3 pr-4 font-medium">Regime</th>
              <th class="pb-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sortedResults"
              :key="r.ticker"
              class="border-b border-gray-800/50 transition-colors hover:bg-gray-900/50"
            >
              <td :class="['py-3 pr-4 font-mono font-semibold text-white', rowAccentClass(r.prediction.signal)]">
                {{ r.ticker }}
              </td>
              <td class="py-3 pr-4 font-mono tabular-nums text-sm text-gray-300">
                {{ r.lastClose.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) }}
              </td>
              <td class="py-3 pr-4">
                <span :class="['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider', signalBadgeClass(r.prediction.signal)]">
                  {{ r.prediction.signal }}
                </span>
              </td>
              <td :class="['py-3 pr-4 text-sm font-semibold tabular-nums', signalTextClass(r.prediction.signal)]">
                {{ r.prediction.confidenceScore }}%
              </td>
              <td :class="['py-3 pr-4 font-mono text-sm tabular-nums', scoreClass(r.prediction.score)]">
                {{ scoreText(r.prediction.score) }}
              </td>
              <td :class="['py-3 pr-4 font-mono text-sm tabular-nums', volClass(r.garch.volTomorrow)]">
                {{ r.garch.volTomorrow.toFixed(1) }}%
              </td>
              <td class="py-3 pr-4">
                <span class="text-xs uppercase tracking-wide text-gray-500">{{ r.regime.regime }}</span>
              </td>
              <td class="py-3">
                <button
                  class="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                  @click="analyse(r.ticker)"
                >
                  Analyse
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </template>

  </div>
</template>
