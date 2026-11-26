import type { Classification, ClassificationBands } from './types.ts'

export const DEFAULT_BANDS: ClassificationBands = { comfortMargin: 0.1, nearMargin: 0.1 }

/** Order from most to least favourable (used for sorting and "best of"). */
export const CLASSIFICATION_ORDER: Classification[] = [
  'WITHIN_RANGE',
  'WITHIN_CLOSING',
  'NEAR_CUTOFF',
  'BEYOND_CUTOFF',
  'INSUFFICIENT_DATA',
]

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  WITHIN_RANGE: 'Historical Cutoff Within Range',
  WITHIN_CLOSING: 'Within Historical Closing Rank',
  NEAR_CUTOFF: 'Near Historical Cutoff',
  BEYOND_CUTOFF: 'Beyond Historical Cutoff',
  INSUFFICIENT_DATA: 'Insufficient Data',
}

export const CLASSIFICATION_DESCRIPTIONS: Record<Classification, string> = {
  WITHIN_RANGE:
    'Your rank is comfortably inside the range of ranks that were allotted this seat (better than the closing rank by more than the comfort margin).',
  WITHIN_CLOSING:
    'Your rank is better than or equal to the historical closing rank, but close to it.',
  NEAR_CUTOFF:
    'Your rank is slightly beyond the historical closing rank (within the near margin). Closing ranks move between years and rounds.',
  BEYOND_CUTOFF: 'Your rank is beyond the historical closing rank by more than the near margin.',
  INSUFFICIENT_DATA: 'No verified official record is available for this comparison.',
}

/**
 * Compares a rank with a historical opening/closing rank pair. Lower ranks are
 * better. Returns a descriptive band – never a probability.
 *
 *   rank ≤ closing × (1 − comfortMargin)                 → WITHIN_RANGE
 *   closing × (1 − comfortMargin) < rank ≤ closing       → WITHIN_CLOSING
 *   closing < rank ≤ closing × (1 + nearMargin)          → NEAR_CUTOFF
 *   rank > closing × (1 + nearMargin)                    → BEYOND_CUTOFF
 */
export function classifyRank(
  rank: number | null | undefined,
  openingRank: number | null | undefined,
  closingRank: number | null | undefined,
  bands: ClassificationBands = DEFAULT_BANDS,
): Classification {
  if (!isPositiveInt(rank) || !isPositiveInt(closingRank)) return 'INSUFFICIENT_DATA'
  if (openingRank != null && (!isPositiveInt(openingRank) || openingRank > closingRank)) return 'INSUFFICIENT_DATA'
  if (rank <= closingRank * (1 - bands.comfortMargin)) return 'WITHIN_RANGE'
  if (rank <= closingRank) return 'WITHIN_CLOSING'
  if (rank <= closingRank * (1 + bands.nearMargin)) return 'NEAR_CUTOFF'
  return 'BEYOND_CUTOFF'
}

export function bestClassification(values: Classification[]): Classification {
  let best: Classification = 'INSUFFICIENT_DATA'
  for (const v of values) {
    if (CLASSIFICATION_ORDER.indexOf(v) < CLASSIFICATION_ORDER.indexOf(best)) best = v
  }
  return best
}

export function classificationRank(value: Classification): number {
  return CLASSIFICATION_ORDER.indexOf(value)
}

function isPositiveInt(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
}
