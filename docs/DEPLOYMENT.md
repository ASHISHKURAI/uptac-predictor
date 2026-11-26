# Deployment guide & production checklist

Order: **Supabase → Edge Functions → first admin → web app (Vercel) → Python processor → monitoring → data import**.

## 1. Supabase project

1. Create a project at <https://supabase.com> (region close to India, e.g. Mumbai `ap-south-1`).
2. Install the CLI (`npm i -g supabase` or `npx supabase`), then:
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push            # applies supabase/migrations in order
   ```
   (Alternatively paste each migration file into the SQL editor, in filename order.)
3. **Auth → URL configuration:** Site URL = your production domain; add redirect URLs:
   `https://<domain>/dashboard`, `https://<domain>/auth/reset-password`, and `http://localhost:5173/*` for development.
4. **Auth → Providers:** Email enabled with confirmations. Optional: Google (then set `VITE_ENABLE_GOOGLE_AUTH=true`).
5. **Auth → SMTP:** configure a custom SMTP sender for production (the built-in sender is rate limited).

## 2. Edge Functions

```bash
supabase functions deploy predict
supabase functions deploy process-import
supabase functions deploy monitor-uptac
cp supabase/functions/.env.example supabase/functions/.env   # fill in values
supabase secrets set --env-file supabase/functions/.env
```

| Secret | Required | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | yes (prod) | Comma-separated site origins for CORS, e.g. `https://uptacpredictor.in` |
| `SITE_URL` | yes | Used in notification links and the monitor User-Agent |
| `PROCESSOR_URL`, `PROCESSOR_TOKEN` | for PDF imports | Python processor base URL + shared secret (≥ 32 random chars) |
| `MONITOR_SECRET` | for scheduled monitoring | Shared secret for pg_cron → monitor-uptac |
| `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAILS`, `NOTIFY_FROM_EMAIL` | optional | E-mail notifications (in-app notifications always work) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase automatically.

## 3. First super admin

1. Sign up on the website with the administrator e-mail and confirm it.
2. Edit and run `supabase/sql/bootstrap_super_admin.sql` in the SQL editor.
3. Further admins: **Admin → Users & roles** (super admin only).

## 4. Web app on Vercel

1. Push the repository to GitHub.
2. Vercel → *New Project* → import the repo (framework: Vite – `vercel.json` already configures build, SPA rewrites, security headers and caching).
3. Environment variables (Production + Preview):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Project Settings → API – **anon/publishable key only**)
   - `VITE_SITE_URL` = `https://<domain>`
   - `VITE_ENABLE_GOOGLE_AUTH` = `true|false`
4. Replace `https://your-domain.example` in `public/sitemap.xml` and add `Sitemap: https://<domain>/sitemap.xml` to `public/robots.txt`.
5. If you use a custom Supabase domain, add it to the CSP `connect-src` in `vercel.json`.

## 5. Python processor (PDF extraction)

Deploy `processor/` as a container (Render, Railway, Fly.io, Google Cloud Run, a VPS…):

```bash
cd processor
docker build -t uptac-processor .
docker run -p 8080:8080 --env-file .env uptac-processor
```

Environment (see `processor/.env.example`): `PROCESSOR_TOKEN` (same value as the Edge Function secret), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only), `SUPABASE_ANON_KEY`. Then set `PROCESSOR_URL` for the Edge Functions. Without it, CSV/XLSX imports still work and PDF imports fail with an explicit “not configured” message.

## 6. Monitoring schedule

Enable `pg_cron` and `pg_net`, store the secrets in Vault and run `supabase/sql/schedule_monitor.sql`. Admins can also run checks from **Admin → UPTAC monitoring**.

## 7. Import official data

Follow [DATA_IMPORT.md](DATA_IMPORT.md): import the seat matrix first (creates institutes), then the OR-CR files; review, approve, publish.

---

## Production checklist

**Security**
- [ ] Only the anon/publishable key is in Vercel env vars; the service-role key exists only in Supabase secrets and the processor host.
- [ ] `ALLOWED_ORIGINS` set to the production origin(s) (not `*`).
- [ ] `PROCESSOR_TOKEN` and `MONITOR_SECRET` are long random values, stored only as secrets.
- [ ] Storage bucket `official-documents` is private (migration enforces this) – verify in the dashboard.
- [ ] Exactly the intended people have `admin` / `super_admin` roles.
- [ ] Supabase **Advisors** (Security + Performance) show no unresolved warnings.
- [ ] Email confirmations on; custom SMTP configured; password minimum length ≥ 8; leaked-password protection on (Auth settings).
- [ ] Point-in-time recovery / daily backups enabled on the database plan.

**Functionality**
- [ ] `npm run build` and `npm test` pass; `deno check` passes for the Edge Functions; processor `pytest` passes.
- [ ] Predict: a sample prediction returns results with sources; anonymous users can predict; history appears for signed-in users.
- [ ] Import: upload a CSV → in review → approve → publish → visible publicly; a PDF import reaches the processor and comes back.
- [ ] Monitor: manual run succeeds; scheduled job present in `cron.job`.
- [ ] Auth flows: sign-up confirmation, sign-in, magic link, password reset redirect to production domain.

**Data quality**
- [ ] Every published record has a source document and academic year.
- [ ] Eligibility rules in `supabase/functions/_shared/prediction/eligibility.ts` re-verified against the current year's official brochure.
- [ ] Rank type (CRL vs category) confirmed for each imported document.
- [ ] Spot-check 20 random records per import against the official document.

**SEO & performance**
- [ ] `sitemap.xml` / `robots.txt` updated to the real domain; Search Console verified.
- [ ] Lighthouse (mobile) ≥ 90 for Performance, Accessibility, Best Practices, SEO on `/`, `/predictor`, `/colleges`.
- [ ] Open Graph preview renders (`/og-image.svg` – replace with a PNG for best social-network support).

**Operations**
- [ ] Error logs (Admin → Error logs) reviewed after each import and weekly.
- [ ] Notification e-mails reach the admin inbox (if configured).
- [ ] Disk/quotas monitored (database size, storage, Edge Function invocations).
