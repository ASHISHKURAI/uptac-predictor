/**
 * Shared domain types for the UPTAC prediction engine.
 *
 * This module is imported by the Supabase Edge Function (`predict`, Deno) and by
 * the web app / unit tests (Vite, Vitest). Keep it free of runtime dependencies,
 * Node.js and Deno specific APIs, and use explicit `.ts` relative imports.
 */

export type StudentCategory = 'OPEN' | 'EWS' | 'BC' | 'SC' | 'ST'
export type ReservationCategory = StudentCategory | 'ANY'
export type SeatType = 'GENERAL' | 'GIRL' | 'AF' | 'FF' | 'PH' | 'TFW' | 'OTHER'
export type SeatGender = 'NEUTRAL' | 'FEMALE_ONLY'
export type DomicileRequirement = 'UP' | 'ANY'
export type Quota = 'STATE' | 'HOME_STATE' | 'ALL_INDIA' | 'OTHER'
export type RankType = 'CRL' | 'CATEGORY'
export type InstituteType = 'government' | 'aided' | 'private' | 'university'
export type Gender = 'MALE' | 'FEMALE'
export type StudentDomicile = 'UP' | 'OTHER'
/** Horizontal sub-categories / special seat eligibility a student can declare. */
export type SubCategory = 'AF' | 'FF' | 'PH' | 'TFW'
export type InstitutePreference = 'government' | 'private' | 'both'

/**
 * Historical comparison bands. These describe how a rank compares with a past
 * closing rank – they are NOT admission probabilities.
 */
export type Classification =
  | 'WITHIN_RANGE'
  | 'WITHIN_CLOSING'
  | 'NEAR_CUTOFF'
  | 'BEYOND_CUTOFF'
  | 'INSUFFICIENT_DATA'

export interface StudentProfile {
  /** JEE Main Common Rank List (CRL) rank. */
  crlRank: number
  /** Optional JEE Main category rank – only compared with category-rank records. */
  categoryRank?: number | null
  category: StudentCategory
  gender: Gender
  domicile: StudentDomicile
  subCategories: SubCategory[]
}

export interface PredictionRequest extends StudentProfile {
  /** Year the student is seeking admission in. Historical years before it are compared. */
  admissionYear: number
  /** Historical counselling years to compare. Defaults to the latest available years. */
  years?: number[]
  /** Preferred canonical branch codes. Empty = all branches. */
  branchCodes?: string[]
  institutePreference: InstitutePreference
}

export interface CutoffRecord {
  id: string
  academic_year: number
  round_number: number
  round_label: string | null
  college_code: string
  branch_code: string
  shift: string
  program_name: string | null
  category: ReservationCategory
  seat_type: SeatType
  category_code: string | null
  gender: SeatGender
  domicile: DomicileRequirement
  quota: Quota
  rank_type: RankType
  exam: string
  opening_rank: number
  closing_rank: number
  source_id: string
  source_page: number | null
}

export interface CollegeInfo {
  code: string
  name: string
  short_name: string | null
  institute_type: InstituteType
  district: string | null
  city: string | null
  website: string | null
}

export interface BranchInfo {
  code: string
  name: string
  short_name: string | null
}

export interface SourceInfo {
  id: string
  title: string
  url: string | null
  academic_year: number | null
  document_type: string
}

export interface CandidateData {
  records: CutoffRecord[]
  colleges: CollegeInfo[]
  branches: BranchInfo[]
  sources: SourceInfo[]
  total_groups: number
  returned_groups: number
}

export interface EligibilityRules {
  categories: ReservationCategory[]
  seatTypes: SeatType[]
  genders: SeatGender[]
  domiciles: DomicileRequirement[]
  quotas: Quota[]
  rankTypes: RankType[]
  instituteTypes: InstituteType[]
  /** Human-readable explanation of every rule that was applied. */
  notes: string[]
}

export interface RoundResult {
  round_number: number
  round_label: string | null
  opening_rank: number
  closing_rank: number
  classification: Classification
  source_id: string
  source_page: number | null
}

export interface YearResult {
  year: number
  /** Empty when no verified record exists for this seat group in this year. */
  rounds: RoundResult[]
  /** Classification against the last available round of the year. */
  final_round: RoundResult | null
  classification: Classification
}

export interface SeatGroupResult {
  key: string
  category: ReservationCategory
  seat_type: SeatType
  category_code: string | null
  gender: SeatGender
  quota: Quota
  domicile: DomicileRequirement
  rank_type: RankType
  /** Rank of the student that was compared (CRL or category rank). */
  compared_rank: number
  years: YearResult[]
  /** Classification for the most recent year that has data. */
  classification: Classification
  latest_year_with_data: number | null
  years_with_data: number
  years_within_closing: number
  /** Final-round closing rank by year (oldest → newest) for trend charts. */
  closing_trend: Array<{ year: number; closing_rank: number | null }>
}

export interface ProgramResult {
  key: string
  college: CollegeInfo
  branch: BranchInfo
  shift: string
  program_name: string | null
  seat_groups: SeatGroupResult[]
  /** Most favourable classification across the eligible seat groups. */
  best_classification: Classification
  /** Latest final-round closing rank of the best seat group (sorting / display). */
  reference_closing_rank: number | null
}

export interface PredictionSummary {
  programs: number
  seat_groups: number
  by_classification: Record<Classification, number>
}

export interface PredictionResult {
  generated_at: string
  request: PredictionRequest
  years: number[]
  years_without_data: number[]
  eligibility: EligibilityRules
  bands: ClassificationBands
  programs: ProgramResult[]
  /** Preferred branches for which no verified matching record exists. */
  branches_without_data: string[]
  summary: PredictionSummary
  sources: SourceInfo[]
  truncated: boolean
  total_groups: number
  disclaimer: string
}

export interface ClassificationBands {
  /** A rank within this fraction below the closing rank is "Within Historical Closing Rank". */
  comfortMargin: number
  /** A rank up to this fraction beyond the closing rank is "Near Historical Cutoff". */
  nearMargin: number
}
