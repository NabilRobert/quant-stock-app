<script setup lang="ts">
import type { AnalysisResult } from '~/types'

const { data: results, pending, error } = await useFetch<AnalysisResult[]>('/api/screener', {
  query: { tickers: 'AAPL,MSFT,TSLA' },
})
</script>

<template>
  <main class="min-h-screen bg-gray-950 text-white">
    <div v-if="pending">Loading…</div>
    <div v-else-if="error">{{ error.message }}</div>
    <template v-else-if="results">
      <div v-for="result in results" :key="result.ticker">
        <PredictionPanel :prediction="result.prediction" />
        <SignalCard v-for="sig in result.signals" :key="sig.name" :signal="sig" />
      </div>
    </template>
    <Disclaimer />
  </main>
</template>
