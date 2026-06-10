import type { OHLCVBar, PatternResult } from '~/types'

// ── Internal helpers ──────────────────────────────────────────────────────────

interface SwingPoint {
  idx: number
  price: number
}

function findPeaks(bars: OHLCVBar[]): SwingPoint[] {
  const peaks: SwingPoint[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const h = bars[i]!.high
    if (
      h > bars[i - 2]!.high &&
      h > bars[i - 1]!.high &&
      h > bars[i + 1]!.high &&
      h > bars[i + 2]!.high
    ) {
      peaks.push({ idx: i, price: h })
    }
  }
  return peaks
}

function findTroughs(bars: OHLCVBar[]): SwingPoint[] {
  const troughs: SwingPoint[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const l = bars[i]!.low
    if (
      l < bars[i - 2]!.low &&
      l < bars[i - 1]!.low &&
      l < bars[i + 1]!.low &&
      l < bars[i + 2]!.low
    ) {
      troughs.push({ idx: i, price: l })
    }
  }
  return troughs
}

function minLowBetween(bars: OHLCVBar[], from: number, to: number): number {
  let min = Infinity
  for (let i = from; i <= to; i++) {
    if (bars[i]!.low < min) min = bars[i]!.low
  }
  return min
}

function maxHighBetween(bars: OHLCVBar[], from: number, to: number): number {
  let max = -Infinity
  for (let i = from; i <= to; i++) {
    if (bars[i]!.high > max) max = bars[i]!.high
  }
  return max
}

// Symmetric percent proximity check: |a - b| / avg(a, b) <= threshold
function withinPct(a: number, b: number, threshold: number): boolean {
  return Math.abs(a - b) / ((a + b) / 2) <= threshold
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function detectSupportResistance(
  bars: OHLCVBar[],
): { support: number; resistance: number } {
  if (bars.length === 0) {
    throw new Error('detectSupportResistance: bars must not be empty')
  }

  const window = bars.slice(-50)
  let support = Infinity
  let resistance = -Infinity

  for (const bar of window) {
    if (bar.low < support) support = bar.low
    if (bar.high > resistance) resistance = bar.high
  }

  return { support, resistance }
}

export function detectDoubleTop(bars: OHLCVBar[]): PatternResult {
  if (bars.length < 5) {
    throw new Error(`detectDoubleTop: requires at least 5 bars, got ${bars.length}`)
  }

  const peaks = findPeaks(bars)
  let detected = false
  let priceTarget: number | null = null

  for (let i = 0; i < peaks.length - 1; i++) {
    const p1 = peaks[i]!
    const p2 = peaks[i + 1]!

    if (!withinPct(p1.price, p2.price, 0.03)) continue

    const neckline = minLowBetween(bars, p1.idx, p2.idx)
    const avgPeak = (p1.price + p2.price) / 2

    detected = true
    priceTarget = neckline - (avgPeak - neckline)
  }

  const interpretation = detected
    ? `BEARISH — measured move target: ${priceTarget!.toFixed(2)}`
    : 'Not detected'

  return { name: 'Double Top', detected, priceTarget, interpretation }
}

export function detectDoubleBottom(bars: OHLCVBar[]): PatternResult {
  if (bars.length < 5) {
    throw new Error(`detectDoubleBottom: requires at least 5 bars, got ${bars.length}`)
  }

  const troughs = findTroughs(bars)
  let detected = false
  let priceTarget: number | null = null

  for (let i = 0; i < troughs.length - 1; i++) {
    const t1 = troughs[i]!
    const t2 = troughs[i + 1]!

    if (!withinPct(t1.price, t2.price, 0.03)) continue

    const neckline = maxHighBetween(bars, t1.idx, t2.idx)
    const avgTrough = (t1.price + t2.price) / 2

    detected = true
    priceTarget = neckline + (neckline - avgTrough)
  }

  const interpretation = detected
    ? `BULLISH — measured move target: ${priceTarget!.toFixed(2)}`
    : 'Not detected'

  return { name: 'Double Bottom', detected, priceTarget, interpretation }
}

export function detectHeadAndShoulders(bars: OHLCVBar[]): PatternResult {
  if (bars.length < 9) {
    throw new Error(`detectHeadAndShoulders: requires at least 9 bars, got ${bars.length}`)
  }

  const peaks = findPeaks(bars)
  let detected = false
  let priceTarget: number | null = null

  for (let i = 0; i < peaks.length - 2; i++) {
    const leftShoulder = peaks[i]!
    const head = peaks[i + 1]!
    const rightShoulder = peaks[i + 2]!

    if (head.price <= leftShoulder.price) continue
    if (head.price <= rightShoulder.price) continue
    if (!withinPct(leftShoulder.price, rightShoulder.price, 0.03)) continue

    // Neckline = average of the lowest lows in each trough flanking the head
    const trough1Low = minLowBetween(bars, leftShoulder.idx, head.idx)
    const trough2Low = minLowBetween(bars, head.idx, rightShoulder.idx)
    const neckline = (trough1Low + trough2Low) / 2

    detected = true
    priceTarget = neckline - (head.price - neckline)
  }

  const interpretation = detected
    ? `BEARISH — measured move target: ${priceTarget!.toFixed(2)}`
    : 'Not detected'

  return { name: 'Head and Shoulders', detected, priceTarget, interpretation }
}

export function detectAllPatterns(bars: OHLCVBar[]): PatternResult[] {
  if (bars.length < 20) {
    throw new Error(`detectAllPatterns: requires at least 20 bars, got ${bars.length}`)
  }

  const candidates = [
    detectDoubleTop(bars),
    detectDoubleBottom(bars),
    detectHeadAndShoulders(bars),
  ]

  const results: PatternResult[] = candidates.filter((p) => p.detected)

  const { support, resistance } = detectSupportResistance(bars)
  results.push({
    name: 'Support/Resistance',
    detected: true,
    priceTarget: null,
    interpretation: `Support: ${support.toFixed(2)}, Resistance: ${resistance.toFixed(2)}`,
  })

  return results
}
