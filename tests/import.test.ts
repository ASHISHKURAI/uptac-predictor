import { describe, expect, it } from 'vitest'
import {
  detectMetadata,
  inferDistrict,
  normalizeKey,
  normalizeTables,
  parseCategoryCode,
  parseInstitute,
  parseProgram,
  parseRank,
  parseRound,
  type NormalizeContext,
} from '@shared/import/index.ts'

// Column layouts below are copied from the official UPTAC portal (uptac.samarth.edu.in):
// OR-CR "Opening & Closing Rank" table and the "Seat Matrix" table.
const ORCR_HEADER = ['Sr.No', 'Round', 'Institute', 'Programme', 'Branch', 'Category', 'Seat Gender', 'Exam Name', 'Opening Rank', 'Closing Rank', 'Min Score', 'Max Score', 'Remark']
const BTECH = 'B.Tech (All Branches)/M.Tech (Integrated)'
const FGIET = 'FEROZE GANDHI INSTITUTE OF ENGG AND TECHNOLOGY, RAIBAREILLY'

const ctx = (over: Partial<NormalizeContext> = {}): NormalizeContext => ({
  documentType: 'opening_closing_rank',
  academicYear: 2026,
  defaultRound: null,
  rankType: 'CRL',
  defaultQuota: 'STATE',
  colleges: [{ code: '187', name: FGIET, aliases: [] }],
  branches: [
    { code: 'AE', name: 'Aeronautical Engineering', aliases: [] },
    { code: 'AIML', name: 'Artificial Intelligence and Machine Learning', aliases: [] },
    { code: 'AIDS', name: 'Artificial Intelligence and Data Science', aliases: ['Artificial Intelligence (AI) And Data Science'] },
    { code: 'ELCE', name: 'Electrical and Computer Engineering', aliases: [] },
  ],
  ...over,
})

describe('parsers', () => {
  it.each([
    ['OPNO', 'OPEN', 'GENERAL', 'OPNO'],
    ['BCGL', 'BC', 'GIRL', 'BCGL'],
    ['EWSPH', 'EWS', 'PH', 'EWSPH'],
    ['SCAF', 'SC', 'AF', 'SCAF'],
    ['STFF', 'ST', 'FF', 'STFF'],
    ['TFW', 'ANY', 'TFW', 'TFW'],
    ['OPEN', 'OPEN', 'GENERAL', 'OPNO'],
    ['OPEN(GIRL)', 'OPEN', 'GIRL', 'OPGL'],
    ['BC (AF)', 'BC', 'AF', 'BCAF'],
    ['OBC-NCL', 'BC', 'GENERAL', 'BCNO'],
    ['GEN-EWS', 'EWS', 'GENERAL', 'EWSNO'],
    ['OPEN-PwD', 'OPEN', 'PH', 'OPPH'],
  ])('category %s', (raw, category, seatType, code) => {
    expect(parseCategoryCode(raw)).toEqual({ category, seatType, code })
  })

  it('rejects unknown category labels and totals', () => {
    expect(parseCategoryCode('NET SEATS')).toBeNull()
    expect(parseCategoryCode('XYZ')).toBeNull()
  })

  it('parses institutes with official codes and places', () => {
    expect(parseInstitute('(043) BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI')).toEqual({
      code: '043',
      name: 'BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI',
      city: 'JHANSI',
    })
    expect(parseInstitute('(863  ) SETH VISHAMBHAR NATH INSTITUTE OF PHARMACY,BARABANKI').code).toBe('863')
    expect(parseInstitute(FGIET)).toEqual({ code: null, name: FGIET, city: 'RAIBAREILLY' })
  })

  it('parses programme shifts and fee-waiver suffixes', () => {
    expect(parseProgram('Artificial Intelligence And Machine Learning (Shift I)(FW)')).toEqual({
      base: 'Artificial Intelligence And Machine Learning',
      shift: 'I',
      feeWaiver: true,
    })
    expect(parseProgram('Civil Engineering(Integrated M.Tech )').base).toBe('Civil Engineering(Integrated M.Tech)')
    expect(parseProgram('Computer Science and Engineering (4 Years, Bachelor of Technology)').base).toBe('Computer Science and Engineering')
  })

  it('parses ranks and rounds', () => {
    expect(parseRank('285084')).toMatchObject({ value: 285084, empty: false })
    expect(parseRank('1,23,456')).toMatchObject({ value: 123456 })
    expect(parseRank('-')).toMatchObject({ value: null, empty: true })
    expect(parseRank('123P')).toMatchObject({ value: 123, preparatory: true })
    expect(parseRank('abc')).toMatchObject({ invalid: true })
    // Seen in the official 2026 OR-CR export, e.g. "459535.01"
    expect(parseRank('459535.01')).toMatchObject({ value: 459535, fractional: true, invalid: false })
    expect(parseRank('12345.0')).toMatchObject({ value: 12345, fractional: false })
    expect(parseRound('R1: First Round').number).toBe(1)
    expect(parseRound('R5: Internal Sliding').number).toBe(5)
    expect(parseRound('Round 3').number).toBe(3)
    expect(parseRound('Second Round').number).toBe(2)
  })

  it('normalises names the same way as the SQL norm_key()', () => {
    expect(normalizeKey('Electrical & Computer Engg.')).toBe(normalizeKey('Electrical and Computer Engineering'))
  })

  it('infers UP districts conservatively', () => {
    expect(inferDistrict('RAIBAREILLY')).toBe('Rae Bareli')
    expect(inferDistrict('GREATER NOIDA')).toBe('Gautam Buddha Nagar')
    expect(inferDistrict('JHANSI')).toBe('Jhansi')
    expect(inferDistrict('Somewhere')).toBeNull()
  })

  it('detects metadata from file names', () => {
    expect(detectMetadata('UPTAC_2025_Round_3_Opening_Closing_Rank.pdf')).toEqual({ academicYear: 2025, roundNumber: 3, documentType: 'opening_closing_rank' })
    expect(detectMetadata('seat-matrix-2026.xlsx').documentType).toBe('seat_matrix')
  })
})

