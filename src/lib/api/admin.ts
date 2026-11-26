import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'
import type {
  AdminDashboardStats,
  AdminNotification,
  AppRole,
  AuditLog,
  Branch,
  College,
  CollegeFee,
  CutoffRow,
  DataSource,
  DocumentType,
  ErrorLog,
  ImportJob,
  ImportStatus,
  MonitoredSource,
  MonitorRun,
  PlacementRecord,
  Profile,
  Quota,
  RankType,
  SeatMatrixRow,
  StagingRow,
  StagingStatus,
  VerificationStatus,
} from '@/lib/types'

/**
 * Admin data access. Every call runs with the signed-in admin's JWT – the
 * database (RLS + security-definer RPCs) re-checks admin rights on each request.
 */

export const DOCUMENTS_BUCKET = 'official-documents'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const ALLOWED_EXTENSIONS = ['pdf', 'csv', 'xlsx', 'xls'] as const

export interface Page<T> {
  rows: T[]
  total: number
}

const range = (page: number, pageSize: number): [number, number] => [(page - 1) * pageSize, page * pageSize - 1]

/** Escapes user input for PostgREST `or=(...)` filters. */
function like(value: string): string {
  return value.trim().replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------
// Edge Functions
// ---------------------------------------------------------------------------
export class EdgeFunctionError extends Error {
  readonly notDeployed: boolean
  constructor(message: string, notDeployed = false) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.notDeployed = notDeployed
  }
}

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body })
  if (!error) return data as T
  const notDeployedMessage = `Edge Function "${name}" is not deployed or not reachable. Deploy it with \`supabase functions deploy ${name}\` (see docs/DEPLOYMENT.md).`
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    let message = ''
    try {
      const json = (await response.clone().json()) as { error?: string; message?: string }
      message = json.error ?? json.message ?? ''
    } catch {
      try {
        message = await response.text()
      } catch {
        message = ''
      }
    }
    if (response.status === 404 && !message) throw new EdgeFunctionError(notDeployedMessage, true)
    throw new EdgeFunctionError(message || `Edge Function "${name}" failed with HTTP ${response.status}.`)
  }
  if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) throw new EdgeFunctionError(notDeployedMessage, true)
  throw error
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function fetchAdminStats(): Promise<AdminDashboardStats> {
  const { data, error } = await db().rpc('admin_dashboard_stats')
  if (error) throw error
  return data as AdminDashboardStats
}

// ---------------------------------------------------------------------------
// Colleges
// ---------------------------------------------------------------------------
export interface AdminCollegeFilters {
  search?: string
  type?: string
  district?: string
  status?: 'all' | 'active' | 'inactive' | 'featured'
  page: number
  pageSize: number
}

export async function listCollegesAdmin(f: AdminCollegeFilters): Promise<Page<College>> {
  let q = db().from('colleges').select('*', { count: 'exact' })
  if (f.search?.trim()) {
    const s = like(f.search)
    q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,city.ilike.%${s}%,short_name.ilike.%${s}%`)
  }
  if (f.type) q = q.eq('institute_type', f.type)
  if (f.district) q = q.eq('district', f.district)
  if (f.status === 'active') q = q.eq('is_active', true)
  if (f.status === 'inactive') q = q.eq('is_active', false)
  if (f.status === 'featured') q = q.eq('is_featured', true)
  const { data, error, count } = await q.order('name').range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as College[]) ?? [], total: count ?? 0 }
}

export type CollegeInput = Omit<College, 'id' | 'created_at' | 'updated_at' | 'source_id'> & { source_id?: string | null }

export async function saveCollege(input: CollegeInput, id?: string): Promise<College> {
  const query = id ? db().from('colleges').update(input).eq('id', id) : db().from('colleges').insert(input)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data as College
}

export async function createColleges(rows: Array<Partial<CollegeInput> & Pick<College, 'code' | 'name' | 'institute_type'>>): Promise<number> {
  if (rows.length === 0) return 0
  const { error, count } = await db().from('colleges').upsert(rows, { onConflict: 'code', ignoreDuplicates: true, count: 'exact' })
  if (error) throw error
  return count ?? rows.length
}

export async function deleteCollege(id: string): Promise<void> {
  const { error } = await db().from('colleges').delete().eq('id', id)
  if (error) throw error
}

export async function setCollegeFlags(id: string, flags: Partial<Pick<College, 'is_active' | 'is_featured'>>): Promise<void> {
  const { error } = await db().from('colleges').update(flags).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export async function listBranchesAdmin(search?: string): Promise<Branch[]> {
  let q = db().from('branches').select('*')
  if (search?.trim()) {
    const s = like(search)
    q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,discipline.ilike.%${s}%,short_name.ilike.%${s}%`)
  }
  const { data, error } = await q.order('discipline').order('name').limit(1000)
  if (error) throw error
  return (data as Branch[]) ?? []
}

