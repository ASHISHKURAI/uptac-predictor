-- =============================================================================
-- UPTAC Predictor – RPC functions
-- =============================================================================

-- True when the request is made with the service role key (Edge Functions).
create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

-- -----------------------------------------------------------------------------
-- Public transparency helpers
-- -----------------------------------------------------------------------------

-- Public metadata of the documents behind published records (no storage paths,
-- checksums, internal notes or uploader identities).
create or replace function public.get_public_sources(p_ids uuid[] default null)
returns table (
  id uuid,
  title text,
  source_type text,
  document_type public.document_type,
  url text,
  academic_year smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.source_type, s.document_type, s.url, s.academic_year, s.created_at
  from public.data_sources s
  where s.status in ('active', 'imported')
    and (p_ids is null or s.id = any (p_ids))
  order by s.academic_year desc nulls last, s.created_at desc
  limit 500;
$$;

create or replace function public.get_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'colleges', (select count(*) from public.colleges where is_active),
    'colleges_with_cutoffs', (select count(distinct college_code) from public.cutoff_records where verification_status = 'verified'),
    'branches_with_cutoffs', (select count(distinct branch_code) from public.cutoff_records where verification_status = 'verified'),
    'verified_cutoff_records', (select count(*) from public.cutoff_records where verification_status = 'verified'),
    'verified_seat_matrix_rows', (select count(*) from public.seat_matrix where verification_status = 'verified'),
    'official_sources', (select count(*) from public.data_sources where status in ('active', 'imported') and source_type = 'uptac_official'),
    'years', coalesce((
      select jsonb_agg(t.academic_year order by t.academic_year desc)
      from (select distinct academic_year from public.cutoff_records where verification_status = 'verified') t
    ), '[]'::jsonb),
    'last_verified_at', (select max(verified_at) from public.cutoff_records where verification_status = 'verified')
  );
$$;

-- Years and rounds that have verified cutoff data.
create or replace function public.get_cutoff_years()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('year', y.academic_year, 'rounds', y.rounds) order by y.academic_year desc), '[]'::jsonb)
  from (
    select r.academic_year,
           jsonb_agg(jsonb_build_object('round_number', r.round_number, 'round_label', r.round_label) order by r.round_number) as rounds
    from (
      select academic_year, round_number, max(round_label) as round_label
      from public.cutoff_records
      where verification_status = 'verified'
      group by academic_year, round_number
    ) r
    group by r.academic_year
  ) y;
$$;