describe('normalizeTables – official OR-CR layout', () => {
  const rows = [
    ORCR_HEADER,
    ['1', 'R1: First Round', FGIET, BTECH, 'Aeronautical Engineering (Shift I)', 'BCGL', 'Co-Education', 'JEE-MAIN', '285084', '285084', '-', '-', ''],
    ['2', 'R1: First Round', FGIET, BTECH, 'Aeronautical Engineering (Shift I)', 'BCNO', 'Co-Education', 'JEE-MAIN', '255446', '544045', '-', '-', ''],
    ['3', 'R1: First Round', FGIET, BTECH, 'Aeronautical Engineering (Shift I)', 'BCPH', 'Co-Education', 'JEE-MAIN', '-', '-', '-', '-', ''],
    ['7', 'R1: First Round', FGIET, BTECH, 'Aeronautical Engineering (Shift I)', 'OPGL', 'Co-Education', 'JEE-MAIN', '164896', '195918', '-', '-', ''],
    ['8', 'R1: First Round', FGIET, 'B.Tech Lateral', 'Aeronautical Engineering', 'OPNO', 'Co-Education', 'UPCET', '10', '20', '-', '-', ''],
    ['9', 'R1: First Round', 'UNKNOWN INSTITUTE OF TECHNOLOGY, NOWHERE', BTECH, 'Underwater Basket Engineering (Shift I)', 'OPNO', 'Co-Education', 'JEE-MAIN', '5000', '4000', '-', '-', ''],
  ]

  it('stages valid rows, skips no-allotment and non-B.Tech rows', () => {
    const r = normalizeTables([{ page: 1, rows }], ctx())
    expect(r.detectedDocumentType).toBe('opening_closing_rank')
    expect(r.stats.no_allotment).toBe(1)
    expect(r.stats.skipped_non_btech).toBe(1)
    expect(r.records).toHaveLength(4)
    const [first] = r.records
    expect(first).toMatchObject({
      record_type: 'cutoff',
      academic_year: 2026,
      round_number: 1,
      round_label: 'R1: First Round',
      college_code: '187',
      branch_code: 'AE',
      shift: 'I',
      category: 'BC',
      seat_type: 'GIRL',
      category_code: 'BCGL',
      gender: 'NEUTRAL',
      domicile: 'UP',
      quota: 'STATE',
      rank_type: 'CRL',
      exam: 'JEE-MAIN',
      opening_rank: 285084,
      closing_rank: 285084,
      source_page: 1,
      has_errors: false,
    })
    const open = r.records.find((x) => x.category_code === 'OPGL')
    expect(open?.domicile).toBe('UP') // girl seats are UP-domicile only
  })

  it('flags unknown institutes, branches and rank order errors for admin review', () => {
    const r = normalizeTables([{ page: 1, rows }], ctx())
    const bad = r.records.find((x) => x.college_name_raw?.startsWith('UNKNOWN'))
    expect(bad?.has_errors).toBe(true)
    expect(bad?.issues.map((i) => i.code).sort()).toEqual(['rank_order', 'unknown_branch', 'unknown_college'])
    expect(r.unresolvedColleges).toHaveLength(1)
    expect(r.unresolvedBranches[0].raw).toBe('Underwater Basket Engineering')
    expect(r.stats.records_with_errors).toBe(1)
  })

  it('accepts the Special Round "(not set)" seat gender with a review warning', () => {
    const r = normalizeTables(
      [{ rows: [ORCR_HEADER, ['1', 'R6: Special Round', FGIET, BTECH, 'Aeronautical Engineering (Shift I)', 'OPNO', '(not set)', 'jee-main', '459535.01', '600000', '-', '-', '']] }],
      ctx(),
    )
    expect(r.records).toHaveLength(1)
    expect(r.records[0]).toMatchObject({ gender: 'NEUTRAL', exam: 'JEE-MAIN', round_number: 6, opening_rank: 459535, has_errors: false })
    expect(r.records[0].issues.map((i) => i.code).sort()).toEqual(['fractional_rank', 'gender_not_set'])
  })

  it('handles headers repeated on every PDF page and continuation pages', () => {
    const page1 = { page: 1, rows: [ORCR_HEADER, rows[1]] }
    const page2 = { page: 2, rows: [ORCR_HEADER, rows[2]] }
    const page3 = { page: 3, rows: [rows[4]] }
    const r = normalizeTables([page1, page2, page3], ctx())
    expect(r.records.map((x) => x.source_page)).toEqual([1, 2, 3])
  })
})

