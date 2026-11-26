/**
 * Chart tokens. Categorical order validated with the dataviz palette validator
 * (light surface): CVD worst adjacent ΔE 9.1, normal-vision ΔE 19.6. Slots 3–5
 * sit below 3:1 contrast, so every chart ships with a legend + a table view.
 * Assign in fixed order – colour follows the entity, never its rank.
 */
export const SERIES = ['#2a4be0', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const

export const CHART = {
  surface: '#ffffff',
  grid: '#e3e9f5',
  axis: '#c7d2e8',
  textPrimary: '#0b1739',
  textSecondary: '#4a5e91',
  textMuted: '#6c80b0',
  areaOpacity: 0.1,
  barSize: 20,
}

export function seriesColor(index: number): string {
  return SERIES[index] ?? SERIES[SERIES.length - 1]
}

/** Compact tick labels: 0 / 10K / 2.5L style kept readable for rank axes. */
export function compactRank(value: number): string {
  if (value >= 100000) return `${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return String(value)
}
