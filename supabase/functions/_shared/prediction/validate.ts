import type { Gender, InstitutePreference, PredictionRequest, StudentCategory, StudentDomicile, SubCategory } from './types.ts'

/** Upper bound for JEE Main CRL ranks accepted by the form (generous, validated server-side too). */
export const MAX_RANK = 2_000_000
export const MIN_ADMISSION_YEAR = 2020
export const MAX_ADMISSION_YEAR = 2100

const CATEGORIES: StudentCategory[] = ['OPEN', 'EWS', 'BC', 'SC', 'ST']
const GENDERS: Gender[] = ['MALE', 'FEMALE']
const DOMICILES: StudentDomicile[] = ['UP', 'OTHER']
const SUBCATEGORIES: SubCategory[] = ['AF', 'FF', 'PH', 'TFW']
const PREFERENCES: InstitutePreference[] = ['government', 'private', 'both']
const BRANCH_CODE = /^[A-Z0-9][A-Z0-9-]{0,29}$/

export type ValidationResult =
  | { ok: true; value: PredictionRequest }
  | { ok: false; errors: Record<string, string> }

/**
 * Validates and normalises an untrusted prediction request (from the browser or
 * the API). Dependency-free so it runs identically in Deno and the browser.
 */
export function validatePredictionRequest(input: unknown): ValidationResult {
  const errors: Record<string, string> = {}
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const crlRank = toInt(o.crlRank)
  if (crlRank === null) errors.crlRank = 'Enter your JEE Main CRL rank.'
  else if (crlRank < 1 || crlRank > MAX_RANK) errors.crlRank = `CRL rank must be between 1 and ${MAX_RANK.toLocaleString('en-IN')}.`

  let categoryRank: number | null = null
  if (o.categoryRank !== undefined && o.categoryRank !== null && o.categoryRank !== '') {
    categoryRank = toInt(o.categoryRank)
    if (categoryRank === null || categoryRank < 1 || categoryRank > MAX_RANK) errors.categoryRank = 'Category rank must be a positive whole number.'
  }

  const admissionYear = toInt(o.admissionYear)
  if (admissionYear === null || admissionYear < MIN_ADMISSION_YEAR || admissionYear > MAX_ADMISSION_YEAR) {
    errors.admissionYear = 'Select a valid admission year.'
  }

  const category = o.category as StudentCategory
  if (!CATEGORIES.includes(category)) errors.category = 'Select your category.'

  const gender = o.gender as Gender
  if (!GENDERS.includes(gender)) errors.gender = 'Select your gender.'

  const domicile = o.domicile as StudentDomicile
  if (!DOMICILES.includes(domicile)) errors.domicile = 'Select your domicile.'

  const institutePreference = (o.institutePreference ?? 'both') as InstitutePreference
  if (!PREFERENCES.includes(institutePreference)) errors.institutePreference = 'Select a college preference.'

  const subCategories = Array.isArray(o.subCategories) ? o.subCategories : []
  if (!subCategories.every((s) => SUBCATEGORIES.includes(s as SubCategory))) errors.subCategories = 'Invalid sub-category.'

  if (category === 'EWS' && domicile === 'OTHER') {
    // Not an error – the engine explains that EWS reservation is UP-domicile only.
  }

  const branchCodes = Array.isArray(o.branchCodes) ? o.branchCodes : []
  if (branchCodes.length > 80 || !branchCodes.every((b) => typeof b === 'string' && BRANCH_CODE.test(b))) {
    errors.branchCodes = 'Invalid branch selection.'
  }

  let years: number[] | undefined
  if (Array.isArray(o.years) && o.years.length > 0) {
    const parsed = o.years.map(toInt)
    if (parsed.some((y) => y === null || y < 2000 || y > MAX_ADMISSION_YEAR) || parsed.length > 5) {
      errors.years = 'Select up to five valid comparison years.'
    } else {
      years = [...new Set(parsed as number[])]
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      crlRank: crlRank as number,
      categoryRank,
      admissionYear: admissionYear as number,
      category,
      gender,
      domicile,
      subCategories: [...new Set(subCategories as SubCategory[])],
      branchCodes: [...new Set(branchCodes as string[])],
      institutePreference,
      years,
    },
  }
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string' && /^\s*\d[\d,]*\s*$/.test(value)) {
    const n = Number(value.replace(/[,\s]/g, ''))
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}
