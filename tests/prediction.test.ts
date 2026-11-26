import { describe, expect, it } from 'vitest'
import {
  classifyRank,
  deriveEligibility,
  runPrediction,
  selectYears,
  validatePredictionRequest,
  type CandidateData,
  type CutoffRecord,
  type PredictionRequest,
} from '@shared/prediction/index.ts'

/** Synthetic fixtures – fictional codes used only by these tests. */
const colleges: CandidateData['colleges'] = [
  { code: 'G1', name: 'GOVT TEST INSTITUTE, ALPHA', short_name: null, institute_type: 'government', district: 'Lucknow', city: 'ALPHA', website: null },
  { code: 'P1', name: 'PRIVATE TEST COLLEGE, BETA', short_name: null, institute_type: 'private', district: 'Agra', city: 'BETA', website: null },
]
const branches: CandidateData['branches'] = [
  { code: 'CSE', name: 'Computer Science and Engineering', short_name: 'CSE' },
  { code: 'ME', name: 'Mechanical Engineering', short_name: 'ME' },
]
let seq = 0
function rec(p: Partial<CutoffRecord>): CutoffRecord {
  return {
    id: `r${++seq}`,
    academic_year: 2025,
    round_number: 1,
    round_label: null,
    college_code: 'G1',
    branch_code: 'CSE',
    shift: '',
    program_name: null,
    category: 'OPEN',
    seat_type: 'GENERAL',
    category_code: 'OPNO',
    gender: 'NEUTRAL',
    domicile: 'ANY',
    quota: 'STATE',
    rank_type: 'CRL',
    exam: 'JEE-MAIN',
    opening_rank: 1000,
    closing_rank: 20000,
    source_id: 's1',
    source_page: 3,
    ...p,
  }
}
const sources = [{ id: 's1', title: 'Official OR-CR', url: 'https://example.test', academic_year: 2025, document_type: 'opening_closing_rank' }]

const baseRequest: PredictionRequest = {
  crlRank: 18000,
  categoryRank: null,
  admissionYear: 2026,
  category: 'OPEN',
  gender: 'MALE',
  domicile: 'UP',
  subCategories: [],
  branchCodes: [],
  institutePreference: 'both',
}

function data(records: CutoffRecord[], extra: Partial<CandidateData> = {}): CandidateData {
  return { records, colleges, branches, sources, total_groups: 1, returned_groups: 1, ...extra }
}

describe('classifyRank', () => {
  it('uses transparent bands around the closing rank', () => {
    expect(classifyRank(500, 1000, 10000)).toBe('WITHIN_RANGE') // better than opening
    expect(classifyRank(9000, 1000, 10000)).toBe('WITHIN_RANGE') // exactly at 90 %
    expect(classifyRank(9001, 1000, 10000)).toBe('WITHIN_CLOSING')
    expect(classifyRank(10000, 1000, 10000)).toBe('WITHIN_CLOSING')
    expect(classifyRank(10001, 1000, 10000)).toBe('NEAR_CUTOFF')
    expect(classifyRank(11000, 1000, 10000)).toBe('NEAR_CUTOFF')
    expect(classifyRank(11001, 1000, 10000)).toBe('BEYOND_CUTOFF')
  })

  it('reports insufficient data for missing or invalid inputs', () => {
    expect(classifyRank(null, 1, 2)).toBe('INSUFFICIENT_DATA')
    expect(classifyRank(5, null, null)).toBe('INSUFFICIENT_DATA')
    expect(classifyRank(5, 900, 100)).toBe('INSUFFICIENT_DATA')
    expect(classifyRank(5.5, 1, 10)).toBe('INSUFFICIENT_DATA')
  })
})

