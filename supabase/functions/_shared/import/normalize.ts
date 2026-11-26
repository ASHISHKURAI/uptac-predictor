import type {
  DomicileRequirement,
  InstituteType,
  Quota,
  RankType,
  ReservationCategory,
  SeatGender,
  SeatType,
} from '../prediction/types.ts'
import { inferDistrict } from './districts.ts'
import { detectHeader, inferDocumentType, isRepeatedHeader, type Field, type HeaderInfo } from './headers.ts'
import {
  defaultDomicile,
  isBtechParentProgramme,
  isNonBtechProgramme,
  isUnsetGender,
  normalizeExam,
  parseCategoryCode,
  parseInstitute,
  parseInstituteType,
  parseProgram,
  parseQuota,
  parseRank,
  parseRound,
  parseSeatGender,
} from './parsers.ts'
import { bestMatch, cleanCell, normalizeKey } from './text.ts'

export type DocumentType = 'opening_closing_rank' | 'seat_matrix'

export interface RawTable {
  /** 1-based page number in the source PDF (null for spreadsheets). */
  page?: number | null
  /** Sheet / table name for source references. */
  name?: string | null
  rows: unknown[][]
}

export interface ReferenceCollege {
  code: string
  name: string
  aliases?: string[] | null
}

export interface ReferenceBranch {
  code: string
  name: string
  aliases?: string[] | null
}

export interface NormalizeContext {
  documentType: DocumentType
  academicYear: number
  defaultRound?: number | null
  rankType: RankType
  defaultQuota: Quota
  colleges: ReferenceCollege[]
  branches: ReferenceBranch[]
}

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  code: string
  severity: Severity
  message: string
  field?: string
  suggestion?: { code: string; name: string; score: number }
}

export interface StagingRecord {
  record_type: 'cutoff' | 'seat_matrix'
  row_index: number
  source_page: number | null
  source_reference: string | null
  raw: Record<string, string>
  academic_year: number | null
  round_number: number | null
  round_label: string | null
  college_code: string | null
  college_name_raw: string | null
  branch_code: string | null
  branch_name_raw: string | null
  branch_base_raw: string | null
  shift: string
  category: ReservationCategory | null
  seat_type: SeatType | null
  category_code: string | null
  gender: SeatGender | null
  domicile: DomicileRequirement | null
  quota: Quota | null
  rank_type: RankType | null
  exam: string | null
  opening_rank: number | null
  closing_rank: number | null
  seats: number | null
  issues: Issue[]
  has_errors: boolean
}

export interface ProposedCollege {
  code: string
  name: string
  institute_type: InstituteType | null
  city: string | null
  district: string | null
  rows: number
}

export interface UnresolvedName {
  raw: string
  rows: number
  suggestion: { code: string; name: string; score: number } | null
}

export interface NormalizeStats {
  tables: number
  data_rows: number
  staged_records: number
  skipped_non_btech: number
  skipped_non_jee: number
  no_allotment: number
  zero_seat_cells: number
  records_with_errors: number
  records_with_warnings: number
}

export interface NormalizeResult {
  documentType: DocumentType
  detectedDocumentType: DocumentType | null
  header: string[]
  records: StagingRecord[]
  stats: NormalizeStats
  newColleges: ProposedCollege[]
  unresolvedColleges: UnresolvedName[]
  unresolvedBranches: UnresolvedName[]
  warnings: string[]
}

const MAX_PLAUSIBLE_RANK = 2_000_000

/**
 * Turns extracted tables (from CSV/XLSX sheets or PDF pages) into staging
 * records. Nothing here publishes data – every record is reviewed by an admin.
 */
