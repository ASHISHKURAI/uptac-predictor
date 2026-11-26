-- =============================================================================
-- Optional: schedule the monitor-uptac Edge Function with pg_cron + pg_net.
-- Run this ONCE in the Supabase SQL editor after deploying the function and
-- setting the MONITOR_SECRET Edge Function secret. Not a migration on purpose:
-- it contains your project URL and secret.
--
-- 1. Dashboard → Database → Extensions: enable "pg_cron" and "pg_net".
-- 2. Store the secret in Vault (never hard-code it in a cron command):
--      select vault.create_secret('<the same value as MONITOR_SECRET>', 'monitor_secret');
--      select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- 3. Run the schedule below (every 6 hours; adjust as needed – be polite to the
--    official portal; during counselling season every 2–3 hours is reasonable).
-- =============================================================================

select cron.schedule(
  'monitor-uptac',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/monitor-uptac',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitor-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_secret')
    ),
    body := jsonb_build_object('trigger', 'schedule'),
    timeout_milliseconds := 150000
  );
  $$
);

-- Inspect:   select * from cron.job;  select * from cron.job_run_details order by start_time desc limit 20;
-- Remove:    select cron.unschedule('monitor-uptac');
