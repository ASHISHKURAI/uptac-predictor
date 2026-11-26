import { CLASSIFICATION_ORDER, DEFAULT_BANDS, bestClassification, classificationRank, classifyRank } from './classify.ts'
import { comparableRank, deriveEligibility, isRecordEligible } from './eligibility.ts'
import type {
  BranchInfo,
  CandidateData,
  Classification,
  ClassificationBands,
  CollegeInfo,
  CutoffRecord,
  PredictionRequest,
  PredictionResult,
  ProgramResult,
  RoundResult,
  SeatGroupResult,
  YearResult,
} from './types.ts'

export const PREDICTION_DISCLAIMER =
  'These results compare your rank with verified historical UPTAC opening and closing ranks. They are not a forecast of ' +
  'future cutoffs and do not guarantee admission – cutoffs change every year and every round. Always confirm with the ' +
  'official UPTAC portal, brochure and notices before making decisions.'

export const MAX_COMPARISON_YEARS = 5

export interface EngineOptions {
  bands?: ClassificationBands
}

/**
 * Chooses which historical years to compare: the requested years (if any) or the
 * most recent `count` years with verified data up to the admission year.
 */
export function selectYears(admissionYear: number, availableYears: number[], requested?: number[], count = 3): number[] {
  if (requested && requested.length > 0) {
    return [...new Set(requested.filter((y) => Number.isInteger(y) && y <= admissionYear))]
      .sort((a, b) => b - a)
      .slice(0, MAX_COMPARISON_YEARS)
  }
  return [...new Set(availableYears)]
    .filter((y) => y <= admissionYear)
    .sort((a, b) => b - a)
    .slice(0, count)
}

/**
 * Special / spot / internal-sliding rounds fill only leftover seats and their
 * closing ranks are erratic, so a year's headline uses the last REGULAR round
 * (all rounds are still shown individually). Falls back to the last round.
 */
export function isSpecialRound(label: string | null | undefined): boolean {
  return /special|spot|sliding|vacan|mop[\s-]?up|stray/i.test(label ?? '')
}

export function pickFinalRound<T extends { round_number: number; round_label: string | null }>(rounds: T[]): T | null {
  if (rounds.length === 0) return null
  const sorted = [...rounds].sort((a, b) => a.round_number - b.round_number)
  const regular = sorted.filter((r) => !isSpecialRound(r.round_label))
  return (regular.length > 0 ? regular : sorted)[(regular.length > 0 ? regular : sorted).length - 1]
}

export function seatGroupKey(r: Pick<CutoffRecord, 'college_code' | 'branch_code' | 'shift' | 'category' | 'seat_type' | 'gender' | 'quota' | 'domicile' | 'rank_type'>): string {
  return [r.college_code, r.branch_code, r.shift, r.category, r.seat_type, r.gender, r.quota, r.domicile, r.rank_type].join('|')
}

export function programKey(r: Pick<CutoffRecord, 'college_code' | 'branch_code' | 'shift'>): string {
  return [r.college_code, r.branch_code, r.shift].join('|')
}

/**
 * Runs the data-driven comparison for a student. Pure function: all data is
 * passed in (fetched by the caller from verified database records only).
 */