export type BranchInput = Omit<Branch, 'id' | 'created_at' | 'updated_at'>

export async function saveBranch(input: BranchInput, id?: string): Promise<Branch> {
  const query = id ? db().from('branches').update(input).eq('id', id) : db().from('branches').insert(input)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data as Branch
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await db().from('branches').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cutoff records & seat matrix
// ---------------------------------------------------------------------------
export interface RecordFilters {
  year?: number | null
  round?: number | null
  collegeCode?: string
  branchCode?: string
  category?: string
  seatType?: string
  status?: VerificationStatus | ''
  page: number
  pageSize: number
}

type Joined = {
  colleges: { name: string } | null
  branches: { name: string } | null
  data_sources: { title: string } | null
}
export type AdminCutoffRow = CutoffRow & Joined
export type AdminSeatRow = SeatMatrixRow & Joined

export async function listCutoffsAdmin(f: RecordFilters): Promise<Page<AdminCutoffRow>> {
  let q = db().from('cutoff_records').select('*, colleges(name), branches(name), data_sources(title)', { count: 'exact' })
  if (f.year) q = q.eq('academic_year', f.year)
  if (f.round) q = q.eq('round_number', f.round)
  if (f.collegeCode) q = q.eq('college_code', f.collegeCode)
  if (f.branchCode) q = q.eq('branch_code', f.branchCode)
  if (f.category) q = q.eq('category', f.category)
  if (f.seatType) q = q.eq('seat_type', f.seatType)
  if (f.status) q = q.eq('verification_status', f.status)
  const { data, error, count } = await q
    .order('academic_year', { ascending: false })
    .order('round_number')
    .order('college_code')
    .order('branch_code')
    .order('id')
    .range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as AdminCutoffRow[]) ?? [], total: count ?? 0 }
}

export type CutoffInput = Pick<
  CutoffRow,
  | 'academic_year'
  | 'round_number'
  | 'round_label'
  | 'college_code'
  | 'branch_code'
  | 'shift'
  | 'program_name'
  | 'category'
  | 'seat_type'
  | 'category_code'
  | 'gender'
  | 'domicile'
  | 'quota'
  | 'rank_type'
  | 'exam'
  | 'opening_rank'
  | 'closing_rank'
  | 'source_id'
  | 'source_page'
  | 'source_reference'
  | 'verification_status'
>

export async function saveCutoff(input: CutoffInput, id?: string): Promise<void> {
  const { error } = id ? await db().from('cutoff_records').update(input).eq('id', id) : await db().from('cutoff_records').insert(input)
  if (error) throw error
}

export async function setRecordStatus(table: 'cutoff_records' | 'seat_matrix', ids: string[], status: VerificationStatus): Promise<number> {
  if (ids.length === 0) return 0
  const { error, count } = await db().from(table).update({ verification_status: status }, { count: 'exact' }).in('id', ids)
  if (error) throw error
  return count ?? ids.length
}

export async function deleteRecords(table: 'cutoff_records' | 'seat_matrix' | 'college_fees' | 'placement_records', ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db().from(table).delete().in('id', ids)
  if (error) throw error
}

