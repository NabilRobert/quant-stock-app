<script setup lang="ts">
import type { SignalResult } from '~/types'

const props = defineProps<{ signal: SignalResult }>()

function interpColor(interp: string): string {
  if (interp.includes('BULLISH') || interp === 'OVERSOLD') return 'text-green-400'
  if (interp.includes('BEARISH') || interp === 'OVERBOUGHT') return 'text-red-400'
  return 'text-gray-500'
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
    <span class="w-24 shrink-0 text-sm font-medium text-gray-300">
      {{ props.signal.name }}
    </span>

    <span class="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-gray-200">
      {{ props.signal.value.toFixed(2) }}
    </span>

    <span
      :class="['flex-1 text-right text-xs font-semibold uppercase tracking-wide', interpColor(props.signal.interpretation)]"
    >
      {{ props.signal.interpretation }}
    </span>
  </div>
</template>
