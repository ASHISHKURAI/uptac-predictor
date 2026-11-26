# UPTAC Predictor

**Your Rank. Your College. Your Future.**

A JEE Main based college predictor for UPTAC (Uttar Pradesh Technical Admission Counselling) B.Tech admissions. Students enter their JEE Main CRL rank and counselling details; the app compares them with **verified official** UPTAC opening and closing ranks – separately for every year, round, category and seat type they are eligible for – and helps them explore colleges, cutoffs and plan a choice list.

> No fake data, no invented admission probabilities. Every published record comes from an official document, is approved by an administrator, and cites its source.

## Features

| Area | What it does |
| --- | --- |
| **Rank Predictor** | CRL rank (+ optional category rank), admission year, category, gender, domicile, sub-categories (AF/FF/PH/TFW), preferred branches, govt/private preference. Applies UPTAC eligibility rules, never mixes CRL/category ranks or seat quotas, and shows results per year and round with five classification bands. |
| **College Directory** | Search, district and government/private filters, profiles with branches, fees, placements and cutoff charts. |
| **Cutoff Explorer** | Searchable opening/closing rank tables with year, round, category, seat type, branch and college filters; interactive year-comparison charts; CSV export. |
| **Compare** | Up to four colleges: fees, placements, branches, location and historical cutoffs. |
| **Choice Filling Assistant** | Multiple lists, drag-and-drop ordering (keyboard accessible), historical reference ranks, PDF export. Clearly advisory. |
| **Student Dashboard** | Saved colleges, prediction history, favourite branches, choice lists, profile. |
| **Admin panel** | Analytics, college/branch/cutoff/seat-matrix/fees/placement management, PDF/CSV/XLSX import with automated extraction → review → approve → publish, import history, error logs, audit log, data sources, UPTAC monitoring, notifications, user roles. |
| **Monitoring** | Edge Function that politely checks the official portal for new/changed documents (URLs, HTTP metadata, SHA-256) and notifies admins – never publishes automatically. |

## Tech stack

- **Frontend:** React 19, TypeScript 7, Vite 8, Tailwind CSS 4, React Router, TanStack Query, Recharts, Lucide icons, dnd-kit, jsPDF
- **Backend:** Supabase – PostgreSQL (RLS everywhere), Auth, private Storage, Edge Functions (Deno)
- **Document processing:** Python 3.12 FastAPI service with PyMuPDF + pandas (Camelot optional) – `processor/`
- **Deployment:** GitHub + Vercel (web), Supabase (DB/functions), any container host (processor)

## Repository layout

```
src/                         React app (pages, components, data access)
supabase/
  migrations/                Schema, RLS, RPCs, storage, reference data (apply in order)
  functions/
    _shared/prediction/      Prediction engine (pure TS, shared by browser + Deno)
    _shared/import/          Import normaliser & validators (pure TS)
    predict/                 Edge Function: eligibility + candidate query + engine
    process-import/          Edge Function: parse CSV/XLSX, coordinate PDF extraction, stage rows
    monitor-uptac/           Edge Function: official-portal change detection
  sql/                       One-off scripts (super-admin bootstrap, pg_cron schedule)
processor/                   Python PDF/CSV/XLSX extraction service + official-data fetch scripts
data/official/               Official UPTAC exports fetched by the scripts (import via admin panel)
tests/                       Vitest: engine, normaliser, and full database tests in PGlite
docs/                        Architecture, deployment checklist, data import, methodology
```

## Quick start (local)

```bash
npm install
cp .env.example .env.local        # add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                       # http://localhost:5173
```

Without Supabase credentials the site still runs and clearly says “Database not connected” wherever live data is needed – nothing is faked.

Full setup (database, functions, processor, first admin, data import): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm test` | Vitest: prediction engine, import normaliser, database (migrations, RLS, RPCs) |
| `npm run lint` | oxlint |
| `npx deno@2.9.6 check --allow-import supabase/functions/*/index.ts` | Type-check Edge Functions |
| `cd processor && .venv/Scripts/python -m pytest` | Python processor tests |

> **Windows note:** run Vitest from a path with an upper-case drive letter (`D:\UPTAC`, not `d:\UPTAC`), otherwise Vitest can load twice and report “failed to find the runner”.

## Data

- The legacy NIC portal `uptac.admissions.nic.in` **no longer resolves** (checked Nov 2026). UPTAC now publishes on **`https://uptac.samarth.edu.in`** (OR-CR table, seat matrix, notices).
- `processor/scripts/fetch_samarth_orcr.py` and `fetch_samarth_seat_matrix.py` export the official tables to CSV politely (robots.txt allows; 1 request/second). Upload those CSVs in **Admin → Document imports**; review and approve before publishing.
- 2023–2025 documents are no longer on the live portal. Use official PDFs/Excel files you have (or official archives) – the importer supports PDF, CSV, XLSX and XLS. See [docs/DATA_IMPORT.md](docs/DATA_IMPORT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment & production checklist](docs/DEPLOYMENT.md)
- [Data import workflow](docs/DATA_IMPORT.md)
- [Prediction engine & eligibility rules](docs/PREDICTION_ENGINE.md)
- [Python processor](processor/README.md)

## Disclaimer

Not affiliated with UPTAC, AKTU or any government body. Results are historical comparisons and do not guarantee admission. Always verify with the official portal.