export async function listSeatMatrixAdmin(f: RecordFilters): Promise<Page<AdminSeatRow>> {
  let q = db().from('seat_matrix').select('*, colleges(name), branches(name), data_sources(title)', { count: 'exact' })
  if (f.year) q = q.eq('academic_year', f.year)
  if (f.collegeCode) q = q.eq('college_code', f.collegeCode)
  if (f.branchCode) q = q.eq('branch_code', f.branchCode)
  if (f.category) q = q.eq('category', f.category)
  if (f.seatType) q = q.eq('seat_type', f.seatType)
  if (f.status) q = q.eq('verification_status', f.status)
  const { data, error, count } = await q
    .order('academic_year', { ascending: false })
    .order('college_code')
    .order('branch_code')
    .order('id')
    .range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as AdminSeatRow[]) ?? [], total: count ?? 0 }
}

export type SeatInput = Pick<
  SeatMatrixRow,
  | 'academic_year'
  | 'college_code'
  | 'branch_code'
  | 'shift'
  | 'program_name'
  | 'category'
  | 'seat_type'
  | 'category_code'
  | 'gender'
  | 'domicile'
  | 'quota'
  | 'seats'
  | 'source_id'
  | 'source_page'
  | 'source_reference'
  | 'verification_status'
>

export async function saveSeatRow(input: SeatInput, id?: string): Promise<void> {
  const { error } = id ? await db().from('seat_matrix').update(input).eq('id', id) : await db().from('seat_matrix').insert(input)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Fees & placements
// ---------------------------------------------------------------------------
export interface CollegeScopedFilters {
  collegeCode?: string
  year?: number | null
  status?: VerificationStatus | ''
  page: number
  pageSize: number
}

export type AdminFeeRow = CollegeFee & { colleges: { name: string } | null; branches: { name: string } | null }
export type AdminPlacementRow = PlacementRecord & { colleges: { name: string } | null; branches: { name: string } | null }

export async function listFeesAdmin(f: CollegeScopedFilters): Promise<Page<AdminFeeRow>> {
  let q = db().from('college_fees').select('*, colleges(name), branches(name)', { count: 'exact' })
  if (f.collegeCode) q = q.eq('college_code', f.collegeCode)
  if (f.year) q = q.eq('academic_year', f.year)
  if (f.status) q = q.eq('verification_status', f.status)
  const { data, error, count } = await q
    .order('academic_year', { ascending: false })
    .order('college_code')
    .order('id')
    .range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as AdminFeeRow[]) ?? [], total: count ?? 0 }
}

export type FeeInput = Omit<CollegeFee, 'id' | 'created_at' | 'updated_at'>

export async function saveFee(input: FeeInput, id?: string): Promise<void> {
  const { error } = id ? await db().from('college_fees').update(input).eq('id', id) : await db().from('college_fees').insert(input)
  if (error) throw error
}

export async function listPlacementsAdmin(f: CollegeScopedFilters): Promise<Page<AdminPlacementRow>> {
  let q = db().from('placement_records').select('*, colleges(name), branches(name)', { count: 'exact' })
  if (f.collegeCode) q = q.eq('college_code', f.collegeCode)
  if (f.year) q = q.eq('academic_year', f.year)
  if (f.status) q = q.eq('verification_status', f.status)
  const { data, error, count } = await q
    .order('academic_year', { ascending: false })
    .order('college_code')
    .order('id')
    .range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as AdminPlacementRow[]) ?? [], total: count ?? 0 }
}

export type PlacementInput = Omit<PlacementRecord, 'id' | 'created_at' | 'updated_at'>

export async function savePlacement(input: PlacementInput, id?: string): Promise<void> {
  const { error } = id ? await db().from('placement_records').update(input).eq('id', id) : await db().from('placement_records').insert(input)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------
export interface SourceFilters {
  search?: string
  status?: DataSource['status'] | ''
  documentType?: DocumentType | ''
  page: number
  pageSize: number
}

export async function listDataSources(f: SourceFilters): Promise<Page<DataSource>> {
  let q = db().from('data_sources').select('*', { count: 'exact' })
  if (f.search?.trim()) {
    const s = like(f.search)
    q = q.or(`title.ilike.%${s}%,url.ilike.%${s}%,notes.ilike.%${s}%`)
  }
  if (f.status) q = q.eq('status', f.status)
  if (f.documentType) q = q.eq('document_type', f.documentType)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as DataSource[]) ?? [], total: count ?? 0 }
}

