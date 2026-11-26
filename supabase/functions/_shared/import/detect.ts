import type { DocumentType } from './normalize.ts'

export interface DetectedMetadata {
  academicYear: number | null
  roundNumber: number | null
  documentType: DocumentType | null
}

/**
 * Best-effort detection of year / round / document type from a file name or a
 * text sample. Used only to PRE-FILL the import form – the admin confirms it.
 */
export function detectMetadata(...texts: Array<string | null | undefined>): DetectedMetadata {
  const s = texts.filter(Boolean).join(' \n ')
  const years = [...s.matchAll(/(?<!\d)(20[1-3]\d)(?!\d)/g)].map((m) => Number(m[1]))
  const roundMatch = s.match(/(?<![a-z])round[\s_-]*(\d{1,2})(?!\d)/i) ?? s.match(/(?<![A-Za-z])R[\s_-]?(\d)(?!\d)/) ?? s.match(/(?<![a-z])(first|second|third|fourth|fifth|sixth)[\s_-]*round(?![a-z])/i)
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 }
  let roundNumber: number | null = null
  if (roundMatch) roundNumber = /^\d+$/.test(roundMatch[1]) ? Number(roundMatch[1]) : (words[roundMatch[1].toLowerCase()] ?? null)

  let documentType: DocumentType | null = null
  if (/seat[\s_-]*matrix|intake/i.test(s)) documentType = 'seat_matrix'
  if (/opening|closing|or[\s_-]*cr|cut[\s_-]*off/i.test(s)) documentType = 'opening_closing_rank'

  return {
    academicYear: years.length > 0 ? Math.max(...years) : null,
    roundNumber,
    documentType,
  }
}