export function normalizeTables(tables: RawTable[], ctx: NormalizeContext): NormalizeResult {
  const collegeByCode = new Map(ctx.colleges.map((c) => [c.code, c]))
  const collegeByKey = new Map<string, string>()
  for (const c of ctx.colleges) {
    collegeByKey.set(normalizeKey(c.name), c.code)
    for (const a of c.aliases ?? []) collegeByKey.set(normalizeKey(a), c.code)
  }
  const branchByKey = new Map<string, string>()
  for (const b of ctx.branches) {
    branchByKey.set(normalizeKey(b.name), b.code)
    for (const a of b.aliases ?? []) branchByKey.set(normalizeKey(a), b.code)
  }

  const stats: NormalizeStats = {
    tables: tables.length,
    data_rows: 0,
    staged_records: 0,
    skipped_non_btech: 0,
    skipped_non_jee: 0,
    no_allotment: 0,
    zero_seat_cells: 0,
    records_with_errors: 0,
    records_with_warnings: 0,
  }
  const records: StagingRecord[] = []
  const newColleges = new Map<string, ProposedCollege>()
  const unresolvedColleges = new Map<string, UnresolvedName>()
  const unresolvedBranches = new Map<string, UnresolvedName>()
  const warnings: string[] = []

  let header: HeaderInfo | null = null
  let detectedType: DocumentType | null = null
  let rowCounter = 0

  for (const table of tables) {
    const found = detectHeader(table.rows)
    let start = 0
    if (found) {
      header = found
      start = found.index + 1
      detectedType = detectedType ?? inferDocumentType(found)
    } else if (!header) {
      continue
    }
    const h = header
    for (let i = start; i < table.rows.length; i++) {
      const row = table.rows[i] ?? []
      const cells = row.map(cleanCell)
      if (cells.every((c) => c === '')) continue
      if (isRepeatedHeader(row, h)) continue
      stats.data_rows++
      rowCounter++
      const get = (f: Field) => (h.fields[f] !== undefined ? (cells[h.fields[f] as number] ?? '') : '')
      const raw: Record<string, string> = {}
      h.labels.forEach((label, idx) => {
        if (label) raw[label] = cells[idx] ?? ''
      })
      const pageCell = Number(get('source_page'))
      const sourcePage = Number.isInteger(pageCell) && pageCell > 0 ? pageCell : (table.page ?? null)
      const sourceReference = get('source_url') || (table.name ? `${table.name} · row ${i + 1}` : `row ${rowCounter}`)

      // --- B.Tech filter (B.Pharm, MBA, lateral entry … are skipped) -----------
      const hasBranchColumn = h.fields.branch !== undefined
      const branchRaw = hasBranchColumn ? get('branch') : get('programme')
      const parentProgramme = hasBranchColumn ? get('programme') : ''
      if ((parentProgramme && !isBtechParentProgramme(parentProgramme)) || isNonBtechProgramme(branchRaw)) {
        stats.skipped_non_btech++
        continue
      }

      // --- institute -------------------------------------------------------
      const inst = parseInstitute(get('institute'))
      const explicitCode = get('institute_code') || inst.code
      let collegeCode: string | null = null
      const collegeIssues: Issue[] = []
      if (explicitCode && collegeByCode.has(explicitCode)) {
        collegeCode = explicitCode
      } else if (!explicitCode && collegeByKey.has(normalizeKey(inst.name))) {
        collegeCode = collegeByKey.get(normalizeKey(inst.name)) ?? null
      } else if (explicitCode) {
        // Official code present but institute not yet in the directory.
        collegeCode = explicitCode
        if (!newColleges.has(explicitCode))
          newColleges.set(explicitCode, {
            code: explicitCode,
            name: inst.name,
            institute_type: parseInstituteType(get('institute_type')),
            city: inst.city,
            district: inferDistrict(inst.city),
            rows: 0,
          })
        collegeIssues.push({
          code: 'unknown_college',
          severity: 'error',
          field: 'college_code',
          message: `Institute ${explicitCode} (${inst.name}) is not in the college directory yet.`,
        })
      } else {
        if (!unresolvedColleges.has(inst.name)) {
          unresolvedColleges.set(inst.name, { raw: inst.name, rows: 0, suggestion: inst.name ? bestMatch(inst.name, ctx.colleges) : null })
        }
        const suggestion = unresolvedColleges.get(inst.name)?.suggestion ?? null
        collegeIssues.push({
          code: 'unknown_college',
          severity: 'error',
          field: 'college_code',
          message: inst.name ? `Institute "${inst.name}" could not be matched to a college.` : 'Institute name is missing.',
          ...(suggestion ? { suggestion } : {}),
        })
      }

      // --- programme / branch -------------------------------------------------
      const program = parseProgram(branchRaw)
      const branchCode = branchByKey.get(normalizeKey(program.base)) ?? null
      const branchIssues: Issue[] = []
      if (!branchCode) {
        if (!unresolvedBranches.has(program.base)) {
          unresolvedBranches.set(program.base, { raw: program.base, rows: 0, suggestion: program.base ? bestMatch(program.base, ctx.branches) : null })
        }
        const suggestion = unresolvedBranches.get(program.base)?.suggestion ?? null
        branchIssues.push({
          code: 'unknown_branch',
          severity: 'error',
          field: 'branch_code',
          message: program.base ? `Programme "${program.base}" is not mapped to a branch.` : 'Programme name is missing.',
          ...(suggestion ? { suggestion } : {}),
        })
      }

      const genderParsed = parseSeatGender(get('seat_gender'))
      const quotaParsed = parseQuota(get('quota'), ctx.defaultQuota)
      const base = {
        source_page: sourcePage,
        source_reference: sourceReference,
        raw,
        academic_year: parseYear(get('year')) ?? ctx.academicYear,
        college_code: collegeCode,
        college_name_raw: inst.name || null,
        branch_code: branchCode,
        branch_name_raw: branchRaw || null,
        branch_base_raw: program.base || null,
        shift: program.shift,
        gender: genderParsed,
        quota: quotaParsed.quota,
      }
      const commonIssues: Issue[] = [...collegeIssues, ...branchIssues]
      if (!genderParsed) commonIssues.push({ code: 'invalid_gender', severity: 'error', field: 'gender', message: `Unrecognised seat gender "${get('seat_gender')}".` })
      if (isUnsetGender(get('seat_gender'))) {
        commonIssues.push({
          code: 'gender_not_set',
          severity: 'warning',
          field: 'gender',
          message: 'The official document shows seat gender "(not set)"; stored as gender-neutral – verify before approving.',
        })
      }
      if (!quotaParsed.recognised) commonIssues.push({ code: 'unknown_quota', severity: 'warning', field: 'quota', message: `Unrecognised quota "${get('quota')}" – stored as OTHER.` })

      if (ctx.documentType === 'opening_closing_rank') {
        const exam = normalizeExam(get('exam'))
        if (exam !== 'JEE-MAIN') {
          stats.skipped_non_jee++
          continue
        }
        const opening = parseRank(get('opening_rank'))
        const closing = parseRank(get('closing_rank'))
        if (opening.empty && closing.empty) {
          stats.no_allotment++
          continue
        }
        const issues = [...commonIssues]
        const catRaw = get('category')
        const cat = parseCategoryCode(catRaw)
        if (!cat) issues.push({ code: 'invalid_category', severity: 'error', field: 'category', message: `Unrecognised category "${catRaw}".` })
        const round = parseRound(get('round'))
        const roundNumber = round.number ?? ctx.defaultRound ?? null
        if (!roundNumber) issues.push({ code: 'missing_round', severity: 'error', field: 'round_number', message: 'Counselling round could not be determined.' })
        if (opening.empty || closing.empty) issues.push({ code: 'missing_rank', severity: 'error', field: opening.empty ? 'opening_rank' : 'closing_rank', message: 'Opening or closing rank is missing.' })
        if (opening.invalid || closing.invalid) issues.push({ code: 'invalid_rank', severity: 'error', field: opening.invalid ? 'opening_rank' : 'closing_rank', message: 'Rank is not a positive whole number.' })
        if (opening.fractional || closing.fractional) {
          issues.push({ code: 'fractional_rank', severity: 'warning', message: `The official rank has a decimal part (${get('opening_rank')} / ${get('closing_rank')}); the whole-number part is used – verify.` })
        }
        if (opening.preparatory || closing.preparatory) issues.push({ code: 'preparatory_rank', severity: 'warning', message: 'Rank marked as preparatory (P) – verify against the document.' })
        if (opening.value && closing.value && opening.value > closing.value) issues.push({ code: 'rank_order', severity: 'error', message: 'Opening rank is greater than closing rank.' })
        if ((closing.value ?? 0) > MAX_PLAUSIBLE_RANK) issues.push({ code: 'implausible_rank', severity: 'error', field: 'closing_rank', message: 'Closing rank is outside the plausible JEE Main range.' })
        if (program.feeWaiver && cat && cat.seatType !== 'TFW') issues.push({ code: 'fee_waiver_mismatch', severity: 'warning', message: 'Programme is marked (FW) but the category is not TFW.' })

        records.push(
          finalize({
            ...base,
            record_type: 'cutoff',
            row_index: rowCounter,
            round_number: roundNumber,
            round_label: round.label,
            category: cat?.category ?? null,
            seat_type: cat?.seatType ?? null,
            category_code: cat?.code ?? (catRaw || null),
            domicile: cat ? defaultDomicile(cat.category, cat.seatType, quotaParsed.quota) : null,
            rank_type: ctx.rankType,
            exam,
            opening_rank: opening.value,
            closing_rank: closing.value,
            seats: null,
            issues,
            has_errors: false,
          }),
        )
      } else {
        // Seat matrix: one record per category column with seats > 0 (wide → long).
        const netIdx = h.columns.findIndex((c) => c?.kind === 'total')
        const net = netIdx >= 0 ? parseRank(cells[netIdx] ?? '') : null
        let sum = 0
        const rowRecords: StagingRecord[] = []
        h.columns.forEach((col, idx) => {
          if (col?.kind !== 'category') return
          const cell = cells[idx] ?? ''
          if (cell === '' || cell === '-') return
          const seats = Number(cell.replace(/,/g, ''))
          const issues = [...commonIssues]
          if (!Number.isInteger(seats) || seats < 0) {
            issues.push({ code: 'invalid_seats', severity: 'error', field: 'seats', message: `Invalid seat count "${cell}" in column ${h.labels[idx]}.` })
          } else if (seats === 0) {
            stats.zero_seat_cells++
            return
          }
          if (col.parsed.seatType !== 'TFW' && Number.isInteger(seats)) sum += seats
          rowRecords.push(
            finalize({
              ...base,
              record_type: 'seat_matrix',
              row_index: rowCounter * 100 + idx,
              round_number: null,
              round_label: null,
              category: col.parsed.category,
              seat_type: col.parsed.seatType,
              category_code: col.parsed.code,
              domicile: defaultDomicile(col.parsed.category, col.parsed.seatType, quotaParsed.quota),
              rank_type: null,
              exam: null,
              opening_rank: null,
              closing_rank: null,
              seats: Number.isInteger(seats) ? seats : null,
              issues,
              has_errors: false,
            }),
          )
        })
        if (net?.value != null && sum !== net.value && sum > 0) {
          for (const r of rowRecords) {
            r.issues.push({ code: 'seat_total_mismatch', severity: 'warning', message: `Category seats add up to ${sum} but NET SEATS is ${net.value}.` })
          }
        }
        records.push(...rowRecords)
      }
    }
  }

  // Row counts reflect STAGED records only (rows skipped as "no allotment" etc. are not counted).
  for (const r of records) {
    if (!r.issues.some((i) => i.code === 'unknown_college')) continue
    if (r.college_code && newColleges.has(r.college_code)) newColleges.get(r.college_code)!.rows++
    else if (r.college_name_raw && unresolvedColleges.has(r.college_name_raw)) unresolvedColleges.get(r.college_name_raw)!.rows++
  }
  for (const r of records) {
    if (r.issues.some((i) => i.code === 'unknown_branch') && r.branch_base_raw && unresolvedBranches.has(r.branch_base_raw)) unresolvedBranches.get(r.branch_base_raw)!.rows++
  }

  for (const r of records) {
    r.has_errors = r.issues.some((i) => i.severity === 'error')
    if (r.has_errors) stats.records_with_errors++
    else if (r.issues.some((i) => i.severity === 'warning')) stats.records_with_warnings++
  }
  stats.staged_records = records.length

  if (!header) warnings.push('No header row with an institute column and rank / seat columns was found.')
  if (detectedType && detectedType !== ctx.documentType) {
    warnings.push(`The file looks like a ${label(detectedType)} but the import was started as a ${label(ctx.documentType)}.`)
  }

  return {
    documentType: ctx.documentType,
    detectedDocumentType: detectedType,
    header: header?.labels ?? [],
    records,
    stats,
    newColleges: [...newColleges.values()].filter((c) => c.rows > 0).sort((a, b) => a.code.localeCompare(b.code)),
    unresolvedColleges: [...unresolvedColleges.values()].filter((c) => c.rows > 0).sort((a, b) => b.rows - a.rows).slice(0, 500),
    unresolvedBranches: [...unresolvedBranches.values()].filter((b) => b.rows > 0).sort((a, b) => b.rows - a.rows).slice(0, 500),
    warnings,
  }
}

function finalize(r: StagingRecord): StagingRecord {
  return r
}

function parseYear(value: string): number | null {
  const m = cleanCell(value).match(/\b(20\d{2})\b/)
  return m ? Number(m[1]) : null
}

function label(t: DocumentType): string {
  return t === 'seat_matrix' ? 'seat matrix' : 'opening & closing rank document'
}