/** Lightweight list for selects (latest first). */
export async function listSourceOptions(): Promise<Array<Pick<DataSource, 'id' | 'title' | 'academic_year' | 'document_type' | 'status'>>> {
  const { data, error } = await db()
    .from('data_sources')
    .select('id,title,academic_year,document_type,status')
    .neq('status', 'ignored')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data as Array<Pick<DataSource, 'id' | 'title' | 'academic_year' | 'document_type' | 'status'>>) ?? []
}

export type DataSourceInput = Pick<DataSource, 'title' | 'source_type' | 'document_type' | 'url' | 'academic_year' | 'status' | 'notes'> &
  Partial<Pick<DataSource, 'storage_path' | 'checksum_sha256' | 'file_size' | 'mime_type' | 'discovered_via' | 'created_by'>>

export async function saveDataSource(input: DataSourceInput, id?: string): Promise<DataSource> {
  const query = id ? db().from('data_sources').update(input).eq('id', id) : db().from('data_sources').insert(input)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data as DataSource
}

export async function setDataSourceStatus(id: string, status: DataSource['status']): Promise<void> {
  const { error } = await db().from('data_sources').update({ status }).eq('id', id)
  if (error) throw error
}

/** Attaches an uploaded file to an existing (e.g. monitor-discovered) source. */
export async function attachFileToSource(
  id: string,
  fields: { storage_path: string; checksum_sha256: string; file_size: number; mime_type: string },
): Promise<void> {
  const { error } = await db().from('data_sources').update({ ...fields, status: 'active' }).eq('id', id)
  if (error) throw error
}

export async function deleteDataSource(id: string): Promise<void> {
  const { error } = await db().from('data_sources').delete().eq('id', id)
  if (error) throw error
}

export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
export function fileExtension(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase()
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (cleaned || 'document').slice(-120)
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
}

export function mimeFor(file: File): string {
  return MIME_BY_EXT[fileExtension(file.name)] ?? file.type ?? 'application/octet-stream'
}

export async function uploadDocument(file: File, academicYear: number): Promise<string> {
  const path = `imports/${academicYear}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`
  const { error } = await db().storage.from(DOCUMENTS_BUCKET).upload(path, file, { contentType: mimeFor(file), upsert: false })
  if (error) throw error
  return path
}

export async function removeDocument(path: string): Promise<void> {
  await db().storage.from(DOCUMENTS_BUCKET).remove([path])
}

export async function findActiveJobByChecksum(checksum: string): Promise<Pick<ImportJob, 'id' | 'file_name' | 'status' | 'created_at'> | null> {
  const { data, error } = await db()
    .from('import_jobs')
    .select('id,file_name,status,created_at')
    .eq('file_checksum', checksum)
    .not('status', 'in', '(failed,cancelled)')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as Pick<ImportJob, 'id' | 'file_name' | 'status' | 'created_at'> | null) ?? null
}

export interface NewImportJob {
  data_source_id: string
  file_name: string
  storage_path: string
  file_checksum: string
  mime_type: string
  file_size: number
  document_type: 'opening_closing_rank' | 'seat_matrix'
  academic_year: number
  round_number: number | null
  rank_type: RankType
  default_quota: Quota
  created_by: string | null
  detected?: Record<string, unknown>
}

export async function createImportJob(input: NewImportJob): Promise<ImportJob> {
  const { data, error } = await db()
    .from('import_jobs')
    .insert({ ...input, status: 'uploaded' as ImportStatus })
    .select()
    .single()
  if (error) throw error
  return data as ImportJob
}

export async function startImport(jobId: string, retry = false): Promise<{ ok: boolean; status?: string }> {
  return invokeFunction<{ ok: boolean; status?: string }>('process-import', retry ? { job_id: jobId, retry: true } : { job_id: jobId })
}

export async function listImportJobs(page: number, pageSize: number, status?: ImportStatus | ''): Promise<Page<ImportJob>> {
  let q = db().from('import_jobs').select('*', { count: 'exact' })
  if (status) q = q.eq('status', status)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(page, pageSize))
  if (error) throw error
  return { rows: (data as ImportJob[]) ?? [], total: count ?? 0 }
}

