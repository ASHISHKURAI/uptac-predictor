import { isTotalColumn, parseCategoryCode, type ParsedCategory } from './parsers.ts'
import { cleanCell, normalizeKey } from './text.ts'

export type Field =
  | 'sr_no'
  | 'year'
  | 'round'
  | 'institute'
  | 'institute_code'
  | 'institute_type'
  | 'programme'
  | 'branch'
  | 'category'
  | 'quota'
  | 'seat_gender'
  | 'exam'
  | 'opening_rank'
  | 'closing_rank'
  | 'min_score'
  | 'max_score'
  | 'remark'
  | 'net_seats'
  | 'source_page'
  | 'source_url'

const ALIASES: Record<Field, string[]> = {
  sr_no: ['sr no', 'sr.no', 's no', 'sno', 'serial no', 'sl no', '#', 's.no.'],
  year: ['year', 'academic year', 'admission year', 'session'],
  round: ['round', 'counselling round', 'round no', 'round name'],
  institute: ['institute', 'institute name', 'college', 'college name', 'institution', 'name of institute', 'institute/college'],
  institute_code: ['institute code', 'college code', 'inst code', 'institute id'],
  institute_type: ['institute type', 'college type', 'type of institute', 'institution type'],
  programme: ['programme', 'program', 'course', 'programme name', 'program name'],
  branch: ['branch', 'branch name', 'academic program name', 'discipline'],
  category: ['category', 'seat category', 'allotted category', 'category code'],
  quota: ['quota', 'seat quota'],
  seat_gender: ['seat gender', 'gender', 'seat pool'],
  exam: ['exam name', 'exam', 'entrance exam', 'qualifying exam'],
  opening_rank: ['opening rank', 'opening', 'or', 'open rank'],
  closing_rank: ['closing rank', 'closing', 'cr', 'close rank'],
  min_score: ['min score', 'minimum score'],
  max_score: ['max score', 'maximum score'],
  remark: ['remark', 'remarks'],
  net_seats: ['net seats', 'total seats', 'total intake', 'intake'],
  source_page: ['source page', 'page', 'page no'],
  source_url: ['source url', 'url', 'source link'],
}

const ALIAS_INDEX = new Map<string, Field>()
for (const [field, list] of Object.entries(ALIASES) as Array<[Field, string[]]>) {
  for (const alias of list) ALIAS_INDEX.set(normalizeKey(alias), field)
  ALIAS_INDEX.set(normalizeKey(field), field)
}

export type ColumnRole = { kind: 'field'; field: Field } | { kind: 'category'; parsed: ParsedCategory } | { kind: 'total' } | null

export interface HeaderInfo {
  index: number
  labels: string[]
  columns: ColumnRole[]
  fields: Partial<Record<Field, number>>
  categoryColumns: number
}

export function classifyHeaderCell(raw: string): ColumnRole {
  const label = cleanCell(raw)
  if (!label) return null
  const field = ALIAS_INDEX.get(normalizeKey(label))
  if (field) return { kind: 'field', field }
  if (isTotalColumn(label)) return { kind: 'total' }
  const parsed = parseCategoryCode(label)
  if (parsed && /^[A-Z]{2,5}$/.test(label.replace(/[\s\-_]/g, '').toUpperCase())) return { kind: 'category', parsed }
  return null
}

function analyse(row: unknown[], index: number): HeaderInfo {
  const labels = row.map(cleanCell)
  const columns = labels.map(classifyHeaderCell)
  const fields: Partial<Record<Field, number>> = {}
  let categoryColumns = 0
  columns.forEach((c, i) => {
    if (c?.kind === 'field' && fields[c.field] === undefined) fields[c.field] = i
    if (c?.kind === 'category') categoryColumns++
  })
  return { index, labels, columns, fields, categoryColumns }
}

function score(h: HeaderInfo): number {
  return Object.keys(h.fields).length + (h.categoryColumns >= 5 ? h.categoryColumns : 0)
}

/** Finds the header row within the first rows of a table. */
export function detectHeader(rows: unknown[][], maxScan = 15): HeaderInfo | null {
  let best: HeaderInfo | null = null
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const h = analyse(rows[i] ?? [], i)
    const hasInstitute = h.fields.institute !== undefined
    const usable = hasInstitute && (h.fields.opening_rank !== undefined || h.categoryColumns >= 5)
    if (usable && (!best || score(h) > score(best))) best = h
  }
  return best
}

/** True when a row repeats the header (common on every page of a PDF). */
export function isRepeatedHeader(row: unknown[], header: HeaderInfo): boolean {
  const h = analyse(row, -1)
  return score(h) >= Math.max(3, score(header) - 1)
}

export function inferDocumentType(h: HeaderInfo): 'opening_closing_rank' | 'seat_matrix' | null {
  if (h.fields.opening_rank !== undefined && h.fields.closing_rank !== undefined) return 'opening_closing_rank'
  if (h.categoryColumns >= 5) return 'seat_matrix'
  return null
}
