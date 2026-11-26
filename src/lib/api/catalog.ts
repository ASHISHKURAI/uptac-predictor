import { isSpecialRound } from '@shared/prediction/engine.ts'
import { db } from '@/lib/supabase'
import type {
  Branch,
  College,
  CollegeBranchOffering,
  CollegeFee,
  CutoffOverview,
  CutoffRow,
  CutoffYear,
  PlacementRecord,
  PublicSource,
  PublicStats,
  SeatMatrixRow,
} from '@/lib/types'

/** Public, read-only catalogue queries. RLS returns only verified/active rows. */

export async function fetchPublicStats(): Promise<PublicStats> {
  const { data, error } = await db().rpc('get_public_stats')
  if (error) throw error
  return data as PublicStats
}

export async function fetchCutoffOverview(year?: number | null): Promise<CutoffOverview> {
  const { data, error } = await db().rpc('get_cutoff_overview', { p_year: year ?? null })
  if (error) throw error
  return data as CutoffOverview
}

export async function fetchCutoffYears(): Promise<CutoffYear[]> {
  const { data, error } = await db().rpc('get_cutoff_years')
  if (error) throw error
  return (data as CutoffYear[]) ?? []
}

export async function fetchPublicSources(ids?: string[] | null): Promise<PublicSource[]> {
  const { data, error } = await db().rpc('get_public_sources', { p_ids: ids && ids.length > 0 ? ids : null })
  if (error) throw error
  return (data as PublicSource[]) ?? []
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await db().from('branches').select('*').order('discipline').order('name')
  if (error) throw error
  return (data as Branch[]) ?? []
}

export interface CollegeFilters {
  search?: string
  district?: string
  type?: 'government' | 'private' | 'university' | 'all'
  featured?: boolean
  page?: number
  pageSize?: number
}

export async function fetchColleges(f: CollegeFilters = {}): Promise<{ rows: College[]; total: number }> {
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 24
  let q = db().from('colleges').select('*', { count: 'exact' }).eq('is_active', true)
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ')
    q = q.or(`name.ilike.%${s}%,code.ilike.${s}%,short_name.ilike.%${s}%,city.ilike.%${s}%`)
  }
  if (f.district) q = q.eq('district', f.district)
  if (f.type === 'government') q = q.in('institute_type', ['government', 'aided'])
  else if (f.type === 'private') q = q.eq('institute_type', 'private')
  else if (f.type === 'university') q = q.eq('institute_type', 'university')
  if (f.featured) q = q.eq('is_featured', true)
  const { data, error, count } = await q
    .order('is_featured', { ascending: false })
    .order('name')
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as College[]) ?? [], total: count ?? 0 }
}

