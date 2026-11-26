-- =============================================================================
-- UPTAC Predictor – private document storage, reference matching & reference data
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private bucket for official documents and extracted tables (admins only)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'official-documents', 'official-documents', false, 52428800,
  array[
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "official documents: admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'official-documents' and (select public.is_admin()));
create policy "official documents: admin upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'official-documents' and (select public.is_admin()));
create policy "official documents: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'official-documents' and (select public.is_admin()));
create policy "official documents: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'official-documents' and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Name matching key – mirrors normalizeKey() in supabase/functions/_shared/import/text.ts
-- -----------------------------------------------------------------------------
create or replace function public.norm_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '&', ' and ', 'g'),
      '\mengg\M\.?', 'engineering', 'g'),
    '[^a-z0-9]', '', 'g');
$$;

-- Re-resolve staging rows after admins create colleges/branches or add aliases.
create or replace function public.revalidate_staging_references(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colleges integer;
  v_branches integer;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Resolve institute names to college codes
  update public.import_staging_records s
  set college_code = m.code
  from (
    select distinct on (st.id) st.id as staging_id, c.code
    from public.import_staging_records st
    join public.colleges c
      on public.norm_key(c.name) = public.norm_key(st.college_name_raw)
      or exists (select 1 from unnest(c.aliases) a where public.norm_key(a) = public.norm_key(st.college_name_raw))
    where st.import_job_id = p_job_id and st.college_code is null and st.college_name_raw is not null
    order by st.id, c.code
  ) m
  where s.id = m.staging_id;

  -- Resolve programme names to branch codes
  update public.import_staging_records s
  set branch_code = m.code
  from (
    select distinct on (st.id) st.id as staging_id, b.code
    from public.import_staging_records st
    join public.branches b
      on public.norm_key(b.name) = public.norm_key(st.branch_base_raw)
      or exists (select 1 from unnest(b.aliases) a where public.norm_key(a) = public.norm_key(st.branch_base_raw))
    where st.import_job_id = p_job_id and st.branch_code is null and st.branch_base_raw is not null
    order by st.id, b.code
  ) m
  where s.id = m.staging_id;

  -- Clear reference issues that are now resolved
  update public.import_staging_records s
  set issues = coalesce((
        select jsonb_agg(i) from jsonb_array_elements(s.issues) i
        where not (
          (i ->> 'code' = 'unknown_college' and exists (select 1 from public.colleges c where c.code = s.college_code))
          or (i ->> 'code' = 'unknown_branch' and exists (select 1 from public.branches b where b.code = s.branch_code))
        )
      ), '[]'::jsonb)
  where s.import_job_id = p_job_id and s.status <> 'published'
    and s.issues @> '[{"severity":"error"}]';

  update public.import_staging_records s
  set has_errors = exists (select 1 from jsonb_array_elements(s.issues) i where i ->> 'severity' = 'error')
  where s.import_job_id = p_job_id and s.status <> 'published';

  select count(*) filter (where college_code is null or issues @> '[{"code":"unknown_college"}]'),
         count(*) filter (where branch_code is null or issues @> '[{"code":"unknown_branch"}]')
    into v_colleges, v_branches
  from public.import_staging_records
  where import_job_id = p_job_id and status not in ('skipped', 'rejected', 'published');

  perform public.refresh_staging_duplicates(p_job_id);

  return jsonb_build_object('unresolved_college_rows', v_colleges, 'unresolved_branch_rows', v_branches);
end;
$$;

revoke execute on function public.norm_key(text) from public, anon;
grant execute on function public.norm_key(text) to authenticated, service_role;
revoke execute on function public.revalidate_staging_references(uuid) from public, anon;
grant execute on function public.revalidate_staging_references(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Official pages watched by the monitor-uptac Edge Function.
-- uptac.admissions.nic.in (the legacy NIC portal) no longer resolves in DNS as of
-- November 2026; UPTAC counselling moved to uptac.samarth.edu.in.
-- -----------------------------------------------------------------------------
insert into public.monitored_sources (label, url, kind, enabled) values
  ('UPTAC – Home page', 'https://uptac.samarth.edu.in/', 'html_page', true),
  ('UPTAC – Admission notices', 'https://uptac.samarth.edu.in/index.php/notifications/index', 'notice_list', true),
  ('UPTAC – OR-CR details (B.Tech)', 'https://uptac.samarth.edu.in/index.php/cut-off-matrix/index?PrgAdmissionCutOffSeatsSearch%5Bparent_programme_id%5D=5', 'orcr_table', true),
  ('UPTAC – Seat matrix (B.Tech, excl. lateral entry)', 'https://uptac.samarth.edu.in/index.php/seat-matrix/index?SeatMatrixFilter%5Bprogramme%5D=5', 'seat_matrix_table', true),
  ('UPTAC – Legacy NIC portal (offline)', 'https://uptac.admissions.nic.in/', 'html_page', false)
on conflict (url) do nothing;

-- -----------------------------------------------------------------------------
-- Canonical B.Tech branch catalogue. Names and aliases follow the programme
-- names used in the official UPTAC seat matrix (2026-27). This is a naming
-- taxonomy only – it contains no admission data.
-- -----------------------------------------------------------------------------
insert into public.branches (code, name, short_name, discipline, aliases, degree, duration_years) values
  ('CSE', 'Computer Science and Engineering', 'CSE', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-AIML', 'Computer Science and Engineering (Artificial Intelligence and Machine Learning)', 'CSE (AI & ML)', 'Computer Science & IT',
     '{"Computer Science and Engineering (Artificial Intelligence & Machine Learning)","Computer Science and Engineering (AIML)"}', 'B.Tech', 4),
  ('CSE-AI', 'Computer Science and Engineering (Artificial Intelligence)', 'CSE (AI)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-DS', 'Computer Science and Engineering (Data Science)', 'CSE (DS)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-CYS', 'Computer Science and Engineering (Cyber Security)', 'CSE (Cyber Security)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-IOT', 'Computer Science and Engineering (Internet of Things)', 'CSE (IoT)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-AIDS', 'Computer Science and Engineering (Artificial Intelligence and Data Science)', 'CSE (AI & DS)', 'Computer Science & IT',
     '{"Computer Science & Engineering (Artificial Intelligence & data Science)"}', 'B.Tech', 4),
  ('CSE-AIFM', 'Computer Science and Engineering (Artificial Intelligence and Finance Management)', 'CSE (AI & FM)', 'Computer Science & IT',
     '{"Computer Science & Engineering (Artificial Intelligence & Finance Management)"}', 'B.Tech', 4),
  ('CSE-HINDI', 'Computer Science and Engineering (Hindi)', 'CSE (Hindi)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-SF', 'Computer Science and Engineering (Self Finance)', 'CSE (Self Finance)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CSE-CTP', 'Computer Science and Engineering (Collaboration and Twinning Program)', 'CSE (Twinning)', 'Computer Science & IT',
     '{"Computer Science and Engineering (Collaboration & Twining Program)"}', 'B.Tech', 4),
  ('CSE-AI-CTP', 'Computer Science and Engineering (Artificial Intelligence) (Collaboration and Twinning Program)', 'CSE (AI, Twinning)', 'Computer Science & IT',
     '{"Computer Science and Engineering (Artificial Intelligence) (Collaboration & Twining Program)"}', 'B.Tech', 4),
  ('CSE-AIML-CTP', 'Computer Science and Engineering (AIML) (Collaboration and Twinning Program)', 'CSE (AIML, Twinning)', 'Computer Science & IT',
     '{"Computer Science And Engineering(AIML) (Collaboration & Twining Program)"}', 'B.Tech', 4),
  ('CSE-IMT', 'Computer Science and Engineering (Integrated M.Tech)', 'CSE (Int. M.Tech)', 'Computer Science & IT',
     '{"Computer Science and Engineering(Integrated M.Tech)","M.Tech (Integrated) Computer Science and Engineering"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('CS', 'Computer Science', 'CS', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CS-DS', 'Computer Science (Data Science)', 'CS (DS)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CS-HINDI', 'Computer Science (Hindi)', 'CS (Hindi)', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('CST', 'Computer Science and Technology', 'CST', 'Computer Science & IT', '{"Computer Science & Technology"}', 'B.Tech', 4),
  ('CSIT', 'Computer Science and Information Technology', 'CSIT', 'Computer Science & IT', '{"Computer Science Information Technology"}', 'B.Tech', 4),
  ('CSBS', 'Computer Science and Business Systems', 'CSBS', 'Computer Science & IT', '{"Computer Science and Business System"}', 'B.Tech', 4),
  ('CSD', 'Computer Science and Design', 'CSD', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('IT', 'Information Technology', 'IT', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('IT-CTP', 'Information Technology (Collaboration and Twinning Program)', 'IT (Twinning)', 'Computer Science & IT',
     '{"Information Technology (Collaboration & Twining Program)"}', 'B.Tech', 4),
  ('IT-IMT', 'Information Technology (Integrated M.Tech)', 'IT (Int. M.Tech)', 'Computer Science & IT',
     '{"Information Technology(Integrated M.Tech)"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('AI', 'Artificial Intelligence', 'AI', 'AI & Data Science', '{}', 'B.Tech', 4),
  ('AIDS', 'Artificial Intelligence and Data Science', 'AI & DS', 'AI & Data Science', '{"Artificial Intelligence (AI) And Data Science"}', 'B.Tech', 4),
  ('AIML', 'Artificial Intelligence and Machine Learning', 'AI & ML', 'AI & Data Science', '{}', 'B.Tech', 4),
  ('DS', 'Data Science', 'DS', 'AI & Data Science', '{}', 'B.Tech', 4),
  ('CYS', 'Cyber Security', 'Cyber Security', 'Computer Science & IT', '{}', 'B.Tech', 4),
  ('MNC', 'Mathematics and Computing', 'M&C', 'Mathematics & Computing', '{}', 'B.Tech', 4),
  ('ECE', 'Electronics and Communication Engineering', 'ECE', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('ECE-ACT', 'Electronics and Communication (Advanced Communication Technology)', 'ECE (ACT)', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('ECE-VLSI', 'Electronics and Communication Engineering (VLSI Design and Technology)', 'ECE (VLSI)', 'Electronics & Communication',
     '{"Electronics and Communication Engineering (VLSI Design and Techonology)"}', 'B.Tech', 4),
  ('ECE-IMT', 'Electronics and Communication Engineering (Integrated M.Tech)', 'ECE (Int. M.Tech)', 'Electronics & Communication',
     '{"Electronics and Communication Engineering(Integrated M.Tech)"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('EL', 'Electronics Engineering', 'Electronics', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('EL-VLSI', 'Electronics Engineering (VLSI Design and Technology)', 'Electronics (VLSI)', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('ETE', 'Electronics and Telecommunication Engineering', 'E&TC', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('ECM', 'Electronics and Computer Engineering', 'Electronics & Computer', 'Electronics & Communication', '{"Electronic And Computer Engineering"}', 'B.Tech', 4),
  ('EIE', 'Electronics and Instrumentation Engineering', 'EIE', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('ICE', 'Instrumentation and Control Engineering', 'ICE', 'Electronics & Communication', '{}', 'B.Tech', 4),
  ('EE', 'Electrical Engineering', 'EE', 'Electrical', '{}', 'B.Tech', 4),
  ('EE-IMT', 'Electrical Engineering (Integrated M.Tech)', 'EE (Int. M.Tech)', 'Electrical', '{"Electrical Engineering(Integrated M.Tech)"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('EEE', 'Electrical and Electronics Engineering', 'EEE', 'Electrical', '{}', 'B.Tech', 4),
  ('ELCE', 'Electrical and Computer Engineering', 'Electrical & Computer', 'Electrical', '{"Electrical & Computer Engg."}', 'B.Tech', 4),
  ('ME', 'Mechanical Engineering', 'ME', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('ME-IMT', 'Mechanical Engineering (Integrated M.Tech)', 'ME (Int. M.Tech)', 'Mechanical & Automation', '{"Mechanical Engineering(Integrated M.Tech)"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('MME-AM', 'Mechanical and Mechatronics Engineering (Additive Manufacturing)', 'Mech & Mechatronics (AM)', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('AMIA', 'Advanced Mechatronics and Industrial Automation', 'Adv. Mechatronics', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('RA', 'Robotics and Automation', 'Robotics & Automation', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('AR', 'Automation and Robotics', 'Automation & Robotics', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('AUE', 'Automobile Engineering', 'Automobile', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('AE', 'Aeronautical Engineering', 'Aeronautical', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('IPE', 'Industrial Production Engineering', 'Industrial Production', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('PE', 'Production Engineering', 'Production', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('MFT', 'Manufacturing Technology', 'Manufacturing', 'Mechanical & Automation', '{}', 'B.Tech', 4),
  ('CE', 'Civil Engineering', 'Civil', 'Civil & Environmental', '{}', 'B.Tech', 4),
  ('CE-IMT', 'Civil Engineering (Integrated M.Tech)', 'Civil (Int. M.Tech)', 'Civil & Environmental', '{"Civil Engineering(Integrated M.Tech )"}', 'B.Tech + M.Tech (Integrated)', 5),
  ('ENV', 'Environmental Engineering', 'Environmental', 'Civil & Environmental', '{}', 'B.Tech', 4),
  ('MIN', 'Mining Engineering', 'Mining', 'Civil & Environmental', '{}', 'B.Tech', 4),
  ('CHE', 'Chemical Engineering', 'Chemical', 'Chemical & Materials', '{}', 'B.Tech', 4),
  ('PLE', 'Plastic Engineering', 'Plastic', 'Chemical & Materials', '{}', 'B.Tech', 4),
  ('BT', 'Biotechnology', 'Biotech', 'Bio & Life Sciences', '{}', 'B.Tech', 4),
  ('BINF', 'Bioinformatics', 'Bioinformatics', 'Bio & Life Sciences', '{}', 'B.Tech', 4),
  ('BME', 'Biomedical Engineering', 'Biomedical', 'Bio & Life Sciences', '{"Bio Medical Engineering"}', 'B.Tech', 4),
  ('AG', 'Agricultural Engineering', 'Agricultural', 'Agriculture & Food', '{}', 'B.Tech', 4),
  ('FT', 'Food Technology', 'Food Tech', 'Agriculture & Food', '{}', 'B.Tech', 4),
  ('FET', 'Food Engineering and Technology', 'Food Engg & Tech', 'Agriculture & Food', '{}', 'B.Tech', 4),
  ('TT', 'Textile Technology', 'Textile Tech', 'Textile', '{}', 'B.Tech', 4),
  ('TC', 'Textile Chemistry', 'Textile Chemistry', 'Textile', '{}', 'B.Tech', 4),
  ('TE', 'Textile Engineering', 'Textile Engg', 'Textile', '{}', 'B.Tech', 4),
  ('HTT', 'Handloom and Textile Technology', 'Handloom & Textile', 'Textile', '{}', 'B.Tech', 4),
  ('MMFT', 'Man Made Fibre Technology', 'Man Made Fibre', 'Textile', '{}', 'B.Tech', 4)
on conflict (code) do nothing;
