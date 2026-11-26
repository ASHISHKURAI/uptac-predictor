# Architecture

```
 Browser (React SPA on Vercel)
   │  anon key + user JWT (RLS enforced)          ┌───────────────────────────────┐
   ├──────────────── PostgREST / RPC ────────────▶│ Supabase PostgreSQL           │
   │                                              │  • RLS on every table         │
   ├── functions.invoke('predict') ──┐            │  • security-definer RPCs with │
   │                                 ▼            │    explicit admin checks      │
   │                      Edge Function predict ──▶  • audit triggers             │
   │                       (validate → eligibility│                               │
   │                        → prediction_candidates RPC → engine → log)           │
   │                                              └───────────────────────────────┘
   ├── Storage upload (admins, private bucket "official-documents")
   ├── functions.invoke('process-import') ─▶ Edge Function process-import
   │        CSV/XLSX: SheetJS → normaliser → staging rows
   │        PDF: POST /jobs ─▶ Python processor (PyMuPDF/pandas)
   │                 └─ uploads extracted/<job>.json ─▶ callback (X-Processor-Token)
   │                                                  ─▶ normaliser → staging rows
   └── functions.invoke('monitor-uptac') ◀── also pg_cron (X-Monitor-Secret)
            official portal → robots.txt → hashes/links → data_sources + notifications
```

## Principles

1. **Verified data only.** Public visitors can read only rows with `verification_status = 'verified'`. Imports land in `import_staging_records`; only `publish_import_job()` (admin-only, security definer) turns *approved* rows into verified records.
2. **Least privilege.** Grants are revoked and re-granted per table; RLS restricts rows. The service-role key exists only inside Edge Functions and the processor (server-side). `profiles.role` cannot be changed by users (trigger + `set_user_role()` for super admins).
3. **Separation of concerns.** The prediction engine (`supabase/functions/_shared/prediction`) and the import normaliser (`_shared/import`) are pure TypeScript modules with no runtime dependencies – unit tested in Node and executed in Deno.
4. **Traceability.** Every cutoff / seat-matrix record references `data_sources` (document, URL, checksum, year) and keeps the source page and reference. Every admin change is captured in `admin_audit_logs`.
5. **Honest UX.** Missing configuration, undeployed functions and missing data are reported explicitly; classifications are descriptive bands, never probabilities.

## Database (supabase/migrations)

| Migration | Contents |
| --- | --- |
| `…001_core_schema.sql` | Enums, 19 tables (colleges, branches, cutoff_records, seat_matrix, college_fees, placement_records, data_sources, import_jobs, import_staging_records, profiles, saved_colleges, prediction_logs, choice_lists, choice_list_items, admin_audit_logs, error_logs, monitored_sources, monitor_runs, admin_notifications), FKs, unique natural keys, indexes, timestamps, audit & verification triggers, `college_branch_offerings` view |
| `…002_security.sql` | RLS policies and grants |
| `…003_api_functions.sql` | `get_public_stats`, `get_cutoff_years`, `get_cutoff_overview`, `get_public_sources`, `prediction_candidates`, `refresh_staging_duplicates`, `apply_college_mapping`, `apply_branch_mapping`, `publish_import_job`, `reorder_choice_list`, `set_user_role`, `admin_dashboard_stats` |
| `…004_storage_and_reference.sql` | Private bucket + policies, `norm_key`, `revalidate_staging_references`, monitored official URLs, canonical branch catalogue (from official programme names) |

Cutoff natural key: `(academic_year, round_number, college_code, branch_code, shift, category, seat_type, gender, quota, domicile, rank_type, exam)` – different seat groups are never merged.

## Domain model (official UPTAC codes)

Official category codes such as `OPNO`, `BCGL`, `SCPH`, `EWSAF`, `TFW` are split into:

- `category` (vertical): OPEN · EWS · BC · SC · ST (ANY for TFW)
- `seat_type` (horizontal): GENERAL (NO) · GIRL (GL) · AF · FF · PH · TFW
- `gender`: NEUTRAL (“Co-Education”) · FEMALE_ONLY (“WOMEN”)
- `domicile`: who may hold the seat (ANY for OPNO, UP otherwise – per eligibility rules)
- `quota`: STATE (regular UPTAC seat) · HOME_STATE · ALL_INDIA · OTHER
- `rank_type`: CRL · CATEGORY
- `shift` from “(Shift I)”, fee-waiver programmes “(FW)” → TFW seats

## Frontend

- `src/lib/api/*` – typed data access; `src/hooks/*` – React Query hooks.
- Routes are code-split (`src/App.tsx`); the admin panel is a separate lazily loaded area behind `RequireAdmin` (UI gate) **and** RLS/RPC checks (real gate).
- SEO: per-page `<title>`/meta via React 19 metadata hoisting (`Seo`), canonical URLs, `robots.txt`, `sitemap.xml`, JSON-LD.
- Accessibility: semantic landmarks, skip link, focus-visible styles, labelled controls, keyboard drag-and-drop, reduced-motion support, colour never the only signal (classification icons + text).

## Testing

- `tests/prediction.test.ts` – bands, eligibility rules, rank-type separation, seat-group isolation, sorting, insufficient data, validation.
- `tests/import.test.ts` – official category codes, programme/shift/FW parsing, institute codes, OR-CR and seat-matrix layouts (copied from the official portal), repeated PDF headers.
- `tests/database.test.ts` – every migration applied in PGlite; RLS for anon/student/admin/service; role escalation; storage policies; import → review → publish; duplicate safety; prediction RPC; choice-list isolation.
- `processor/tests` – API auth, magic bytes, PDF/CSV/XLSX extraction, job flow with mocked Supabase, official HTML parsers.