describe('normalizeTables – official seat matrix layout', () => {
  const header = ['#', 'Institute Type', 'Institute', 'Programme', 'Gender', 'OPNO', 'OPPH', 'OPAF', 'OPFF', 'BCNO', 'BCPH', 'BCAF', 'BCFF', 'SCNO', 'SCPH', 'SCAF', 'SCFF', 'STNO', 'STPH', 'STAF', 'STFF', 'EWSNO', 'OPGL', 'BCGL', 'SCGL', 'STGL', 'EWSAF', 'EWSFF', 'EWSGL', 'EWSPH', 'NET SEATS', 'TFW']
  const biet = '(043) BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI'
  const rows = [
    header,
    ['1', 'Government Institution', biet, 'Artificial Intelligence (AI) And Data Science (Shift I)', 'Co-Education', '20', '1', '2', '1', '14', '1', '1', '0', '10', '1', '1', '0', '1', '0', '1', '0', '5', '6', '4', '3', '0', '0', '1', '1', '1', '75', '0'],
    ['4', 'Government Institution', biet, 'Artificial Intelligence And Machine Learning (Shift I)(FW)', 'Co-Education', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '3'],
    ['5', 'Government Institution', '(051) FACULTY OF ARCHITECTURE, AKTU,LUCKNOW', 'Bachelor of Architecture(B.Arch)', 'Co-Education', '27', '2', '2', '1', '19', '1', '1', '1', '14', '1', '1', '1', '1', '0', '0', '0', '6', '8', '5', '4', '1', '1', '0', '2', '1', '100', '0'],
  ]

  it('converts the wide matrix into one record per non-zero category and proposes new institutes', () => {
    const r = normalizeTables([{ rows }], ctx({ documentType: 'seat_matrix' }))
    expect(r.detectedDocumentType).toBe('seat_matrix')
    expect(r.stats.skipped_non_btech).toBe(1)
    const aids = r.records.filter((x) => x.branch_code === 'AIDS')
    expect(aids.reduce((s, x) => s + (x.seats ?? 0), 0)).toBe(75)
    expect(aids.every((x) => x.college_code === '043' && x.shift === 'I')).toBe(true)
    expect(aids.some((x) => x.issues.some((i) => i.code === 'seat_total_mismatch'))).toBe(false)
    const tfw = r.records.find((x) => x.seat_type === 'TFW')
    expect(tfw).toMatchObject({ category: 'ANY', seats: 3, branch_code: 'AIML', domicile: 'UP' })
    // rows = staged records awaiting this institute (all AI&DS category records + the TFW record)
    expect(r.newColleges).toEqual([
      { code: '043', name: 'BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI', institute_type: 'government', city: 'JHANSI', district: 'Jhansi', rows: aids.length + 1 },
    ])
    // the B.Arch-only institute (051) is skipped entirely, so it is not proposed
    expect(r.newColleges.some((c) => c.code === '051')).toBe(false)
    expect(r.records.every((x) => x.issues.some((i) => i.code === 'unknown_college'))).toBe(true)
  })

  it('warns when the file type does not match the selected import type', () => {
    const r = normalizeTables([{ rows }], ctx({ documentType: 'opening_closing_rank' }))
    expect(r.warnings.join(' ')).toMatch(/looks like a seat matrix/)
  })
})
