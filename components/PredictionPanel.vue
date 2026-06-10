<script setup lang="ts">
import type { PredictionOutput } from '~/types'

const props = defineProps<{
  prediction: PredictionOutput
  ticker: string
  lastClose: number
}>()

function signalBadge(signal: PredictionOutput['signal']): string {
  if (signal === 'BULLISH') return 'bg-green-900/50 text-green-300 border border-green-700/60 ring-1 ring-green-800/40'
  if (signal === 'BEARISH') return 'bg-red-900/50 text-red-300 border border-red-700/60 ring-1 ring-red-800/40'
  return 'bg-gray-800/60 text-gray-300 border border-gray-700/60 ring-1 ring-gray-700/30'
}

function confidenceColor(conf: PredictionOutput['confidence']): string {
  if (conf === 'HIGH') return 'text-white font-semibold'
  if (conf === 'MODERATE') return 'text-gray-300 font-medium'
  return 'text-gray-500 font-normal'
}

function scoreText(score: number): string {
  return score > 0 ? `+${score}` : String(score)
}
</script>

<template>
  <div class="rounded-xl border border-gray-700/50 bg-gray-900 p-6 space-y-4">

    <!-- Ticker + last close -->
    <div class="flex items-baseline justify-between">
      <span class="text-2xl font-bold tracking-wide text-white">{{ props.ticker }}</span>
      <span class="font-mono text-lg tabular-nums text-gray-300">
        {{ props.lastClose.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </span>
    </div>

    <!-- Signal badge -->
    <div>
      <span
        :class="['inline-flex items-center rounded-full px-5 py-1.5 text-sm font-bold uppercase tracking-widest', signalBadge(props.prediction.signal)]"
      >
        {{ props.prediction.signal }}
      </span>
    </div>

    <!-- Confidence -->
    <div class="flex items-center gap-2 text-sm">
      <span class="text-gray-500">Confidence:</span>
      <span :class="confidenceColor(props.prediction.confidence)">
        {{ props.prediction.confidence }}
      </span>
    </div>

    <!-- Move range -->
    <div class="text-sm text-gray-400">
      Expected 10-day range:
      <span class="font-mono tabular-nums text-gray-200">
        {{ props.prediction.moveRange.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        &mdash;
        {{ props.prediction.moveRange.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </span>
    </div>

    <!-- Composite score -->
    <div class="text-sm text-gray-500">
      Score:
      <span class="font-mono font-semibold text-gray-100">{{ scoreText(props.prediction.score) }}</span>
    </div>

  </div>
</template>
