/**
 * Row types mirroring supabase/migrations/*. Keep in sync with the SQL schema.
 * (Generate with `supabase gen types typescript` once a project is linked if you
 * prefer fully generated types.)
 */
import type {
  CutoffRecord,
  DomicileRequirement,
  InstituteType,
  PredictionRequest,
  PredictionResult,
  Quota,
  RankType,
  ReservationCategory,
  SeatGender,
  SeatType,
} from '@shared/prediction/types.ts'

export type {
  CutoffRecord,
  DomicileRequirement,
  InstituteType,
  PredictionRequest,
  PredictionResult,
  Quota,
  RankType,
  ReservationCategory,
  SeatGender,
  SeatType,
}

export type AppRole = 'student' | 'admin' | 'super_admin'
export type VerificationStatus = 'pending' | 'verified' | 'rejected'
export type DocumentType =
  | 'opening_closing_rank'
  | 'seat_matrix'
  | 'brochure'
  | 'notice'
  | 'fee_structure'
  | 'placement_report'
  | 'other'
export type ImportStatus = 'uploaded' | 'queued' | 'processing' | 'in_review' | 'publishing' | 'published' | 'failed' | 'cancelled'
export type StagingStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'skipped'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: AppRole
  jee_crl_rank: number | null
  category: 'OPEN' | 'EWS' | 'BC' | 'SC' | 'ST' | null
  gender: 'MALE' | 'FEMALE' | null
  domicile: 'UP' | 'OTHER' | null
  favourite_branches: string[]
  created_at: string
  updated_at: string
}

export interface College {
  id: string
  code: string
  name: string
  short_name: string | null
  aliases: string[]
  institute_type: InstituteType
  district: string | null
  city: string | null
  address: string | null
  pincode: string | null
  website: string | null
  email: string | null
  phone: string | null
  established_year: number | null
  affiliated_university: string | null
  naac_grade: string | null
  description: string | null
  is_featured: boolean
  is_active: boolean
  source_id: string | null
  created_at: string
  updated_at: string
}

