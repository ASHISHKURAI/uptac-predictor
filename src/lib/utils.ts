import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const IN = new Intl.NumberFormat('en-IN')

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : IN.format(value)
}

export function formatRank(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : IN.format(value)
}

export function formatCurrency(value: number | null | undefined, currency = 'INR'): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

export function formatLpa(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} LPA`
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return formatDate(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const ACRONYMS = new Set([
  'AKTU', 'IET', 'KNIT', 'BIET', 'HBTU', 'MMMUT', 'ABES', 'AKGEC', 'KIET', 'JSS', 'GL', 'IIMT', 'IMS', 'ITS', 'NIET', 'GNIOT',
  'PSIT', 'SRMCEM', 'BBD', 'BBDNITM', 'AIMT', 'RKGIT', 'IPEC', 'MIET', 'SRMS', 'UPTTI', 'HMR', 'KCC', 'GCET', 'GCRG', 'IIIT',
  'IT', 'IIT', 'NIT', 'CSE', 'ECE', 'EE', 'ME', 'CE', 'AI', 'ML', 'DS', 'IOT', 'VLSI', 'II', 'III', 'UP', 'U.P.', 'NCR', 'BBA', 'MBA', 'MCA',
  'SR', 'SRM', 'JP', 'RD', 'KR', 'SD', 'BN', 'RR', 'MG', 'AN', 'BSA', 'IFTM', 'TMU', 'GLA', 'SGIT', 'DIT', 'MGM', 'LDC', 'IERT', 'REC', 'FGIET', 'BKIT',
])
const SMALL_WORDS = new Set(['of', 'and', 'for', 'the', 'in', 'at', 'on', '&'])

/**
 * Converts ALL-CAPS official institute names into readable title case for card
 * titles while keeping known acronyms. The official name is always shown too.
 */
export function prettyName(name: string | null | undefined): string {
  if (!name) return ''
  if (name !== name.toUpperCase()) return name
  return name
    .toLowerCase()
    .split(/(\s+|,|\(|\)|-|\/)/)
    .map((word, i) => {
      const upper = word.toUpperCase()
      if (ACRONYMS.has(upper) || /^[A-Z]\.([A-Z]\.)+$/.test(upper)) return upper
      if (i > 0 && SMALL_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join('')
    .replace(/,(?=\S)/g, ', ')
}

export function instituteTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'government':
      return 'Government'
    case 'aided':
      return 'Govt. aided'
    case 'private':
      return 'Private'
    case 'university':
      return 'University'
    default:
      return '—'
  }
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