export async function fetchAllCollegesLite(): Promise<Array<Pick<College, 'code' | 'name' | 'short_name' | 'institute_type' | 'district' | 'city'>>> {
  const out: Array<Pick<College, 'code' | 'name' | 'short_name' | 'institute_type' | 'district' | 'city'>> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from('colleges')
      .select('code,name,short_name,institute_type,district,city')
      .eq('is_active', true)
      .order('name')
      .range(from, from + 999)
    if (error) throw error
    out.push(...((data as typeof out) ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function fetchDistricts(): Promise<string[]> {
  const { data, error } = await db().from('colleges').select('district').eq('is_active', true).not('district', 'is', null).limit(2000)
  if (error) throw error
  return [...new Set((data ?? []).map((r: { district: string | null }) => r.district).filter(Boolean) as string[])].sort()
}

export async function fetchCollege(code: string): Promise<College | null> {
  const { data, error } = await db().from('colleges').select('*').eq('code', code).maybeSingle()
  if (error) throw error
  return (data as College | null) ?? null
}

export async function fetchCollegesByCodes(codes: string[]): Promise<College[]> {
  if (codes.length === 0) return []
  const { data, error } = await db().from('colleges').select('*').in('code', codes)
  if (error) throw error
  return (data as College[]) ?? []
}

export async function fetchOfferings(collegeCodes: string[]): Promise<CollegeBranchOffering[]> {
  if (collegeCodes.length === 0) return []
  const { data, error } = await db().from('college_branch_offerings').select('*').in('college_code', collegeCodes).limit(5000)
  if (error) throw error
  return (data as CollegeBranchOffering[]) ?? []
}

export async function fetchFees(collegeCodes: string[]): Promise<CollegeFee[]> {
  if (collegeCodes.length === 0) return []
  const { data, error } = await db()
    .from('college_fees')
    .select('*')
    .in('college_code', collegeCodes)
    .order('academic_year', { ascending: false })
  if (error) throw error
  return (data as CollegeFee[]) ?? []
}

export async function fetchPlacements(collegeCodes: string[]): Promise<PlacementRecord[]> {
  if (collegeCodes.length === 0) return []
  const { data, error } = await db()
    .from('placement_records')
    .select('*')
    .in('college_code', collegeCodes)
    .order('academic_year', { ascending: false })
  if (error) throw error
  return (data as PlacementRecord[]) ?? []
}

export async function fetchSeatMatrix(collegeCode: string, year?: number): Promise<SeatMatrixRow[]> {
  let q = db().from('seat_matrix').select('*').eq('college_code', collegeCode)
  if (year) q = q.eq('academic_year', year)
  const { data, error } = await q.order('academic_year', { ascending: false }).limit(3000)
  if (error) throw error
  return (data as SeatMatrixRow[]) ?? []
}

export interface CutoffFilters {
  year?: number | null
  round?: number | null
  collegeCode?: string | null
  branchCode?: string | null
  category?: string | null
  seatType?: string | null
  gender?: string | null
  quota?: string | null
  instituteType?: 'government' | 'private' | 'university' | 'all'
  search?: string
  sort?: 'closing_rank' | 'opening_rank' | 'college_code'
  ascending?: boolean
  page?: number
  pageSize?: number
}

export type CutoffWithRelations = CutoffRow & {
  colleges: Pick<College, 'name' | 'short_name' | 'institute_type' | 'district' | 'city'> | null
  branches: Pick<Branch, 'name' | 'short_name'> | null
}

export async function fetchCutoffs(f: CutoffFilters): Promise<{ rows: CutoffWithRelations[]; total: number }> {
  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 50
  const collegeJoin = f.instituteType && f.instituteType !== 'all' ? 'colleges!inner' : 'colleges'
  let q = db()
    .from('cutoff_records')
    .select(`*, ${collegeJoin}(name,short_name,institute_type,district,city), branches(name,short_name)`, { count: 'exact' })
  if (f.year) q = q.eq('academic_year', f.year)
  if (f.round) q = q.eq('round_number', f.round)
  if (f.collegeCode) q = q.eq('college_code', f.collegeCode)
  if (f.branchCode) q = q.eq('branch_code', f.branchCode)
  if (f.category) q = q.eq('category', f.category)
  if (f.seatType) q = q.eq('seat_type', f.seatType)
  if (f.gender) q = q.eq('gender', f.gender)
  if (f.quota) q = q.eq('quota', f.quota)
  if (f.instituteType === 'government') q = q.in('colleges.institute_type', ['government', 'aided'])
  else if (f.instituteType === 'private') q = q.eq('colleges.institute_type', 'private')
  else if (f.instituteType === 'university') q = q.eq('colleges.institute_type', 'university')
  const sort = f.sort ?? 'closing_rank'
  const { data, error, count } = await q
    .order(sort, { ascending: f.ascending ?? true })
    .order('id')
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { rows: (data as CutoffWithRelations[]) ?? [], total: count ?? 0 }
}

/**
 * Fetches all rows of a query in pages of 1000 (the PostgREST max_rows limit).
 * `build` must return a fresh query each call.
 */
async function fetchPaged<T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> }, maxRows = 20000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    const rows = (data as T[]) ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

/** All verified records of one programme (for trend charts and comparisons). */
export async function fetchProgramCutoffs(collegeCode: string, branchCode?: string | null): Promise<CutoffRow[]> {
  return fetchPaged<CutoffRow>(() => {
    let q = db().from('cutoff_records').select('*').eq('college_code', collegeCode)
    if (branchCode) q = q.eq('branch_code', branchCode)
    return q.order('academic_year').order('round_number').order('id')
  })
}

export type ComparisonPoint = Pick<CutoffRow, 'college_code' | 'branch_code' | 'shift' | 'academic_year' | 'round_number' | 'round_label' | 'closing_rank' | 'opening_rank'>

/** Minimal columns for year-comparison charts of one seat group across colleges. */
export async function fetchSeatComparison(f: {
  branchCodes: string[]
  collegeCodes?: string[]
  category: string
  seatType: string
  gender?: string
  quota?: string | null
  years?: number[]
}): Promise<ComparisonPoint[]> {
  if (f.branchCodes.length === 0) return []
  return fetchPaged<ComparisonPoint>(() => {
    let q = db()
      .from('cutoff_records')
      .select('college_code,branch_code,shift,academic_year,round_number,round_label,closing_rank,opening_rank')
      .in('branch_code', f.branchCodes)
      .eq('category', f.category)
      .eq('seat_type', f.seatType)
      .eq('gender', f.gender ?? 'NEUTRAL')
      .eq('rank_type', 'CRL')
    if (f.quota) q = q.eq('quota', f.quota)
    if (f.collegeCodes && f.collegeCodes.length > 0) q = q.in('college_code', f.collegeCodes)
    if (f.years && f.years.length > 0) q = q.in('academic_year', f.years)
    return q.order('college_code').order('academic_year').order('round_number').order('id')
  })
}

/**
 * Closing rank of the last REGULAR round per (college, branch, shift, year).
 * Special / spot / sliding rounds are used only when no regular round exists.
 */
export function finalRoundClosing(points: ComparisonPoint[]): Map<string, { year: number; round: number; closing: number }> {
  const map = new Map<string, { year: number; round: number; closing: number; special: boolean }>()
  for (const p of points) {
    const key = `${p.college_code}|${p.branch_code}|${p.shift}|${p.academic_year}`
    const special = isSpecialRound(p.round_label)
    const cur = map.get(key)
    const better = !cur || (cur.special && !special) || (cur.special === special && p.round_number > cur.round)
    if (better) map.set(key, { year: p.academic_year, round: p.round_number, closing: p.closing_rank, special })
  }
  return new Map([...map].map(([k, v]) => [k, { year: v.year, round: v.round, closing: v.closing }]))
}
