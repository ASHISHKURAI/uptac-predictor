import type { InstituteType, Quota, ReservationCategory, SeatGender, SeatType } from '../prediction/types.ts'
import { cleanCell } from './text.ts'

export interface ParsedCategory {
  category: ReservationCategory
  seatType: SeatType
  /** Canonical official code, e.g. OPNO, BCGL, EWSPH, TFW. */
  code: string
}

const VERTICAL: Record<string, ReservationCategory> = {
  OP: 'OPEN', OPEN: 'OPEN', GEN: 'OPEN', GN: 'OPEN', GENERAL: 'OPEN', UR: 'OPEN',
  BC: 'BC', OBC: 'BC', OBCNCL: 'BC',
  SC: 'SC', ST: 'ST', EWS: 'EWS', GENEWS: 'EWS',
}
const HORIZONTAL: Record<string, SeatType> = {
  NO: 'GENERAL', NONE: 'GENERAL',
  GL: 'GIRL', GIRL: 'GIRL', GIRLS: 'GIRL', FEMALE: 'GIRL', W: 'GIRL',
  AF: 'AF', FF: 'FF',
  PH: 'PH', PWD: 'PH', PD: 'PH', DIVYANG: 'PH', HANDICAPPED: 'PH',
}
const CODE_PREFIX: Record<ReservationCategory, string> = { OPEN: 'OP', BC: 'BC', SC: 'SC', ST: 'ST', EWS: 'EWS', ANY: '' }
const CODE_SUFFIX: Record<SeatType, string> = { GENERAL: 'NO', GIRL: 'GL', AF: 'AF', FF: 'FF', PH: 'PH', TFW: 'TFW', OTHER: 'OT' }

/**
 * Parses official UPTAC category labels. Supports the compact Samarth codes
 * (OPNO, BCGL, SCPH, EWSAF, TFW …) and verbose labels found in older documents
 * (OPEN, OPEN(GIRL), BC (AF), OBC-NCL, GEN-EWS, OPEN-PwD …).
 */
export function parseCategoryCode(raw: string): ParsedCategory | null {
  const s = cleanCell(raw).toUpperCase()
  if (!s) return null
  if (/^(TFW|TF|TFWS|FW|TUITION FEE WAIVER)$/.test(s)) return { category: 'ANY', seatType: 'TFW', code: 'TFW' }

  const compact = s.match(/^(EWS|OP|BC|SC|ST)[\s\-_]?(NO|GL|AF|FF|PH)$/)
  if (compact) return build(VERTICAL[compact[1]], HORIZONTAL[compact[2]])

  const verbose = s.match(
    /^(GEN[\s-]?EWS|OBC[\s-]?NCL|OPEN|GENERAL|GEN|GN|UR|OBC|BC|SC|ST|EWS)(?:\s*[(\-–/]\s*(GIRLS?|FEMALE|GL|W|AF|FF|PH|PWD|PD|DIVYANG|HANDICAPPED|NO|NONE)\s*\)?)?$/,
  )
  if (verbose) {
    const vertical = VERTICAL[verbose[1].replace(/[\s-]/g, '')]
    const horizontal = verbose[2] ? HORIZONTAL[verbose[2]] : 'GENERAL'
    if (vertical && horizontal) return build(vertical, horizontal)
  }
  return null
}

function build(category: ReservationCategory, seatType: SeatType): ParsedCategory {
  return { category, seatType, code: `${CODE_PREFIX[category]}${CODE_SUFFIX[seatType]}` }
}

/** True for seat-matrix columns that are totals rather than categories. */
export function isTotalColumn(raw: string): boolean {
  return /^(NET\s*SEATS?|TOTAL(\s*SEATS?)?|INTAKE)$/i.test(cleanCell(raw))
}

/** The official portal shows "(not set)" for seat gender in some rounds (e.g. 2026 Special Round). */
export function isUnsetGender(raw: string): boolean {
  return /^\(?\s*not\s*set\s*\)?$/i.test(cleanCell(raw))
}

export function parseSeatGender(raw: string): SeatGender | null {
  const s = cleanCell(raw)
  if (!s) return 'NEUTRAL'
  if (isUnsetGender(s)) return 'NEUTRAL'
  if (/women|female|girl/i.test(s)) return 'FEMALE_ONLY'
  if (/co[\s-]?ed|neutral|both|^all$|male|general/i.test(s)) return 'NEUTRAL'
  return null
}

export function parseQuota(raw: string, fallback: Quota): { quota: Quota; recognised: boolean } {
  const s = cleanCell(raw)
  if (!s) return { quota: fallback, recognised: true }
  if (/home\s*state|^hs$/i.test(s)) return { quota: 'HOME_STATE', recognised: true }
  if (/all\s*india|^ai$/i.test(s)) return { quota: 'ALL_INDIA', recognised: true }
  if (/state/i.test(s)) return { quota: 'STATE', recognised: true }
  return { quota: 'OTHER', recognised: false }
}

export interface ParsedRank {
  value: number | null
  empty: boolean
  invalid: boolean
  preparatory: boolean
  /** The official value had a decimal part (e.g. "459535.01"); the integer part is used. */
  fractional?: boolean
}

