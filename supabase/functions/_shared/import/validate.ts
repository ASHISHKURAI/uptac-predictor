import type { Issue } from './normalize.ts'

const CATEGORIES = ['OPEN', 'EWS', 'BC', 'SC', 'ST', 'ANY']
const SEAT_TYPES = ['GENERAL', 'GIRL', 'AF', 'FF', 'PH', 'TFW', 'OTHER']
const GENDERS = ['NEUTRAL', 'FEMALE_ONLY']
const DOMICILES = ['UP', 'ANY']
const QUOTAS = ['STATE', 'HOME_STATE', 'ALL_INDIA', 'OTHER']
const RANK_TYPES = ['CRL', 'CATEGORY']
const SHIFTS = ['', 'I', 'II', 'III']

export interface EditableStagingRow {
  record_type: 'cutoff' | 'seat_matrix'
  academic_year: number | null
  round_number: number | null
  college_code: string | null
  branch_code: string | null
  shift: string
  category: string | null
  seat_type: string | null
  gender: string | null
  domicile: string | null
  quota: string | null
  rank_type: string | null
  exam: string | null
  opening_rank: number | null
  closing_rank: number | null
  seats: number | null
  issues: Issue[]
}

/** Issue codes produced by structural validation (re-computed after edits). */
const STRUCTURAL = new Set([
  'unknown_college', 'unknown_branch', 'invalid_category', 'invalid_gender', 'missing_round', 'missing_rank',
  'invalid_rank', 'rank_order', 'implausible_rank', 'invalid_seats', 'missing_year', 'invalid_value',
])

/**
 * Re-validates a staging row after an admin edits it. Informational / warning
 * issues from extraction (e.g. preparatory rank, seat total mismatch) are kept;
 * structural errors are recomputed from the current values.
 */
export function revalidateStagingRow(
  row: EditableStagingRow,
  refs: { collegeCodes: Set<string>; branchCodes: Set<string> },
): { issues: Issue[]; has_errors: boolean } {
  const issues: Issue[] = row.issues.filter((i) => !STRUCTURAL.has(i.code))
  const err = (code: string, message: string, field?: string) => issues.push({ code, severity: 'error', message, ...(field ? { field } : {}) })

  if (!row.academic_year || row.academic_year < 2000 || row.academic_year > 2100) err('missing_year', 'Academic year is missing or invalid.', 'academic_year')
  if (!row.college_code || !refs.collegeCodes.has(row.college_code)) err('unknown_college', 'Select a college that exists in the directory.', 'college_code')
  if (!row.branch_code || !refs.branchCodes.has(row.branch_code)) err('unknown_branch', 'Select a branch that exists in the catalogue.', 'branch_code')
  if (!SHIFTS.includes(row.shift)) err('invalid_value', 'Shift must be blank, I, II or III.', 'shift')
  if (!row.category || !CATEGORIES.includes(row.category)) err('invalid_category', 'Select a valid category.', 'category')
  if (!row.seat_type || !SEAT_TYPES.includes(row.seat_type)) err('invalid_category', 'Select a valid seat type.', 'seat_type')
  if (!row.gender || !GENDERS.includes(row.gender)) err('invalid_gender', 'Select the seat gender.', 'gender')
  if (!row.domicile || !DOMICILES.includes(row.domicile)) err('invalid_value', 'Select the domicile requirement.', 'domicile')
  if (!row.quota || !QUOTAS.includes(row.quota)) err('invalid_value', 'Select the quota.', 'quota')

  if (row.record_type === 'cutoff') {
    if (!row.round_number || row.round_number < 1 || row.round_number > 20) err('missing_round', 'Round must be between 1 and 20.', 'round_number')
    if (!row.rank_type || !RANK_TYPES.includes(row.rank_type)) err('invalid_value', 'Select the rank type.', 'rank_type')
    if (!row.exam) err('invalid_value', 'Exam is required.', 'exam')
    const o = row.opening_rank
    const c = row.closing_rank
    if (o == null || c == null) err('missing_rank', 'Opening and closing rank are required.', o == null ? 'opening_rank' : 'closing_rank')
    else if (!Number.isInteger(o) || !Number.isInteger(c) || o <= 0 || c <= 0) err('invalid_rank', 'Ranks must be positive whole numbers.')
    else if (o > c) err('rank_order', 'Opening rank cannot be greater than closing rank.')
    else if (c > 2_000_000) err('implausible_rank', 'Closing rank is outside the plausible range.', 'closing_rank')
  } else if (row.seats == null || !Number.isInteger(row.seats) || row.seats < 0) {
    err('invalid_seats', 'Seats must be a whole number ≥ 0.', 'seats')
  }

  return { issues, has_errors: issues.some((i) => i.severity === 'error') }
}