describe('deriveEligibility', () => {
  it('UP domicile reserved-category girl with PwD gets OPEN + own category, GL and PH seats', () => {
    const r = deriveEligibility({ ...baseRequest, category: 'BC', gender: 'FEMALE', subCategories: ['PH'] })
    expect(r.categories).toEqual(['OPEN', 'BC'])
    expect(r.seatTypes).toEqual(['GENERAL', 'GIRL', 'PH'])
    expect(r.genders).toEqual(['NEUTRAL', 'FEMALE_ONLY'])
    expect(r.domiciles).toEqual(['ANY', 'UP'])
  })

  it('other-state candidates are considered only for OPEN, non-home-state seats', () => {
    const r = deriveEligibility({ ...baseRequest, category: 'SC', gender: 'FEMALE', domicile: 'OTHER', subCategories: ['AF', 'TFW'] })
    expect(r.categories).toEqual(['OPEN'])
    expect(r.seatTypes).toEqual(['GENERAL'])
    expect(r.domiciles).toEqual(['ANY'])
    expect(r.quotas).not.toContain('HOME_STATE')
    expect(r.genders).toContain('FEMALE_ONLY')
  })

  it('TFW eligibility adds tuition fee waiver seats for UP candidates', () => {
    const r = deriveEligibility({ ...baseRequest, subCategories: ['TFW'] })
    expect(r.seatTypes).toContain('TFW')
    expect(r.categories).toContain('ANY')
  })

  it('maps college preference to institute types', () => {
    expect(deriveEligibility(baseRequest, 'government').instituteTypes).toEqual(['government', 'aided'])
    expect(deriveEligibility(baseRequest, 'private').instituteTypes).toEqual(['private'])
  })
})

