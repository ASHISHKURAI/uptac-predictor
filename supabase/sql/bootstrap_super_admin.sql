-- =============================================================================
-- Bootstrap the FIRST super admin (run once in the Supabase SQL editor).
-- 1. Sign up on the website with the administrator's email and confirm it.
-- 2. Replace the email below and run this script.
-- Later admins are promoted from Admin → Users & roles by a super admin.
-- (The SQL editor runs without a user JWT, which the role-protection trigger
--  allows for exactly this bootstrap step. Browser users can never do this.)
-- =============================================================================
update public.profiles
set role = 'super_admin'
where email = lower('admin@your-domain.example')
returning id, email, role;
