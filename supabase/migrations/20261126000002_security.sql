-- =============================================================================
-- UPTAC Predictor – Row Level Security & least-privilege grants
-- -----------------------------------------------------------------------------
--  * Anonymous visitors can read only VERIFIED public data.
--  * Students can read/write only their own rows.
--  * Only admins (profiles.role in admin/super_admin) can change official data.
--  * The service role (Edge Functions only, never the browser) bypasses RLS.
-- =============================================================================

-- Enable RLS everywhere ---------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.data_sources           enable row level security;
alter table public.colleges               enable row level security;
alter table public.branches               enable row level security;
alter table public.import_jobs            enable row level security;
alter table public.cutoff_records         enable row level security;
alter table public.seat_matrix            enable row level security;
alter table public.college_fees           enable row level security;
alter table public.placement_records      enable row level security;
alter table public.import_staging_records enable row level security;
alter table public.monitored_sources      enable row level security;
alter table public.monitor_runs           enable row level security;
alter table public.admin_notifications    enable row level security;
alter table public.error_logs             enable row level security;
alter table public.saved_colleges         enable row level security;
alter table public.prediction_logs        enable row level security;
alter table public.choice_lists           enable row level security;
alter table public.choice_list_items      enable row level security;
alter table public.admin_audit_logs       enable row level security;

-- Grants (RLS still applies on top of these) -------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.colleges, public.branches, public.cutoff_records, public.seat_matrix,
  public.college_fees, public.placement_records, public.college_branch_offerings
to anon, authenticated;

grant insert, update, delete on
  public.colleges, public.branches, public.cutoff_records, public.seat_matrix,
  public.college_fees, public.placement_records
to authenticated;

grant select, insert, update, delete on
  public.data_sources, public.import_jobs, public.import_staging_records,
  public.monitored_sources, public.admin_notifications, public.error_logs,
  public.saved_colleges, public.choice_lists, public.choice_list_items
to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.prediction_logs, public.monitor_runs, public.admin_audit_logs to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Profiles ---------------------------------------------------------------------
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student');

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Public catalogue: colleges & branches --------------------------------------
create policy "colleges: public read active" on public.colleges
  for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "colleges: admin insert" on public.colleges
  for insert to authenticated with check ((select public.is_admin()));
create policy "colleges: admin update" on public.colleges
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "colleges: admin delete" on public.colleges
  for delete to authenticated using ((select public.is_admin()));

create policy "branches: public read active" on public.branches
  for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "branches: admin insert" on public.branches
  for insert to authenticated with check ((select public.is_admin()));
create policy "branches: admin update" on public.branches
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "branches: admin delete" on public.branches
  for delete to authenticated using ((select public.is_admin()));

-- Verified official data -----------------------------------------------------
create policy "cutoffs: public read verified" on public.cutoff_records
  for select to anon, authenticated
  using (verification_status = 'verified' or (select public.is_admin()));
create policy "cutoffs: admin insert" on public.cutoff_records
  for insert to authenticated with check ((select public.is_admin()));
create policy "cutoffs: admin update" on public.cutoff_records
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "cutoffs: admin delete" on public.cutoff_records
  for delete to authenticated using ((select public.is_admin()));

create policy "seat matrix: public read verified" on public.seat_matrix
  for select to anon, authenticated
  using (verification_status = 'verified' or (select public.is_admin()));
create policy "seat matrix: admin insert" on public.seat_matrix
  for insert to authenticated with check ((select public.is_admin()));
create policy "seat matrix: admin update" on public.seat_matrix
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "seat matrix: admin delete" on public.seat_matrix
  for delete to authenticated using ((select public.is_admin()));

create policy "fees: public read verified" on public.college_fees
  for select to anon, authenticated
  using (verification_status = 'verified' or (select public.is_admin()));
create policy "fees: admin insert" on public.college_fees
  for insert to authenticated with check ((select public.is_admin()));
create policy "fees: admin update" on public.college_fees
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "fees: admin delete" on public.college_fees
  for delete to authenticated using ((select public.is_admin()));

create policy "placements: public read verified" on public.placement_records
  for select to anon, authenticated
  using (verification_status = 'verified' or (select public.is_admin()));
create policy "placements: admin insert" on public.placement_records
  for insert to authenticated with check ((select public.is_admin()));
create policy "placements: admin update" on public.placement_records
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "placements: admin delete" on public.placement_records
  for delete to authenticated using ((select public.is_admin()));

-- Admin-only operational tables ----------------------------------------------
-- (public visitors see source titles/URLs through get_public_sources())
create policy "data sources: admin all" on public.data_sources
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "import jobs: admin all" on public.import_jobs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "staging: admin all" on public.import_staging_records
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "monitored sources: admin all" on public.monitored_sources
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "notifications: admin all" on public.admin_notifications
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "error logs: admin all" on public.error_logs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "monitor runs: admin read" on public.monitor_runs
  for select to authenticated using ((select public.is_admin()));
create policy "audit logs: admin read" on public.admin_audit_logs
  for select to authenticated using ((select public.is_admin()));

-- Student-owned data ---------------------------------------------------------
create policy "saved colleges: own" on public.saved_colleges
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "choice lists: own" on public.choice_lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "choice list items: own list" on public.choice_list_items
  for all to authenticated
  using (exists (select 1 from public.choice_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.choice_lists l where l.id = list_id and l.user_id = (select auth.uid())));

-- Prediction logs are written by the `predict` Edge Function (service role).
create policy "prediction logs: read own or admin" on public.prediction_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant delete on public.prediction_logs to authenticated;
create policy "prediction logs: delete own" on public.prediction_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));