-- Final-round OPEN / general / gender-neutral CRL closing ranks summarised by branch.
create or replace function public.get_cutoff_overview(p_year smallint default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with yr as (
    select coalesce(p_year, (select max(academic_year) from public.cutoff_records where verification_status = 'verified')) as y
  ),
  base as (
    select cr.*
    from public.cutoff_records cr, yr
    where cr.verification_status = 'verified'
      and cr.academic_year = yr.y
      and cr.category = 'OPEN' and cr.seat_type = 'GENERAL' and cr.gender = 'NEUTRAL' and cr.rank_type = 'CRL'
  ),
  -- Last REGULAR round (special / spot / sliding rounds fill leftover seats only).
  final_round as (
    select college_code, branch_code, shift, quota,
           coalesce(
             max(round_number) filter (where coalesce(round_label, '') !~* '(special|spot|sliding|vacan|mop.?up|stray)'),
             max(round_number)
           ) as r
    from base group by college_code, branch_code, shift, quota
  ),
  finals as (
    select b.* from base b
    join final_round f
      on f.college_code = b.college_code and f.branch_code = b.branch_code
     and f.shift = b.shift and f.quota = b.quota and f.r = b.round_number
  ),
  per_branch as (
    select branch_code,
           count(*) as programs,
           min(closing_rank) as best_closing,
           round(percentile_cont(0.5) within group (order by closing_rank))::integer as median_closing,
           max(closing_rank) as max_closing
    from finals group by branch_code
  )
  select jsonb_build_object(
    'year', (select y from yr),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branch_code', p.branch_code, 'branch_name', b.name, 'short_name', b.short_name,
        'programs', p.programs, 'best_closing', p.best_closing,
        'median_closing', p.median_closing, 'max_closing', p.max_closing
      ) order by p.programs desc, p.best_closing)
      from (select * from per_branch order by programs desc, best_closing limit 10) p
      join public.branches b on b.code = p.branch_code
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Prediction data access (used by the `predict` Edge Function). Returns the
-- verified historical records of every seat group that the student's profile
-- is eligible for and whose closing rank reached at least the "near" band in
-- some selected year. Classification itself happens in the prediction engine.
-- -----------------------------------------------------------------------------
create or replace function public.prediction_candidates(
  p_years smallint[],
  p_categories public.reservation_category[],
  p_seat_types public.seat_type[],
  p_genders public.seat_gender[],
  p_domiciles public.domicile_requirement[],
  p_quotas public.seat_quota[],
  p_institute_types public.institute_type[],
  p_crl_rank integer,
  p_category_rank integer default null,
  p_branch_codes text[] default null,
  p_near_margin numeric default 0.10,
  p_max_groups integer default 400
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with eligible as (
    select cr.id, cr.academic_year, cr.round_number, cr.round_label, cr.college_code, cr.branch_code,
           cr.shift, cr.program_name, cr.category, cr.seat_type, cr.category_code, cr.gender,
           cr.domicile, cr.quota, cr.rank_type, cr.exam, cr.opening_rank, cr.closing_rank,
           cr.source_id, cr.source_page
    from public.cutoff_records cr
    join public.colleges c on c.code = cr.college_code and c.is_active
    where cr.verification_status = 'verified'
      and cr.academic_year = any (p_years)
      and cr.category = any (p_categories)
      and cr.seat_type = any (p_seat_types)
      and cr.gender = any (p_genders)
      and cr.domicile = any (p_domiciles)
      and cr.quota = any (p_quotas)
      and c.institute_type = any (p_institute_types)
      and cr.exam = 'JEE-MAIN'
      and (cr.rank_type = 'CRL' or (cr.rank_type = 'CATEGORY' and p_category_rank is not null))
      and (p_branch_codes is null or cardinality(p_branch_codes) = 0 or cr.branch_code = any (p_branch_codes))
  ),
  grouped as (
    select e.college_code, e.branch_code, e.shift, e.category, e.seat_type, e.gender,
           e.quota, e.domicile, e.rank_type, e.exam,
           min(e.closing_rank) filter (
             where e.closing_rank >= floor(
               (case when e.rank_type = 'CRL' then p_crl_rank else p_category_rank end)::numeric
               / (1 + greatest(p_near_margin, 0))
             )
           ) as sort_key
    from eligible e
    group by e.college_code, e.branch_code, e.shift, e.category, e.seat_type, e.gender,
             e.quota, e.domicile, e.rank_type, e.exam
  ),
  qualifying as (
    select * from grouped where sort_key is not null
  ),
  top_groups as (
    select * from qualifying
    order by sort_key, college_code, branch_code, shift
    limit greatest(1, least(coalesce(p_max_groups, 400), 1000))
  ),
  picked as (
    select e.* from eligible e
    join top_groups g using (college_code, branch_code, shift, category, seat_type, gender, quota, domicile, rank_type, exam)
  )
  select jsonb_build_object(
    'total_groups', (select count(*) from qualifying),
    'returned_groups', (select count(*) from top_groups),
    'branches_with_records', coalesce((select jsonb_agg(distinct e.branch_code) from eligible e), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.college_code, p.branch_code, p.academic_year, p.round_number)
      from picked p
    ), '[]'::jsonb),
    'colleges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', c.code, 'name', c.name, 'short_name', c.short_name, 'institute_type', c.institute_type,
        'district', c.district, 'city', c.city, 'website', c.website))
      from public.colleges c where c.code in (select distinct college_code from top_groups)
    ), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'short_name', b.short_name))
      from public.branches b where b.code in (select distinct branch_code from top_groups)
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.get_public_sources(array(select distinct source_id from picked)) s
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Import review helpers
-- -----------------------------------------------------------------------------

