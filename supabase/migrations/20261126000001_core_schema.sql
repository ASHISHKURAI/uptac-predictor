-- =============================================================================
-- UPTAC Predictor – core schema
-- -----------------------------------------------------------------------------
-- Domain notes (verified against the official UPTAC portal, uptac.samarth.edu.in,
-- November 2026 – re-verify against each year's official brochure):
--   * Official category codes combine a vertical category and a horizontal
--     sub-category, e.g. OPNO, BCGL, SCPH, EWSAF, plus TFW (tuition fee waiver).
--       vertical:   OP(=OPEN) | BC | SC | ST | EWS
--       horizontal: NO(=none) | GL(=girl) | AF(=armed forces) | FF(=freedom
--                   fighter) | PH(=persons with disability)
--   * Opening / closing ranks for JEE-MAIN based B.Tech admission are published
--     as JEE Main CRL ranks for every category in the current portal. Older
--     documents may use category ranks, so every record stores its rank_type and
--     the prediction engine never compares across rank types.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('student', 'admin', 'super_admin');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
-- Official seat matrix labels: 'Government Institution', 'Private Institution', 'Other University'.
create type public.institute_type as enum ('government', 'aided', 'private', 'university');
-- 'ANY' is used for seats that are not tied to a vertical category (e.g. TFW).
create type public.reservation_category as enum ('OPEN', 'EWS', 'BC', 'SC', 'ST', 'ANY');
create type public.seat_type as enum ('GENERAL', 'GIRL', 'AF', 'FF', 'PH', 'TFW', 'OTHER');
create type public.seat_gender as enum ('NEUTRAL', 'FEMALE_ONLY');
create type public.domicile_requirement as enum ('UP', 'ANY');
-- STATE = regular UPTAC state counselling seat where the official document does
-- not split seats into further quotas.
create type public.seat_quota as enum ('STATE', 'HOME_STATE', 'ALL_INDIA', 'OTHER');
create type public.rank_type as enum ('CRL', 'CATEGORY');
create type public.document_type as enum (
  'opening_closing_rank', 'seat_matrix', 'brochure', 'notice', 'fee_structure', 'placement_report', 'other'
);
create type public.import_status as enum (
  'uploaded', 'queued', 'processing', 'in_review', 'publishing', 'published', 'failed', 'cancelled'
);
create type public.staging_status as enum ('pending', 'approved', 'rejected', 'published', 'skipped');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles & roles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  role public.app_role not null default 'student',
  jee_crl_rank integer check (jee_crl_rank is null or jee_crl_rank between 1 and 2000000),
  category text check (category is null or category in ('OPEN', 'EWS', 'BC', 'SC', 'ST')),
  gender text check (gender is null or gender in ('MALE', 'FEMALE')),
  domicile text check (domicile is null or domicile in ('UP', 'OTHER')),
  favourite_branches text[] not null default '{}' check (cardinality(favourite_branches) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where role <> 'student';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'super_admin'
  );
$$;

-- Create a profile for every new auth user. Role is always 'student'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own profile but never their role or email. Role changes
-- are only possible for super admins (via set_user_role) or from trusted
-- server contexts without a user JWT (SQL editor / service role) – used once to
-- bootstrap the first super admin.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Only a super admin can change user roles' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- -----------------------------------------------------------------------------
-- Data sources (official documents and pages every record points back to)
-- -----------------------------------------------------------------------------
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  source_type text not null default 'uptac_official'
    check (source_type in ('uptac_official', 'college_official', 'placement_report', 'government', 'other')),
  document_type public.document_type not null default 'other',
  url text check (url is null or url ~* '^https?://'),
  academic_year smallint check (academic_year is null or academic_year between 2000 and 2100),
  storage_path text,
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  file_size bigint check (file_size is null or file_size >= 0),
  mime_type text,
  etag text,
  last_modified text,
  discovered_via text not null default 'manual' check (discovered_via in ('manual', 'upload', 'monitor')),
  status text not null default 'active'
    check (status in ('discovered', 'active', 'imported', 'ignored', 'archived')),
  notes text,
  last_checked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A URL can legitimately appear more than once when the document behind it changes.
create unique index data_sources_url_checksum_key
  on public.data_sources (url, coalesce(checksum_sha256, '')) where url is not null;
create unique index data_sources_storage_path_key
  on public.data_sources (storage_path) where storage_path is not null;
create index data_sources_status_idx on public.data_sources (status, created_at desc);
create index data_sources_year_type_idx on public.data_sources (academic_year, document_type);

create trigger data_sources_set_updated_at
  before update on public.data_sources
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Colleges & branches
-- -----------------------------------------------------------------------------
create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9-]{1,20}$'),
  name text not null check (char_length(name) between 2 and 300),
  short_name text check (short_name is null or char_length(short_name) <= 60),
  aliases text[] not null default '{}',
  institute_type public.institute_type not null,
  district text,
  city text,
  address text,
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  website text check (website is null or website ~* '^https?://'),
  email text,
  phone text,
  established_year smallint check (established_year is null or established_year between 1800 and 2100),
  affiliated_university text,
  naac_grade text,
  description text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  source_id uuid references public.data_sources (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index colleges_name_trgm_idx on public.colleges using gin (name extensions.gin_trgm_ops);
create index colleges_district_idx on public.colleges (district);
create index colleges_type_idx on public.colleges (institute_type) where is_active;
create index colleges_featured_idx on public.colleges (is_featured) where is_featured;

create trigger colleges_set_updated_at
  before update on public.colleges
  for each row execute function public.set_updated_at();

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{0,29}$'),
  name text not null unique check (char_length(name) between 2 and 200),
  short_name text check (short_name is null or char_length(short_name) <= 40),
  discipline text,
  aliases text[] not null default '{}',
  degree text not null default 'B.Tech',
  duration_years smallint not null default 4 check (duration_years between 1 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index branches_name_trgm_idx on public.branches using gin (name extensions.gin_trgm_ops);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Import jobs (declared before records so records can reference them)
-- -----------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources (id) on delete restrict,
  file_name text not null,
  storage_path text not null,
  file_checksum text not null check (file_checksum ~ '^[a-f0-9]{64}$'),
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  document_type public.document_type not null,
  academic_year smallint not null check (academic_year between 2000 and 2100),
  round_number smallint check (round_number is null or round_number between 1 and 20),
  rank_type public.rank_type not null default 'CRL',
  default_quota public.seat_quota not null default 'STATE',
  status public.import_status not null default 'uploaded',
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  processor text check (processor is null or processor in ('edge_tabular', 'python_pdf')),
  error_message text,
  detected jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document_type in ('opening_closing_rank', 'seat_matrix'))
);
-- Duplicate-safe uploads: the same file cannot be imported twice unless the
-- earlier job failed or was cancelled.
create unique index import_jobs_active_checksum_key
  on public.import_jobs (file_checksum) where status not in ('failed', 'cancelled');