export function parseRank(raw: string): ParsedRank {
  const s = cleanCell(raw)
  if (!s || /^(-+|—|–|na|n\/a|nil|null|none|\*)$/i.test(s)) return { value: null, empty: true, invalid: false, preparatory: false }
  const m = s.replace(/[,\s]/g, '').match(/^(\d+)(?:\.(\d+))?(P)?$/i)
  if (!m) return { value: null, empty: false, invalid: true, preparatory: false }
  const value = Number(m[1])
  if (!Number.isSafeInteger(value) || value <= 0) return { value: null, empty: false, invalid: true, preparatory: false }
  return { value, empty: false, invalid: false, preparatory: Boolean(m[3]), fractional: Boolean(m[2] && /[1-9]/.test(m[2])) }
}

const ROUND_WORDS: Record<string, number> = {
  FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8,
}

export function parseRound(raw: string): { number: number | null; label: string | null } {
  const s = cleanCell(raw)
  if (!s) return { number: null, label: null }
  const m = s.match(/\bR\s*(\d{1,2})\b/i) ?? s.match(/round\s*(?:no\.?)?\s*[-:]?\s*(\d{1,2})\b/i) ?? s.match(/^(\d{1,2})$/)
  if (m) return { number: Number(m[1]), label: s }
  const w = s.toUpperCase().match(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH)\s+ROUND\b/)
  if (w) return { number: ROUND_WORDS[w[1]], label: s }
  return { number: null, label: s }
}

export interface ParsedInstitute {
  code: string | null
  /** Official institute name including the place suffix (as printed in OR-CR). */
  name: string
  city: string | null
}

/** "(043) BUNDELKHAND INSTITUTE OF ENGINEERING & TECHNOLOGY,JHANSI" → code 043, name, city JHANSI */
export function parseInstitute(raw: string): ParsedInstitute {
  let s = cleanCell(raw)
  let code: string | null = null
  const m = s.match(/^\(\s*([A-Za-z0-9-]{1,20})\s*\)\s*(.+)$/) ?? s.match(/^([0-9]{2,6})\s*[-–:]\s*(.+)$/)
  if (m) {
    code = m[1]
    s = cleanCell(m[2])
  }
  const comma = s.lastIndexOf(',')
  const city = comma > 0 ? cleanCell(s.slice(comma + 1)) || null : null
  return { code, name: s, city }
}

export interface ParsedProgram {
  /** Programme / branch name without shift and fee-waiver suffixes. */
  base: string
  shift: '' | 'I' | 'II' | 'III'
  feeWaiver: boolean
}

const ROMAN: Record<string, ParsedProgram['shift']> = { I: 'I', II: 'II', III: 'III', '1': 'I', '2': 'II', '3': 'III' }

/** "Artificial Intelligence And Machine Learning (Shift I)(FW)" → base, shift I, fee waiver. */
export function parseProgram(raw: string): ParsedProgram {
  let s = cleanCell(raw)
  let shift: ParsedProgram['shift'] = ''
  const sm = s.match(/\(\s*(?:2nd\s+)?shift[\s-]*(III|II|I|[123])\s*\)/i) ?? s.match(/\bshift[\s-]*(III|II|I|[123])\b/i)
  if (sm) {
    shift = ROMAN[sm[1].toUpperCase()] ?? ''
    s = s.replace(sm[0], ' ')
  }
  const fw = /\(\s*T?FW\s*\)/i.test(s)
  s = s.replace(/\(\s*T?FW\s*\)/gi, ' ')
  // Older NIC documents: "Computer Science and Engineering (4 Years, Bachelor of Technology)"
  s = s.replace(/\(\s*\d\s*Years?,?[^)]*\)/gi, ' ')
  s = cleanCell(s).replace(/\s+\)/g, ')').replace(/\(\s+/g, '(')
  return { base: s, shift, feeWaiver: fw }
}

/** Programmes that are not B.Tech (B.Pharm, MBA, MCA, B.Arch …) and are skipped. */
export function isNonBtechProgramme(name: string): boolean {
  return /^(bachelor\s+of|master\s+of|mba\b|integrated\s+mba|integrated\s+mca|pharm\.?\s?d\b|b\.?\s?pharm|m\.?\s?pharm|bba\b|bca\b|mca\b|b\.?\s?arch|b\.?\s?des\b|bfad\b|bfa\b|bhmct\b|b\.?\s?voc\b)/i.test(
    cleanCell(name),
  )
}

/** Parent programme column (OR-CR) – keep B.Tech / integrated M.Tech, drop lateral entry. */
export function isBtechParentProgramme(name: string): boolean {
  const s = cleanCell(name)
  if (!s) return true
  if (/lateral|\(\s*l\s*\)/i.test(s)) return false
  return /b\.?\s?tech|bachelor\s+of\s+technology|m\.?\s?tech\s*\(\s*integrated/i.test(s)
}

export function parseInstituteType(raw: string): InstituteType | null {
  const s = cleanCell(raw)
  if (!s) return null
  if (/aided/i.test(s)) return 'aided'
  if (/government|govt/i.test(s)) return 'government'
  if (/private|self[\s-]?financ/i.test(s)) return 'private'
  if (/university/i.test(s)) return 'university'
  return null
}

export function normalizeExam(raw: string): string {
  const s = cleanCell(raw).toUpperCase()
  if (!s) return 'JEE-MAIN'
  if (/^JEE[\s\-_(]*MAINS?\)?$/.test(s)) return 'JEE-MAIN'
  return s
}

/** Default domicile requirement derived from the seat (see eligibility rules). */
export function defaultDomicile(category: ReservationCategory, seatType: SeatType, quota: Quota): 'UP' | 'ANY' {
  if (quota === 'HOME_STATE') return 'UP'
  if (quota === 'ALL_INDIA') return 'ANY'
  return category === 'OPEN' && seatType === 'GENERAL' ? 'ANY' : 'UP'
}