export async function getImportJob(id: string): Promise<(ImportJob & { data_sources: Pick<DataSource, 'title' | 'url'> | null }) | null> {
  const { data, error } = await db().from('import_jobs').select('*, data_sources(title,url)').eq('id', id).maybeSingle()
  if (error) throw error
  return data as (ImportJob & { data_sources: Pick<DataSource, 'title' | 'url'> | null }) | null
}

export async function cancelImportJob(id: string): Promise<void> {
  const { error } = await db().from('import_jobs').update({ status: 'cancelled' as ImportStatus, finished_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export interface StagingFilters {
  status?: StagingStatus | ''
  errorsOnly?: boolean
  warningsOnly?: boolean
  duplicate?: StagingRow['duplicate_status'] | ''
  recordType?: StagingRow['record_type'] | ''
  search?: string
  page: number
  pageSize: number
}

export async function listStaging(jobId: string, f: StagingFilters): Promise<Page<StagingRow>> {
  let q = db().from('import_staging_records').select('*', { count: 'exact' }).eq('import_job_id', jobId)
  if (f.status) q = q.eq('status', f.status)
  if (f.errorsOnly) q = q.eq('has_errors', true)
  if (f.warningsOnly) q = q.filter('issues', 'cs', JSON.stringify([{ severity: 'warning' }]))
  if (f.duplicate) q = q.eq('duplicate_status', f.duplicate)
  if (f.recordType) q = q.eq('record_type', f.recordType)
  if (f.search?.trim()) {
    const s = like(f.search)
    q = q.or(`college_name_raw.ilike.%${s}%,branch_name_raw.ilike.%${s}%,college_code.ilike.%${s}%,branch_code.ilike.%${s}%,category_code.ilike.%${s}%`)
  }
  const { data, error, count } = await q.order('record_type').order('row_index').range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as StagingRow[]) ?? [], total: count ?? 0 }
}

export interface StagingCounts {
  total: number
  pending: number
  approved: number
  rejected: number
  skipped: number
  published: number
  errors: number
  approvable: number
  in_file: number
  existing_conflict: number
}

export async function stagingCounts(jobId: string): Promise<StagingCounts> {
  const base = () => db().from('import_staging_records').select('id', { count: 'exact', head: true }).eq('import_job_id', jobId)
  const queries = {
    total: base(),
    pending: base().eq('status', 'pending'),
    approved: base().eq('status', 'approved'),
    rejected: base().eq('status', 'rejected'),
    skipped: base().eq('status', 'skipped'),
    published: base().eq('status', 'published'),
    errors: base().eq('has_errors', true).in('status', ['pending', 'approved']),
    approvable: base().eq('status', 'pending').eq('has_errors', false).neq('duplicate_status', 'in_file'),
    in_file: base().eq('duplicate_status', 'in_file').in('status', ['pending', 'approved']),
    existing_conflict: base().eq('duplicate_status', 'existing_conflict').in('status', ['pending', 'approved']),
  }
  const keys = Object.keys(queries) as Array<keyof StagingCounts>
  const results = await Promise.all(keys.map((k) => queries[k]))
  const out = {} as StagingCounts
  results.forEach((r, i) => {
    if (r.error) throw r.error
    out[keys[i]] = r.count ?? 0
  })
  return out
}

/** Rows still flagged with unresolved institute / programme references. */
export async function unresolvedCounts(jobId: string): Promise<{ colleges: number; branches: number }> {
  const base = () =>
    db().from('import_staging_records').select('id', { count: 'exact', head: true }).eq('import_job_id', jobId).in('status', ['pending', 'approved'])
  const [c, b] = await Promise.all([
    base().filter('issues', 'cs', JSON.stringify([{ code: 'unknown_college' }])),
    base().filter('issues', 'cs', JSON.stringify([{ code: 'unknown_branch' }])),
  ])
  if (c.error) throw c.error
  if (b.error) throw b.error
  return { colleges: c.count ?? 0, branches: b.count ?? 0 }
}

export type StagingPatch = Partial<
  Pick<
    StagingRow,
    | 'academic_year'
    | 'round_number'
    | 'round_label'
    | 'college_code'
    | 'branch_code'
    | 'shift'
    | 'category'
    | 'seat_type'
    | 'category_code'
    | 'gender'
    | 'domicile'
    | 'quota'
    | 'rank_type'
    | 'exam'
    | 'opening_rank'
    | 'closing_rank'
    | 'seats'
    | 'issues'
    | 'has_errors'
    | 'status'
  >
>

export async function updateStagingRow(jobId: string, id: string, patch: StagingPatch): Promise<void> {
  const { error } = await db().from('import_staging_records').update(patch).eq('id', id).eq('import_job_id', jobId)
  if (error) throw error
  await refreshDuplicates(jobId)
}

export async function setStagingStatus(jobId: string, ids: string[], status: StagingStatus, reviewerId: string | null): Promise<number> {
  if (ids.length === 0) return 0
  let q = db()
    .from('import_staging_records')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }, { count: 'exact' })
    .eq('import_job_id', jobId)
    .in('id', ids)
    .neq('status', 'published')
  if (status === 'approved') q = q.eq('has_errors', false)
  const { error, count } = await q
  if (error) throw error
  return count ?? 0
}

