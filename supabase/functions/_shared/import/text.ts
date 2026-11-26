/** Text helpers shared by the import pipeline (Deno + browser + tests). */

export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/[   ]/g, ' ')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Matching key for institute / programme names. Mirrors public.norm_key() in
 * supabase/migrations/20261126000004_storage_and_reference.sql – keep in sync.
 */
export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bengg\b\.?/g, 'engineering')
    .replace(/[^a-z0-9]/g, '')
}

const STOP_WORDS = new Set(['of', 'and', 'the', 'in', 'for', 'a', 'an'])

export function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bengg\b\.?/g, 'engineering')
    .replace(/\btech\b\.?/g, 'technology')
    .replace(/\binst\b\.?/g, 'institute')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
}

/** Jaccard similarity of word sets – used only to SUGGEST matches to admins. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

export function bestMatch<T extends { code: string; name: string; aliases?: string[] | null }>(
  value: string,
  candidates: T[],
  threshold = 0.6,
): { code: string; name: string; score: number } | null {
  let best: { code: string; name: string; score: number } | null = null
  for (const c of candidates) {
    for (const n of [c.name, ...(c.aliases ?? [])]) {
      const score = similarity(value, n)
      if (score >= threshold && (!best || score > best.score)) best = { code: c.code, name: c.name, score: Math.round(score * 100) / 100 }
    }
  }
  return best
}