describe('runPrediction', () => {
  it('classifies each year and round separately and summarises the latest year', () => {
    const records = [
      rec({ academic_year: 2025, round_number: 1, closing_rank: 15000 }),
      rec({ academic_year: 2025, round_number: 2, closing_rank: 19000 }),
      rec({ academic_year: 2024, round_number: 1, closing_rank: 30000 }),
    ]
    const result = runPrediction(baseRequest, [2025, 2024, 2023], data(records))
    expect(result.programs).toHaveLength(1)
    const group = result.programs[0].seat_groups[0]
    expect(group.years.map((y) => y.year)).toEqual([2025, 2024, 2023])
    expect(group.years[0].rounds.map((r) => r.classification)).toEqual(['BEYOND_CUTOFF', 'WITHIN_CLOSING'])
    expect(group.years[0].classification).toBe('WITHIN_CLOSING') // final round of 2025
    expect(group.years[1].classification).toBe('WITHIN_RANGE')
    expect(group.years[2].classification).toBe('INSUFFICIENT_DATA')
    expect(group.classification).toBe('WITHIN_CLOSING')
    expect(group.years_with_data).toBe(2)
    expect(group.years_within_closing).toBe(2)
    expect(group.closing_trend).toEqual([
      { year: 2023, closing_rank: null },
      { year: 2024, closing_rank: 30000 },
      { year: 2025, closing_rank: 19000 },
    ])
    expect(result.years_without_data).toEqual([2023])
  })

  it('uses the last regular round (not a special round) for the year headline', () => {
    const records = [
      rec({ round_number: 3, round_label: 'R3: Third Round', closing_rank: 15000 }),
      rec({ round_number: 6, round_label: 'R6: Special Round', closing_rank: 90000 }),
    ]
    const year = runPrediction(baseRequest, [2025], data(records)).programs[0].seat_groups[0].years[0]
    expect(year.rounds).toHaveLength(2) // both rounds are still shown
    expect(year.final_round?.round_number).toBe(3)
    expect(year.classification).toBe('BEYOND_CUTOFF')
  })

  it('never merges different seat groups and never mixes rank types', () => {
    const records = [
      rec({ category: 'OPEN', closing_rank: 17000 }),
      rec({ category: 'BC', category_code: 'BCNO', domicile: 'UP', closing_rank: 40000 }),
      rec({ category: 'OPEN', quota: 'ALL_INDIA', closing_rank: 25000 }),
      rec({ category: 'OPEN', rank_type: 'CATEGORY', opening_rank: 100, closing_rank: 850 }),
    ]
    const result = runPrediction({ ...baseRequest, category: 'BC' }, [2025], data(records))
    const groups = result.programs[0].seat_groups
    expect(groups).toHaveLength(3) // CATEGORY-rank record ignored: no category rank given
    expect(groups.every((g) => g.rank_type === 'CRL')).toBe(true)
    expect(groups.map((g) => `${g.category}/${g.quota}`).sort()).toEqual(['BC/STATE', 'OPEN/ALL_INDIA', 'OPEN/STATE'])

    const withCategoryRank = runPrediction({ ...baseRequest, category: 'BC', categoryRank: 800 }, [2025], data(records))
    const cat = withCategoryRank.programs[0].seat_groups.find((g) => g.rank_type === 'CATEGORY')
    expect(cat?.compared_rank).toBe(800)
    expect(cat?.classification).toBe('WITHIN_CLOSING')
  })

  it('drops records the student is not eligible for even if the data layer returns them', () => {
    const records = [
      rec({ category: 'SC', category_code: 'SCNO', domicile: 'UP', closing_rank: 90000 }),
      rec({ gender: 'FEMALE_ONLY', closing_rank: 90000 }),
      rec({ seat_type: 'GIRL', category_code: 'OPGL', domicile: 'UP', closing_rank: 90000 }),
    ]
    const result = runPrediction(baseRequest, [2025], data(records))
    expect(result.programs).toHaveLength(0)
  })

  it('applies branch and institute-type preferences', () => {
    const records = [rec({}), rec({ college_code: 'P1', branch_code: 'ME' })]
    expect(runPrediction({ ...baseRequest, branchCodes: ['ME'] }, [2025], data(records)).programs.map((p) => p.key)).toEqual(['P1|ME|'])
    expect(runPrediction({ ...baseRequest, institutePreference: 'government' }, [2025], data(records)).programs.map((p) => p.key)).toEqual(['G1|CSE|'])
  })

  it('sorts by most favourable band, then by the most competitive closing rank', () => {
    const records = [
      rec({ college_code: 'P1', branch_code: 'ME', closing_rank: 90000 }),
      rec({ college_code: 'G1', branch_code: 'ME', closing_rank: 19000 }),
      rec({ college_code: 'G1', branch_code: 'CSE', closing_rank: 60000 }),
    ]
    const result = runPrediction(baseRequest, [2025], data(records))
    expect(result.programs.map((p) => [p.key, p.best_classification])).toEqual([
      ['G1|CSE|', 'WITHIN_RANGE'],
      ['P1|ME|', 'WITHIN_RANGE'],
      ['G1|ME|', 'WITHIN_CLOSING'],
    ])
    expect(result.summary.by_classification.WITHIN_RANGE).toBe(2)
  })

  it('identifies preferred branches without any verified data', () => {
    const result = runPrediction({ ...baseRequest, branchCodes: ['CSE', 'BT'] }, [2025], data([rec({})], { branches_with_records: ['CSE'] } as Partial<CandidateData>))
    expect(result.branches_without_data).toEqual(['BT'])
  })

  it('returns an explicit empty result when there is no data', () => {
    const result = runPrediction(baseRequest, [2025], data([]))
    expect(result.programs).toEqual([])
    expect(result.years_without_data).toEqual([2025])
    expect(result.disclaimer).toMatch(/do not guarantee admission/)
  })
})

describe('selectYears', () => {
  it('defaults to the three latest years up to the admission year', () => {
    expect(selectYears(2026, [2022, 2023, 2024, 2025, 2026, 2027])).toEqual([2026, 2025, 2024])
  })
  it('honours explicitly requested years', () => {
    expect(selectYears(2026, [2025], [2023, 2024, 2024, 2030])).toEqual([2024, 2023])
  })
})

describe('validatePredictionRequest', () => {
  it('accepts and normalises a valid request', () => {
    const r = validatePredictionRequest({
      crlRank: '45,210',
      admissionYear: 2026,
      category: 'BC',
      gender: 'FEMALE',
      domicile: 'UP',
      subCategories: ['PH', 'PH'],
      branchCodes: ['CSE'],
      institutePreference: 'government',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.crlRank).toBe(45210)
      expect(r.value.subCategories).toEqual(['PH'])
    }
  })

  it('rejects invalid input with field-level messages', () => {
    const r = validatePredictionRequest({ crlRank: -5, category: 'XYZ', gender: 'X', domicile: 'UP', admissionYear: 1900, branchCodes: ['DROP TABLE'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['admissionYear', 'branchCodes', 'category', 'crlRank', 'gender'])
  })
})