export async function approveAllValid(jobId: string, reviewerId: string | null): Promise<number> {
  const { error, count } = await db()
    .from('import_staging_records')
    .update({ status: 'approved' as StagingStatus, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }, { count: 'exact' })
    .eq('import_job_id', jobId)
    .eq('status', 'pending')
    .eq('has_errors', false)
    .neq('duplicate_status', 'in_file')
  if (error) throw error
  return count ?? 0
}

export async function refreshDuplicates(jobId: string): Promise<{ in_file: number; existing_same: number; existing_conflict: number }> {
  const { data, error } = await db().rpc('refresh_staging_duplicates', { p_job_id: jobId })
  if (error) throw error
  return data as { in_file: number; existing_same: number; existing_conflict: number }
}

export async function revalidateReferences(jobId: string): Promise<{ unresolved_college_rows: number; unresolved_branch_rows: number }> {
  const { data, error } = await db().rpc('revalidate_staging_references', { p_job_id: jobId })
  if (error) throw error
  return data as { unresolved_college_rows: number; unresolved_branch_rows: number }
}

export async function applyCollegeMapping(jobId: string, rawName: string, collegeCode: string): Promise<number> {
  const { data, error } = await db().rpc('apply_college_mapping', { p_job_id: jobId, p_raw_name: rawName, p_college_code: collegeCode })
  if (error) throw error
  return (data as number) ?? 0
}

export async function applyBranchMapping(jobId: string, rawName: string, branchCode: string): Promise<number> {
  const { data, error } = await db().rpc('apply_branch_mapping', { p_job_id: jobId, p_raw_name: rawName, p_branch_code: branchCode })
  if (error) throw error
  return (data as number) ?? 0
}

export async function publishImportJob(jobId: string): Promise<{ cutoff_records: number; seat_matrix_rows: number }> {
  const { data, error } = await db().rpc('publish_import_job', { p_job_id: jobId })
  if (error) throw error
  return data as { cutoff_records: number; seat_matrix_rows: number }
}

/** All college & branch codes – used to re-validate edited staging rows. */
export async function fetchReferenceCodes(): Promise<{ colleges: Set<string>; branches: Set<string> }> {
  const colleges = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('colleges').select('code').order('code').range(from, from + 999)
    if (error) throw error
    for (const r of (data as Array<{ code: string }>) ?? []) colleges.add(r.code)
    if (!data || data.length < 1000) break
  }
  const { data, error } = await db().from('branches').select('code').limit(1000)
  if (error) throw error
  return { colleges, branches: new Set(((data as Array<{ code: string }>) ?? []).map((b) => b.code)) }
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------
export async function listMonitoredSources(): Promise<MonitoredSource[]> {
  const { data, error } = await db().from('monitored_sources').select('*').order('label')
  if (error) throw error
  return (data as MonitoredSource[]) ?? []
}

export type MonitoredSourceInput = Pick<MonitoredSource, 'label' | 'url' | 'kind' | 'enabled'>