create index import_jobs_status_idx on public.import_jobs (status, created_at desc);

create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Cutoff records (official opening & closing ranks)
-- -----------------------------------------------------------------------------
create table public.cutoff_records (
  id uuid primary key default gen_random_uuid(),
  academic_year smallint not null check (academic_year between 2000 and 2100),
  round_number smallint not null check (round_number between 1 and 20),
  round_label text,
  college_code text not null references public.colleges (code) on update cascade on delete restrict,
  branch_code text not null references public.branches (code) on update cascade on delete restrict,
  shift text not null default '' check (shift in ('', 'I', 'II', 'III')),
  program_name text,
  category public.reservation_category not null,
  seat_type public.seat_type not null default 'GENERAL',
  category_code text,
  gender public.seat_gender not null default 'NEUTRAL',
  domicile public.domicile_requirement not null,
  quota public.seat_quota not null default 'STATE',
  rank_type public.rank_type not null default 'CRL',
  exam text not null default 'JEE-MAIN',
  opening_rank integer not null check (opening_rank > 0),
  closing_rank integer not null check (closing_rank > 0),
  source_id uuid not null references public.data_sources (id) on delete restrict,
  source_page integer check (source_page is null or source_page > 0),
  source_reference text,
  import_job_id uuid references public.import_jobs (id) on delete set null,
  verification_status public.verification_status not null default 'pending',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cutoff_records_rank_order check (opening_rank <= closing_rank),
  constraint cutoff_records_natural_key unique (
    academic_year, round_number, college_code, branch_code, shift,
    category, seat_type, gender, quota, domicile, rank_type, exam
  )
);
create index cutoff_records_predict_idx on public.cutoff_records
  (academic_year, rank_type, category, seat_type, gender, domicile, quota, closing_rank)
  where verification_status = 'verified';