export interface Branch {
  id: string
  code: string
  name: string
  short_name: string | null
  discipline: string | null
  aliases: string[]
  degree: string
  duration_years: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CutoffRow extends CutoffRecord {
  source_reference: string | null
  import_job_id: string | null
  verification_status: VerificationStatus
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface SeatMatrixRow {
  id: string
  academic_year: number
  college_code: string
  branch_code: string
  shift: string
  program_name: string | null
  category: ReservationCategory
  seat_type: SeatType
  category_code: string | null
  gender: SeatGender
  domicile: DomicileRequirement
  quota: Quota
  seats: number
  source_id: string
  source_page: number | null
  source_reference: string | null
  import_job_id: string | null
  verification_status: VerificationStatus
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface CollegeFee {
  id: string
  college_code: string
  academic_year: number
  branch_code: string | null
  fee_type: 'tuition' | 'hostel' | 'mess' | 'admission' | 'examination' | 'other' | 'total_annual' | 'total_program'
  amount: number
  currency: string
  notes: string | null
  source_url: string | null
  source_id: string | null
  verification_status: VerificationStatus
  created_at: string
  updated_at: string
}

export interface PlacementRecord {
  id: string
  college_code: string
  academic_year: number
  branch_code: string | null
  students_eligible: number | null
  students_placed: number | null
  median_package_lpa: number | null
  average_package_lpa: number | null
  highest_package_lpa: number | null
  companies_visited: number | null
  notes: string | null
  source_url: string | null
  source_id: string | null
  verification_status: VerificationStatus
  created_at: string
  updated_at: string
}

export interface DataSource {
  id: string
  title: string
  source_type: 'uptac_official' | 'college_official' | 'placement_report' | 'government' | 'other'
  document_type: DocumentType
  url: string | null
  academic_year: number | null
  storage_path: string | null
  checksum_sha256: string | null
  file_size: number | null
  mime_type: string | null
  etag: string | null
  last_modified: string | null
  discovered_via: 'manual' | 'upload' | 'monitor'
  status: 'discovered' | 'active' | 'imported' | 'ignored' | 'archived'
  notes: string | null
  last_checked_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PublicSource {
  id: string
  title: string
  source_type: string
  document_type: DocumentType
  url: string | null
  academic_year: number | null
  created_at: string
}

export interface ImportStats {
  tables?: number
  data_rows?: number
  staged_records?: number
  skipped_non_btech?: number
  skipped_non_jee?: number
  no_allotment?: number
  zero_seat_cells?: number
  records_with_errors?: number
  records_with_warnings?: number
  new_colleges?: Array<{ code: string; name: string; institute_type: InstituteType | null; city: string | null; district: string | null; rows: number }>
  unresolved_colleges?: Array<{ raw: string; rows: number; suggestion: { code: string; name: string; score: number } | null }>
  unresolved_branches?: Array<{ raw: string; rows: number; suggestion: { code: string; name: string; score: number } | null }>
  warnings?: string[]
  header?: string[]
  detected_document_type?: string | null
  duplicates?: { in_file: number; existing_same: number; existing_conflict: number }
  published_cutoffs?: number
  published_seat_rows?: number
}

export interface ImportJob {
  id: string
  data_source_id: string
  file_name: string
  storage_path: string
  file_checksum: string
  mime_type: string | null
  file_size: number | null
  document_type: 'opening_closing_rank' | 'seat_matrix'
  academic_year: number
  round_number: number | null
  rank_type: RankType
  default_quota: Quota
  status: ImportStatus
  attempts: number
  max_attempts: number
  processor: 'edge_tabular' | 'python_pdf' | null
  error_message: string | null
  detected: Record<string, unknown>
  stats: ImportStats
  created_by: string | null
  started_at: string | null
  finished_at: string | null
  published_at: string | null
  published_by: string | null
  created_at: string
  updated_at: string
}

export interface StagingIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  field?: string
  suggestion?: { code: string; name: string; score: number }
}

export interface StagingRow {
  id: string
  import_job_id: string
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
  issues: StagingIssue[]
  has_errors: boolean
  duplicate_status: 'none' | 'in_file' | 'existing_same' | 'existing_conflict'
  existing_record_id: string | null
  status: StagingStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface MonitoredSource {
  id: string
  label: string
  url: string
  kind: 'html_page' | 'notice_list' | 'orcr_table' | 'seat_matrix_table'
  enabled: boolean
  last_checked_at: string | null
  last_status: number | null
  last_content_hash: string | null
  last_record_count: number | null
  last_changed_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface MonitorRun {
  id: string
  triggered_by: 'schedule' | 'manual'
  status: 'running' | 'success' | 'partial' | 'failed'
  pages_checked: number
  changed_pages: number
  new_documents: number
  changed_documents: number
  error: string | null
  details: Record<string, unknown>
  started_at: string
  finished_at: string | null
}

export interface AdminNotification {
  id: string
  kind: 'new_document' | 'changed_document' | 'changed_page' | 'import_ready' | 'import_failed' | 'system'
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown>
  read_at: string | null
  read_by: string | null
  created_at: string
}

export interface ErrorLog {
  id: string
  source: 'import' | 'monitor' | 'predict' | 'processor' | 'client' | 'database'
  level: 'error' | 'warning' | 'info'
  message: string
  context: Record<string, unknown>
  import_job_id: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  details: Record<string, unknown>
  created_at: string
}

export interface SavedCollege {
  id: string
  user_id: string
  college_code: string
  note: string | null
  created_at: string
}

export interface PredictionLog {
  id: string
  user_id: string | null
  input: PredictionRequest
  summary: Partial<PredictionResult['summary']> & { years?: number[] }
  result_count: number
  data_years: number[]
  created_at: string
}

export interface ChoiceList {
  id: string
  user_id: string
  name: string
  academic_year: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChoiceListItem {
  id: string
  list_id: string
  position: number
  college_code: string
  branch_code: string
  shift: string
  notes: string | null
  created_at: string
}

export interface CollegeBranchOffering {
  college_code: string
  branch_code: string
  shift: string
  latest_year: number
  program_name: string | null
  latest_total_seats: number | null
}

export interface PublicStats {
  colleges: number
  colleges_with_cutoffs: number
  branches_with_cutoffs: number
  verified_cutoff_records: number
  verified_seat_matrix_rows: number
  official_sources: number
  years: number[]
  last_verified_at: string | null
}

export interface CutoffOverview {
  year: number | null
  branches: Array<{
    branch_code: string
    branch_name: string
    short_name: string | null
    programs: number
    best_closing: number
    median_closing: number
    max_closing: number
  }>
}

export interface CutoffYear {
  year: number
  rounds: Array<{ round_number: number; round_label: string | null }>
}

export interface AdminDashboardStats {
  colleges: number
  branches: number
  cutoffs_verified: number
  cutoffs_pending: number
  seat_matrix_verified: number
  fees: number
  placements: number
  data_sources: number
  sources_discovered: number
  imports_by_status: Partial<Record<ImportStatus, number>>
  staging_pending: number
  users: number
  admins: number
  predictions_30d: number
  unread_notifications: number
  open_errors: number
  last_monitor_run: Pick<MonitorRun, 'status' | 'started_at' | 'finished_at' | 'new_documents' | 'changed_pages'> | null
  records_by_year: Array<{ year: number; cutoffs: number; seat_rows: number }>
  predictions_by_day: Array<{ day: string; count: number }>
}
