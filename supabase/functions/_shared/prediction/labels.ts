import type { DomicileRequirement, Quota, RankType, ReservationCategory, SeatGender, SeatType } from './types.ts'

export const CATEGORY_LABELS: Record<ReservationCategory, string> = {
  OPEN: 'OPEN',
  EWS: 'EWS',
  BC: 'OBC-NCL (BC)',
  SC: 'SC',
  ST: 'ST',
  ANY: 'All categories',
}

export const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  GENERAL: 'No sub-category',
  GIRL: 'Girl (GL)',
  AF: 'Armed forces (AF)',
  FF: 'Freedom fighter (FF)',
  PH: 'PwD (PH)',
  TFW: 'Tuition fee waiver (TFW)',
  OTHER: 'Other',
}

export const GENDER_LABELS: Record<SeatGender, string> = {
  NEUTRAL: 'Gender-neutral / Co-ed',
  FEMALE_ONLY: 'Female only',
}

export const QUOTA_LABELS: Record<Quota, string> = {
  STATE: 'State counselling',
  HOME_STATE: 'Home state (UP)',
  ALL_INDIA: 'All India',
  OTHER: 'Other quota',
}

export const DOMICILE_LABELS: Record<DomicileRequirement, string> = {
  UP: 'UP domicile only',
  ANY: 'Open to all domiciles',
}

export const RANK_TYPE_LABELS: Record<RankType, string> = {
  CRL: 'JEE Main CRL rank',
  CATEGORY: 'Category rank',
}

/** Short official-style seat code, e.g. OPNO, BCGL, TFW. */
export function seatCode(category: ReservationCategory, seatType: SeatType): string {
  if (seatType === 'TFW') return 'TFW'
  const prefix = category === 'OPEN' ? 'OP' : category === 'ANY' ? '' : category
  const suffix: Record<SeatType, string> = { GENERAL: 'NO', GIRL: 'GL', AF: 'AF', FF: 'FF', PH: 'PH', TFW: 'TFW', OTHER: 'OT' }
  return `${prefix}${suffix[seatType]}`
}

export function describeSeat(g: {
  category: ReservationCategory
  seat_type: SeatType
  gender: SeatGender
  quota: Quota
}): string {
  const parts = [CATEGORY_LABELS[g.category]]
  if (g.seat_type !== 'GENERAL') parts.push(SEAT_TYPE_LABELS[g.seat_type])
  if (g.gender === 'FEMALE_ONLY') parts.push('Female only')
  if (g.quota !== 'STATE') parts.push(QUOTA_LABELS[g.quota])
  return parts.join(' · ')
}