create index cutoff_records_program_idx on public.cutoff_records (college_code, branch_code, shift, academic_year, round_number);
create index cutoff_records_branch_idx on public.cutoff_records (branch_code, academic_year);
create index cutoff_records_status_idx on public.cutoff_records (verification_status);
create index cutoff_records_source_idx on public.cutoff_records (source_id);
create index cutoff_records_job_idx on public.cutoff_records (import_job_id);

create trigger cutoff_records_set_updated_at
  before update on public.cutoff_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Seat matrix
-- -----------------------------------------------------------------------------
create table public.seat_matrix (
  id uuid primary key default gen_random_uuid(),
  academic_year smallint not null check (academic_year between 2000 and 2100),
  college_code text not null references public.colleges (code) on update cascade on delete restrict,
  branch_code text not null references public.branches (code) on update cascade on delete restrict,
  shift text not null default '' check (shift in ('', 'I', 'II', 'III')),
  program_name text,
  category public.reservation_category not null,
  seat_type public.seat_type not null default 'GENERAL',
  category_code text,
  gender public.seat_gender not null default 'NEUTRAL',
  domicile public.domicile_requirement not null,
  quota public.seat_quota not null default 'STATE',
  seats integer not null check (seats >= 0),
  source_id uuid not null references public.data_sources (id) on delete restrict,
  source_page integer check (source_page is null or source_page > 0),
  source_reference text,
  import_job_id uuid references public.import_jobs (id) on delete set null,
  verification_status public.verification_status not null default 'pending',
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seat_matrix_natural_key unique (
    academic_year, college_code, branch_code, shift, category, seat_type, gender, quota, domicile
  )
);
create index seat_matrix_program_idx on public.seat_matrix (college_code, branch_code, academic_year);
create index seat_matrix_status_idx on public.seat_matrix (verification_status);

create trigger seat_matrix_set_updated_at
  before update on public.seat_matrix
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- College fees & placements (from official college websites / reports only)
-- -----------------------------------------------------------------------------
create table public.college_fees (
  id uuid primary key default gen_random_uuid(),
  college_code text not null references public.colleges (code) on update cascade on delete cascade,
  academic_year smallint not null check (academic_year between 2000 and 2100),
  branch_code text references public.branches (code) on update cascade on delete set null,
  fee_type text not null check (fee_type in (
    'tuition', 'hostel', 'mess', 'admission', 'examination', 'other', 'total_annual', 'total_program'
  )),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  source_id uuid references public.data_sources (id) on delete set null,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint college_fees_requires_source check (source_url is not null or source_id is not null)
);
create unique index college_fees_natural_key
  on public.college_fees (college_code, academic_year, coalesce(branch_code, ''), fee_type);

create trigger college_fees_set_updated_at
  before update on public.college_fees
  for each row execute function public.set_updated_at();