-- Recompute duplicate flags for a job's staging rows:
--   in_file           – another row of the same job has the same natural key
--   existing_same     – a published record with the same key and identical values exists
--   existing_conflict – a published record with the same key but different values exists
-- Pending rows identical to existing verified records are skipped automatically.
create or replace function public.refresh_staging_duplicates(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.import_staging_records s
  set duplicate_status = 'none', existing_record_id = null
  where s.import_job_id = p_job_id;

  -- Existing published cutoff records
  update public.import_staging_records s
  set existing_record_id = cr.id,
      duplicate_status = case
        when cr.opening_rank = s.opening_rank and cr.closing_rank = s.closing_rank then 'existing_same'
        else 'existing_conflict' end
  from public.cutoff_records cr
  where s.import_job_id = p_job_id and s.record_type = 'cutoff'
    and cr.academic_year = s.academic_year and cr.round_number = s.round_number
    and cr.college_code = s.college_code and cr.branch_code = s.branch_code and cr.shift = s.shift
    and cr.category = s.category and cr.seat_type = s.seat_type and cr.gender = s.gender
    and cr.quota = s.quota and cr.domicile = s.domicile and cr.rank_type = s.rank_type
    and cr.exam = s.exam;

  -- Existing published seat matrix rows
  update public.import_staging_records s
  set existing_record_id = sm.id,
      duplicate_status = case when sm.seats = s.seats then 'existing_same' else 'existing_conflict' end
  from public.seat_matrix sm
  where s.import_job_id = p_job_id and s.record_type = 'seat_matrix'
    and sm.academic_year = s.academic_year and sm.college_code = s.college_code
    and sm.branch_code = s.branch_code and sm.shift = s.shift and sm.category = s.category
    and sm.seat_type = s.seat_type and sm.gender = s.gender and sm.quota = s.quota
    and sm.domicile = s.domicile;

  -- Duplicates inside the same file (takes precedence for review purposes)
  update public.import_staging_records s
  set duplicate_status = 'in_file'
  where s.import_job_id = p_job_id
    and s.status in ('pending', 'approved')
    and s.college_code is not null and s.branch_code is not null
    and exists (
      select 1 from public.import_staging_records o
      where o.import_job_id = s.import_job_id and o.id <> s.id and o.record_type = s.record_type
        and o.status in ('pending', 'approved')
        and o.academic_year is not distinct from s.academic_year
        and o.round_number is not distinct from s.round_number
        and o.college_code = s.college_code and o.branch_code = s.branch_code and o.shift = s.shift
        and o.category is not distinct from s.category and o.seat_type is not distinct from s.seat_type
        and o.gender is not distinct from s.gender and o.quota is not distinct from s.quota
        and o.domicile is not distinct from s.domicile
        and o.rank_type is not distinct from s.rank_type and o.exam is not distinct from s.exam
    );

  update public.import_staging_records s
  set status = 'skipped'
  where s.import_job_id = p_job_id and s.status = 'pending' and s.duplicate_status = 'existing_same';

  select jsonb_build_object(
    'in_file', count(*) filter (where duplicate_status = 'in_file'),
    'existing_same', count(*) filter (where duplicate_status = 'existing_same'),
    'existing_conflict', count(*) filter (where duplicate_status = 'existing_conflict')
  ) into v_result
  from public.import_staging_records where import_job_id = p_job_id;

  update public.import_jobs
  set stats = stats || jsonb_build_object('duplicates', v_result)
  where id = p_job_id;

  return v_result;
end;
$$;

-- Map an unresolved institute name from an import to an existing college. The
-- raw name is remembered as an alias so future imports resolve automatically.
create or replace function public.apply_college_mapping(p_job_id uuid, p_raw_name text, p_college_code text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.colleges where code = p_college_code) then
    raise exception 'Unknown college code %', p_college_code;
  end if;

  update public.import_staging_records s
  set college_code = p_college_code,
      issues = coalesce((
        select jsonb_agg(i) from jsonb_array_elements(s.issues) i where i ->> 'code' <> 'unknown_college'
      ), '[]'::jsonb),
      has_errors = exists (
        select 1 from jsonb_array_elements(s.issues) i
        where i ->> 'code' <> 'unknown_college' and i ->> 'severity' = 'error'
      )
  where s.import_job_id = p_job_id and s.college_name_raw = p_raw_name and s.status <> 'published';
  get diagnostics v_count = row_count;

  update public.colleges
  set aliases = array_append(aliases, p_raw_name)
  where code = p_college_code and not (p_raw_name = any (aliases)) and upper(name) <> upper(p_raw_name);

  perform public.refresh_staging_duplicates(p_job_id);
  return v_count;
end;
$$;

create or replace function public.apply_branch_mapping(p_job_id uuid, p_raw_name text, p_branch_code text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches where code = p_branch_code) then
    raise exception 'Unknown branch code %', p_branch_code;
  end if;

  update public.import_staging_records s
  set branch_code = p_branch_code,
      issues = coalesce((
        select jsonb_agg(i) from jsonb_array_elements(s.issues) i where i ->> 'code' <> 'unknown_branch'
      ), '[]'::jsonb),
      has_errors = exists (
        select 1 from jsonb_array_elements(s.issues) i
        where i ->> 'code' <> 'unknown_branch' and i ->> 'severity' = 'error'
      )
  where s.import_job_id = p_job_id and coalesce(s.branch_base_raw, s.branch_name_raw) = p_raw_name and s.status <> 'published';
  get diagnostics v_count = row_count;

  update public.branches
  set aliases = array_append(aliases, p_raw_name)
  where code = p_branch_code and not (p_raw_name = any (aliases)) and upper(name) <> upper(p_raw_name);

  perform public.refresh_staging_duplicates(p_job_id);
  return v_count;
end;
$$;

-- Publish the APPROVED staging rows of an import job as verified official data.
-- Nothing is ever published automatically: an admin must approve rows first.
create or replace function public.publish_import_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_uid uuid := (select auth.uid());
  v_cutoffs integer := 0;
  v_seats integer := 0;
  v_bad integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_job from public.import_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Import job % not found', p_job_id;
  end if;
  if v_job.status <> 'in_review' then
    raise exception 'Only jobs in review can be published (current status: %)', v_job.status;
  end if;

  select count(*) into v_bad
  from public.import_staging_records s
  where s.import_job_id = p_job_id and s.status = 'approved'
    and (
      s.has_errors
      or s.college_code is null or s.branch_code is null or s.academic_year is null
      or s.category is null or s.seat_type is null or s.gender is null
      or s.domicile is null or s.quota is null
      or (s.record_type = 'cutoff' and (
            s.round_number is null or s.rank_type is null or s.exam is null
            or s.opening_rank is null or s.closing_rank is null
            or s.opening_rank <= 0 or s.opening_rank > s.closing_rank))
      or (s.record_type = 'seat_matrix' and (s.seats is null or s.seats < 0))
    );
  if v_bad > 0 then
    raise exception '% approved row(s) are incomplete or still have errors. Fix or reject them first.', v_bad;
  end if;

  select count(*) into v_bad
  from (
    select 1 from public.import_staging_records s
    where s.import_job_id = p_job_id and s.status = 'approved'
    group by s.record_type, s.academic_year, s.round_number, s.college_code, s.branch_code, s.shift,
             s.category, s.seat_type, s.gender, s.quota, s.domicile, s.rank_type, s.exam
    having count(*) > 1
  ) d;
  if v_bad > 0 then
    raise exception '% duplicate key group(s) among approved rows. Keep only one row per seat group.', v_bad;
  end if;

  if not exists (select 1 from public.import_staging_records where import_job_id = p_job_id and status = 'approved') then
    raise exception 'No approved rows to publish';
  end if;

  perform set_config('app.bulk_operation', 'on', true);

  with upserted as (
    insert into public.cutoff_records (
      academic_year, round_number, round_label, college_code, branch_code, shift, program_name,
      category, seat_type, category_code, gender, domicile, quota, rank_type, exam,
      opening_rank, closing_rank, source_id, source_page, source_reference, import_job_id,
      verification_status, verified_by, verified_at
    )
    select s.academic_year, s.round_number, s.round_label, s.college_code, s.branch_code, s.shift, s.branch_name_raw,
           s.category, s.seat_type, s.category_code, s.gender, s.domicile, s.quota, s.rank_type, s.exam,
           s.opening_rank, s.closing_rank, v_job.data_source_id, s.source_page, s.source_reference, p_job_id,
           'verified', v_uid, now()
    from public.import_staging_records s
    where s.import_job_id = p_job_id and s.status = 'approved' and s.record_type = 'cutoff'
    on conflict on constraint cutoff_records_natural_key do update
      set opening_rank = excluded.opening_rank,
          closing_rank = excluded.closing_rank,
          round_label = excluded.round_label,
          program_name = excluded.program_name,
          category_code = excluded.category_code,
          source_id = excluded.source_id,
          source_page = excluded.source_page,
          source_reference = excluded.source_reference,
          import_job_id = excluded.import_job_id,
          verification_status = 'verified',
          verified_by = excluded.verified_by,
          verified_at = excluded.verified_at
    returning 1
  )
  select count(*) into v_cutoffs from upserted;

  with upserted as (
    insert into public.seat_matrix (
      academic_year, college_code, branch_code, shift, program_name, category, seat_type, category_code,
      gender, domicile, quota, seats, source_id, source_page, source_reference, import_job_id,
      verification_status, verified_by, verified_at
    )
    select s.academic_year, s.college_code, s.branch_code, s.shift, s.branch_name_raw, s.category, s.seat_type,
           s.category_code, s.gender, s.domicile, s.quota, s.seats, v_job.data_source_id, s.source_page,
           s.source_reference, p_job_id, 'verified', v_uid, now()
    from public.import_staging_records s
    where s.import_job_id = p_job_id and s.status = 'approved' and s.record_type = 'seat_matrix'
    on conflict on constraint seat_matrix_natural_key do update
      set seats = excluded.seats,
          program_name = excluded.program_name,
          category_code = excluded.category_code,
          source_id = excluded.source_id,
          source_page = excluded.source_page,
          source_reference = excluded.source_reference,
          import_job_id = excluded.import_job_id,
          verification_status = 'verified',
          verified_by = excluded.verified_by,
          verified_at = excluded.verified_at
    returning 1
  )
  select count(*) into v_seats from upserted;

  update public.import_staging_records
  set status = 'published', reviewed_by = coalesce(reviewed_by, v_uid), reviewed_at = coalesce(reviewed_at, now())
  where import_job_id = p_job_id and status = 'approved';

  update public.import_jobs
  set status = 'published', published_at = now(), published_by = v_uid, finished_at = coalesce(finished_at, now()),
      stats = stats || jsonb_build_object('published_cutoffs', v_cutoffs, 'published_seat_rows', v_seats)
  where id = p_job_id;

  update public.data_sources set status = 'imported' where id = v_job.data_source_id and status <> 'ignored';

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (v_uid, 'PUBLISH', 'import_jobs', p_job_id::text,
          jsonb_build_object('cutoff_records', v_cutoffs, 'seat_matrix_rows', v_seats,
                             'academic_year', v_job.academic_year, 'file_name', v_job.file_name));

  return jsonb_build_object('cutoff_records', v_cutoffs, 'seat_matrix_rows', v_seats);
end;
$$;

-- -----------------------------------------------------------------------------
-- Student helpers
-- -----------------------------------------------------------------------------
create or replace function public.reorder_choice_list(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.choice_lists where id = p_list_id and user_id = (select auth.uid())) then
    raise exception 'Choice list not found' using errcode = 'P0002';
  end if;
  update public.choice_list_items i
  set position = x.ord - 1
  from unnest(p_item_ids) with ordinality as x(item_id, ord)
  where i.id = x.item_id and i.list_id = p_list_id;
  update public.choice_lists set updated_at = now() where id = p_list_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.app_role;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change roles' using errcode = '42501';
  end if;
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;
  if v_old = 'super_admin' and p_role <> 'super_admin'
     and (select count(*) from public.profiles where role = 'super_admin') <= 1 then
    raise exception 'Cannot remove the last super admin';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'colleges', (select count(*) from public.colleges),
    'branches', (select count(*) from public.branches),
    'cutoffs_verified', (select count(*) from public.cutoff_records where verification_status = 'verified'),
    'cutoffs_pending', (select count(*) from public.cutoff_records where verification_status = 'pending'),
    'seat_matrix_verified', (select count(*) from public.seat_matrix where verification_status = 'verified'),
    'fees', (select count(*) from public.college_fees),
    'placements', (select count(*) from public.placement_records),
    'data_sources', (select count(*) from public.data_sources),
    'sources_discovered', (select count(*) from public.data_sources where status = 'discovered'),
    'imports_by_status', coalesce((
      select jsonb_object_agg(status, n) from (select status, count(*) n from public.import_jobs group by status) t
    ), '{}'::jsonb),
    'staging_pending', (select count(*) from public.import_staging_records where status = 'pending'),
    'users', (select count(*) from public.profiles),
    'admins', (select count(*) from public.profiles where role <> 'student'),
    'predictions_30d', (select count(*) from public.prediction_logs where created_at > now() - interval '30 days'),
    'unread_notifications', (select count(*) from public.admin_notifications where read_at is null),
    'open_errors', (select count(*) from public.error_logs where resolved_at is null and level = 'error'),
    'last_monitor_run', (select to_jsonb(m) from (select status, started_at, finished_at, new_documents, changed_pages
                         from public.monitor_runs order by started_at desc limit 1) m),
    'records_by_year', coalesce((
      select jsonb_agg(jsonb_build_object('year', y, 'cutoffs', c, 'seat_rows', s) order by y)
      from (
        select y, sum(c)::integer as c, sum(s)::integer as s from (
          select academic_year y, count(*) c, 0 s from public.cutoff_records where verification_status = 'verified' group by academic_year
          union all
          select academic_year, 0, count(*) from public.seat_matrix where verification_status = 'verified' group by academic_year
        ) u group by y
      ) t
    ), '[]'::jsonb),
    'predictions_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', n) order by d)
      from (
        select g.d, count(p.id) n
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') g(d)
        left join public.prediction_logs p on date_trunc('day', p.created_at) = g.d
        group by g.d
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.get_public_sources(uuid[]),
  public.get_public_stats(),
  public.get_cutoff_years(),
  public.get_cutoff_overview(smallint),
  public.prediction_candidates(smallint[], public.reservation_category[], public.seat_type[], public.seat_gender[],
                               public.domicile_requirement[], public.seat_quota[], public.institute_type[],
                               integer, integer, text[], numeric, integer),
  public.is_admin(),
  public.is_super_admin(),
  public.is_service_role()
to anon, authenticated;
grant execute on function
  public.reorder_choice_list(uuid, uuid[]),
  public.set_user_role(uuid, public.app_role),
  public.admin_dashboard_stats(),
  public.refresh_staging_duplicates(uuid),
  public.apply_college_mapping(uuid, text, text),
  public.apply_branch_mapping(uuid, text, text),
  public.publish_import_job(uuid)
to authenticated;
grant execute on all functions in schema public to service_role;
