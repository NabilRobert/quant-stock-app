<script setup lang="ts">
import type { AnalysisResult } from '~/types'

const { data: analysis, pending, error } = await useFetch<AnalysisResult>('/api/analyze', {
  query: { ticker: 'AAPL' },
})
</script>

<template>
  <main class="min-h-screen bg-gray-950 text-white">
    <div v-if="pending">Loading…</div>
    <div v-else-if="error">{{ error.message }}</div>
    <template v-else-if="analysis">
      <PredictionPanel :prediction="analysis.prediction" />
      <SignalCard v-for="sig in analysis.signals" :key="sig.name" :signal="sig" />
    </template>
    <Disclaimer />
  </main>
</template>