create table public.placement_records (
  id uuid primary key default gen_random_uuid(),
  college_code text not null references public.colleges (code) on update cascade on delete cascade,
  academic_year smallint not null check (academic_year between 2000 and 2100),
  branch_code text references public.branches (code) on update cascade on delete set null,
  students_eligible integer check (students_eligible is null or students_eligible >= 0),
  students_placed integer check (students_placed is null or students_placed >= 0),
  median_package_lpa numeric(8, 2) check (median_package_lpa is null or median_package_lpa >= 0),
  average_package_lpa numeric(8, 2) check (average_package_lpa is null or average_package_lpa >= 0),
  highest_package_lpa numeric(8, 2) check (highest_package_lpa is null or highest_package_lpa >= 0),
  companies_visited integer check (companies_visited is null or companies_visited >= 0),
  notes text,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  source_id uuid references public.data_sources (id) on delete set null,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_records_requires_source check (source_url is not null or source_id is not null),
  constraint placement_records_placed_le_eligible check (
    students_placed is null or students_eligible is null or students_placed <= students_eligible
  )
);
create unique index placement_records_natural_key
  on public.placement_records (college_code, academic_year, coalesce(branch_code, ''));

create trigger placement_records_set_updated_at
  before update on public.placement_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Import staging area (extracted rows awaiting admin verification)
-- -----------------------------------------------------------------------------
create table public.import_staging_records (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs (id) on delete cascade,
  record_type text not null check (record_type in ('cutoff', 'seat_matrix')),
  row_index integer not null,
  source_page integer,
  source_reference text,
  raw jsonb not null default '{}'::jsonb,
  academic_year smallint,
  round_number smallint,
  round_label text,
  college_code text,
  college_name_raw text,
  branch_code text,
  branch_name_raw text,
  -- programme name without shift / fee-waiver suffixes, used for branch matching
  branch_base_raw text,
  shift text not null default '',
  category public.reservation_category,
  seat_type public.seat_type,
  category_code text,
  gender public.seat_gender,
  domicile public.domicile_requirement,
  quota public.seat_quota,
  rank_type public.rank_type,
  exam text,
  opening_rank integer,
  closing_rank integer,
  seats integer,
  issues jsonb not null default '[]'::jsonb,
  has_errors boolean not null default false,
  duplicate_status text not null default 'none'
    check (duplicate_status in ('none', 'in_file', 'existing_same', 'existing_conflict')),
  existing_record_id uuid,
  status public.staging_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_job_id, record_type, row_index)
);
create index import_staging_job_status_idx on public.import_staging_records (import_job_id, status);
create index import_staging_job_errors_idx on public.import_staging_records (import_job_id) where has_errors;

create trigger import_staging_set_updated_at
  before update on public.import_staging_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Monitoring, notifications, error logs
-- -----------------------------------------------------------------------------
create table public.monitored_sources (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null unique check (url ~* '^https?://'),
  kind text not null check (kind in ('html_page', 'notice_list', 'orcr_table', 'seat_matrix_table')),
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_status integer,
  last_content_hash text,
  last_record_count integer,
  last_changed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger monitored_sources_set_updated_at
  before update on public.monitored_sources
  for each row execute function public.set_updated_at();

create table public.monitor_runs (
  id uuid primary key default gen_random_uuid(),
  triggered_by text not null default 'schedule' check (triggered_by in ('schedule', 'manual')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  pages_checked integer not null default 0,
  changed_pages integer not null default 0,
  new_documents integer not null default 0,
  changed_documents integer not null default 0,
  error text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index monitor_runs_started_idx on public.monitor_runs (started_at desc);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_document', 'changed_document', 'changed_page', 'import_ready', 'import_failed', 'system')),
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  read_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index admin_notifications_unread_idx on public.admin_notifications (created_at desc) where read_at is null;

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('import', 'monitor', 'predict', 'processor', 'client', 'database')),
  level text not null default 'error' check (level in ('error', 'warning', 'info')),
  message text not null,
  context jsonb not null default '{}'::jsonb,
  import_job_id uuid references public.import_jobs (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index error_logs_created_idx on public.error_logs (created_at desc);
create index error_logs_unresolved_idx on public.error_logs (created_at desc) where resolved_at is null;

-- -----------------------------------------------------------------------------
-- Student features
-- -----------------------------------------------------------------------------
create table public.saved_colleges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  college_code text not null references public.colleges (code) on update cascade on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, college_code)
);

create table public.prediction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  input jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  data_years smallint[] not null default '{}',
  created_at timestamptz not null default now()
);
create index prediction_logs_user_idx on public.prediction_logs (user_id, created_at desc);
create index prediction_logs_created_idx on public.prediction_logs (created_at desc);