export function runPrediction(
  request: PredictionRequest,
  years: number[],
  data: CandidateData & { branches_with_records?: string[] },
  options: EngineOptions = {},
): PredictionResult {
  const bands = options.bands ?? DEFAULT_BANDS
  const eligibility = deriveEligibility(request, request.institutePreference)
  const yearSet = new Set(years)
  const sortedYears = [...yearSet].sort((a, b) => b - a)

  const collegeByCode = new Map<string, CollegeInfo>(data.colleges.map((c) => [c.code, c]))
  const branchByCode = new Map<string, BranchInfo>(data.branches.map((b) => [b.code, b]))
  const allowedInstituteTypes = new Set(eligibility.instituteTypes)
  const preferredBranches = new Set(request.branchCodes ?? [])

  // 1. Defensive filtering – never trust the data layer alone.
  const records = data.records.filter((r) => {
    if (!yearSet.has(r.academic_year)) return false
    if (r.exam !== 'JEE-MAIN') return false
    if (!isRecordEligible(r, eligibility)) return false
    if (preferredBranches.size > 0 && !preferredBranches.has(r.branch_code)) return false
    const college = collegeByCode.get(r.college_code)
    if (!college || !allowedInstituteTypes.has(college.institute_type)) return false
    if (!branchByCode.has(r.branch_code)) return false
    return comparableRank(r, request) !== null
  })

  // 2. Group by exact seat group (seat quotas / categories are never merged).
  const groups = new Map<string, CutoffRecord[]>()
  for (const r of records) {
    const key = seatGroupKey(r)
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  // 3. Classify every seat group year by year and round by round.
  const programs = new Map<string, ProgramResult>()
  for (const [key, groupRecords] of groups) {
    const first = groupRecords[0]
    const rank = comparableRank(first, request) as number
    const yearResults: YearResult[] = sortedYears.map((year) => buildYear(year, groupRecords, rank, bands))
    const withData = yearResults.filter((y) => y.rounds.length > 0)
    const latest = withData[0] ?? null
    const seatGroup: SeatGroupResult = {
      key,
      category: first.category,
      seat_type: first.seat_type,
      category_code: first.category_code,
      gender: first.gender,
      quota: first.quota,
      domicile: first.domicile,
      rank_type: first.rank_type,
      compared_rank: rank,
      years: yearResults,
      classification: latest ? latest.classification : 'INSUFFICIENT_DATA',
      latest_year_with_data: latest ? latest.year : null,
      years_with_data: withData.length,
      years_within_closing: withData.filter((y) => y.classification === 'WITHIN_RANGE' || y.classification === 'WITHIN_CLOSING').length,
      closing_trend: [...sortedYears].reverse().map((year) => {
        const y = yearResults.find((yr) => yr.year === year)
        return { year, closing_rank: y?.final_round?.closing_rank ?? null }
      }),
    }

    const pKey = programKey(first)
    let program = programs.get(pKey)
    if (!program) {
      program = {
        key: pKey,
        college: collegeByCode.get(first.college_code) as CollegeInfo,
        branch: branchByCode.get(first.branch_code) as BranchInfo,
        shift: first.shift,
        program_name: first.program_name,
        seat_groups: [],
        best_classification: 'INSUFFICIENT_DATA',
        reference_closing_rank: null,
      }
      programs.set(pKey, program)
    }
    program.seat_groups.push(seatGroup)
  }

  // 4. Summarise programs and sort: most favourable band first, then the most
  //    competitive historical closing rank first.
  const programList = [...programs.values()]
  for (const p of programList) {
    p.seat_groups.sort(compareSeatGroups)
    p.best_classification = bestClassification(p.seat_groups.map((g) => g.classification))
    const ref = p.seat_groups[0]
    p.reference_closing_rank = latestClosing(ref)
  }
  programList.sort((a, b) => {
    const c = classificationRank(a.best_classification) - classificationRank(b.best_classification)
    if (c !== 0) return c
    const ra = a.reference_closing_rank ?? Number.MAX_SAFE_INTEGER
    const rb = b.reference_closing_rank ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return a.college.name.localeCompare(b.college.name)
  })

  const byClassification = Object.fromEntries(CLASSIFICATION_ORDER.map((c) => [c, 0])) as Record<Classification, number>
  let seatGroupCount = 0
  for (const p of programList) {
    byClassification[p.best_classification] += 1
    seatGroupCount += p.seat_groups.length
  }

  const yearsWithData = new Set(records.map((r) => r.academic_year))
  const branchesInResults = new Set(programList.map((p) => p.branch.code))
  const branchesWithRecords = new Set(data.branches_with_records ?? [...branchesInResults])
  const branchesWithoutData = [...preferredBranches].filter((b) => !branchesWithRecords.has(b) && !branchesInResults.has(b))

  const usedSourceIds = new Set(records.map((r) => r.source_id))

  return {
    generated_at: new Date().toISOString(),
    request,
    years: sortedYears,
    years_without_data: sortedYears.filter((y) => !yearsWithData.has(y)),
    eligibility,
    bands,
    programs: programList,
    branches_without_data: branchesWithoutData,
    summary: { programs: programList.length, seat_groups: seatGroupCount, by_classification: byClassification },
    sources: data.sources.filter((s) => usedSourceIds.has(s.id)),
    truncated: data.returned_groups < data.total_groups,
    total_groups: data.total_groups,
    disclaimer: PREDICTION_DISCLAIMER,
  }
}

function buildYear(year: number, records: CutoffRecord[], rank: number, bands: ClassificationBands): YearResult {
  const byRound = new Map<number, CutoffRecord>()
  for (const r of records) {
    if (r.academic_year === year) byRound.set(r.round_number, r)
  }
  const rounds: RoundResult[] = [...byRound.values()]
    .sort((a, b) => a.round_number - b.round_number)
    .map((r) => ({
      round_number: r.round_number,
      round_label: r.round_label,
      opening_rank: r.opening_rank,
      closing_rank: r.closing_rank,
      classification: classifyRank(rank, r.opening_rank, r.closing_rank, bands),
      source_id: r.source_id,
      source_page: r.source_page,
    }))
  const finalRound = pickFinalRound(rounds)
  return { year, rounds, final_round: finalRound, classification: finalRound ? finalRound.classification : 'INSUFFICIENT_DATA' }
}

function latestClosing(group: SeatGroupResult | undefined): number | null {
  if (!group) return null
  for (const y of group.years) {
    if (y.final_round) return y.final_round.closing_rank
  }
  return null
}

const CATEGORY_ORDER = ['OPEN', 'EWS', 'BC', 'SC', 'ST', 'ANY']

function compareSeatGroups(a: SeatGroupResult, b: SeatGroupResult): number {
  const c = classificationRank(a.classification) - classificationRank(b.classification)
  if (c !== 0) return c
  // Same band: the more lenient closing rank is the more favourable option.
  const ca = latestClosing(a) ?? 0
  const cb = latestClosing(b) ?? 0
  if (ca !== cb) return cb - ca
  return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
}