export async function saveMonitoredSource(input: Partial<MonitoredSourceInput>, id?: string): Promise<void> {
  const { error } = id ? await db().from('monitored_sources').update(input).eq('id', id) : await db().from('monitored_sources').insert(input)
  if (error) throw error
}

export async function deleteMonitoredSource(id: string): Promise<void> {
  const { error } = await db().from('monitored_sources').delete().eq('id', id)
  if (error) throw error
}

export async function listMonitorRuns(page: number, pageSize: number): Promise<Page<MonitorRun>> {
  const { data, error, count } = await db()
    .from('monitor_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(...range(page, pageSize))
  if (error) throw error
  return { rows: (data as MonitorRun[]) ?? [], total: count ?? 0 }
}

export interface MonitorResult {
  run_id: string
  status: MonitorRun['status']
  pages_checked: number
  changed_pages: number
  new_documents: number
  changed_documents: number
  errors: string[]
}

export async function runMonitor(): Promise<MonitorResult> {
  return invokeFunction<MonitorResult>('monitor-uptac', { trigger: 'manual' })
}

// ---------------------------------------------------------------------------
// Notifications, error logs, activity, users
// ---------------------------------------------------------------------------
export async function listNotifications(page: number, pageSize: number, unreadOnly: boolean): Promise<Page<AdminNotification>> {
  let q = db().from('admin_notifications').select('*', { count: 'exact' })
  if (unreadOnly) q = q.is('read_at', null)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(page, pageSize))
  if (error) throw error
  return { rows: (data as AdminNotification[]) ?? [], total: count ?? 0 }
}

export async function markNotificationsRead(ids: string[] | 'all', userId: string | null): Promise<void> {
  let q = db().from('admin_notifications').update({ read_at: new Date().toISOString(), read_by: userId }).is('read_at', null)
  if (ids !== 'all') q = q.in('id', ids)
  const { error } = await q
  if (error) throw error
}

export interface ErrorFilters {
  source?: ErrorLog['source'] | ''
  level?: ErrorLog['level'] | ''
  unresolvedOnly?: boolean
  page: number
  pageSize: number
}

export async function listErrorLogs(f: ErrorFilters): Promise<Page<ErrorLog>> {
  let q = db().from('error_logs').select('*', { count: 'exact' })
  if (f.source) q = q.eq('source', f.source)
  if (f.level) q = q.eq('level', f.level)
  if (f.unresolvedOnly) q = q.is('resolved_at', null)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as ErrorLog[]) ?? [], total: count ?? 0 }
}

export async function resolveErrorLog(id: string, userId: string | null, resolved = true): Promise<void> {
  const { error } = await db()
    .from('error_logs')
    .update(resolved ? { resolved_at: new Date().toISOString(), resolved_by: userId } : { resolved_at: null, resolved_by: null })
    .eq('id', id)
  if (error) throw error
}

export interface AuditFilters {
  entityType?: string
  action?: string
  page: number
  pageSize: number
}

export async function listAuditLogs(f: AuditFilters): Promise<Page<AuditLog>> {
  let q = db().from('admin_audit_logs').select('*', { count: 'exact' })
  if (f.entityType) q = q.eq('entity_type', f.entityType)
  if (f.action) q = q.eq('action', f.action)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(f.page, f.pageSize))
  if (error) throw error
  return { rows: (data as AuditLog[]) ?? [], total: count ?? 0 }
}

export async function fetchProfilesByIds(ids: string[]): Promise<Array<Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await db().from('profiles').select('id,full_name,email,role').in('id', unique)
  if (error) throw error
  return (data as Array<Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>>) ?? []
}

export async function listProfiles(search: string, role: AppRole | '', page: number, pageSize: number): Promise<Page<Profile>> {
  let q = db().from('profiles').select('*', { count: 'exact' })
  if (search.trim()) {
    const s = like(search)
    q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`)
  }
  if (role) q = q.eq('role', role)
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(...range(page, pageSize))
  if (error) throw error
  return { rows: (data as Profile[]) ?? [], total: count ?? 0 }
}

export async function setUserRole(userId: string, role: AppRole): Promise<void> {
  const { error } = await db().rpc('set_user_role', { p_user_id: userId, p_role: role })
  if (error) throw error
}