create table public.choice_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  academic_year smallint check (academic_year is null or academic_year between 2000 and 2100),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index choice_lists_user_idx on public.choice_lists (user_id, updated_at desc);

create trigger choice_lists_set_updated_at
  before update on public.choice_lists
  for each row execute function public.set_updated_at();

create table public.choice_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.choice_lists (id) on delete cascade,
  position integer not null check (position >= 0),
  college_code text not null references public.colleges (code) on update cascade on delete cascade,
  branch_code text not null references public.branches (code) on update cascade on delete cascade,
  shift text not null default '' check (shift in ('', 'I', 'II', 'III')),
  notes text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  unique (list_id, college_code, branch_code, shift)
);
create index choice_list_items_list_idx on public.choice_list_items (list_id, position);

-- -----------------------------------------------------------------------------
-- Admin audit log (append-only; written by triggers and security definer RPCs)
-- -----------------------------------------------------------------------------
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_entity_idx on public.admin_audit_logs (entity_type, entity_id);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Bulk operations (publishing an import) write one summarised audit entry instead.
  if coalesce(current_setting('app.bulk_operation', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id') else (to_jsonb(new) ->> 'id') end,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_colleges after insert or update or delete on public.colleges
  for each row execute function public.audit_row_change();
create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function public.audit_row_change();
create trigger audit_cutoff_records after insert or update or delete on public.cutoff_records
  for each row execute function public.audit_row_change();
create trigger audit_seat_matrix after insert or update or delete on public.seat_matrix
  for each row execute function public.audit_row_change();
create trigger audit_college_fees after insert or update or delete on public.college_fees
  for each row execute function public.audit_row_change();
create trigger audit_placement_records after insert or update or delete on public.placement_records
  for each row execute function public.audit_row_change();
create trigger audit_data_sources after insert or update or delete on public.data_sources
  for each row execute function public.audit_row_change();
create trigger audit_monitored_sources after insert or update or delete on public.monitored_sources
  for each row execute function public.audit_row_change();
create trigger audit_profiles_role after update of role on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.audit_row_change();

-- Record who verified a record whenever its verification status becomes 'verified'.
create or replace function public.stamp_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_was_verified boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was_verified := old.verification_status = 'verified';
  end if;
  if new.verification_status = 'verified' then
    if not v_was_verified then
      new.verified_at := coalesce(new.verified_at, now());
      new.verified_by := coalesce(new.verified_by, (select auth.uid()));
    end if;
  else
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$$;

create trigger cutoff_records_stamp_verification
  before insert or update on public.cutoff_records
  for each row execute function public.stamp_verification();
create trigger seat_matrix_stamp_verification
  before insert or update on public.seat_matrix
  for each row execute function public.stamp_verification();

-- -----------------------------------------------------------------------------
-- Convenience view: branches offered by each college (verified data only)
-- -----------------------------------------------------------------------------
create view public.college_branch_offerings
with (security_invoker = true)
as
select
  o.college_code,
  o.branch_code,
  o.shift,
  max(o.academic_year) as latest_year,
  max(o.program_name) as program_name,
  sum(o.seats) filter (where o.from_matrix) as latest_total_seats
from (
  select sm.college_code, sm.branch_code, sm.shift, sm.academic_year, sm.program_name, sm.seats, true as from_matrix
  from public.seat_matrix sm
  where sm.verification_status = 'verified'
    and sm.academic_year = (select max(s2.academic_year) from public.seat_matrix s2
                            where s2.college_code = sm.college_code and s2.verification_status = 'verified')
  union all
  select cr.college_code, cr.branch_code, cr.shift, cr.academic_year, cr.program_name, null::integer, false
  from public.cutoff_records cr
  where cr.verification_status = 'verified'
) o
group by o.college_code, o.branch_code, o.shift;
