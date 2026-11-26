# Prediction engine

Code: `supabase/functions/_shared/prediction/` (pure TypeScript, no dependencies) · executed by the `predict` Edge Function · tested in `tests/prediction.test.ts`.

## Pipeline

1. **Validate** the request (`validate.ts`) – identical rules in the browser form and on the server.
2. **Eligibility** (`eligibility.ts`) – derive the seat groups the student may hold.
3. **Candidate query** – `public.prediction_candidates()` returns verified `JEE-MAIN` records for eligible seat groups (category, seat type, gender, domicile, quota, rank type, institute type, preferred branches) whose closing rank reached the *near* band in at least one selected year, plus their colleges, branches and sources. Limited to the 400 most relevant seat groups (flagged as truncated).
4. **Engine** (`engine.ts`) – re-checks eligibility defensively, groups by exact seat group, classifies each year and round, summarises per programme, sorts and reports insufficient data.

## Eligibility rules (re-verify every year against the official brochure)

| Rule | Implementation |
| --- | --- |
| OPEN seats are merit seats open to every candidate | category `OPEN` always included |
| Vertical reservation (EWS, BC/OBC-NCL, SC, ST) only for UP domicile | own category added only when domicile = UP |
| Horizontal reservation – GL (girls), AF, FF, PH – only for UP domicile, inside OPEN and own category | seat types added when UP + female / declared sub-category |
| TFW supernumerary seats – UP domicile meeting TFW criteria | seat type TFW + category ANY when declared and UP |
| Female-only seats only for female candidates | gender filter |
| Home-state quota only for UP domicile | quota filter |
| CRL and category ranks never compared with each other | `rank_type` filter; category rank optional |

Records carry an explicit `domicile` requirement set at import time (`ANY` for OPNO seats, `UP` for all reserved/horizontal/TFW seats, `HOME_STATE`/`ALL_INDIA` quotas override). Admins can correct it during review.

## Classification bands (not probabilities)

With closing rank **C** and the compared rank **R** (lower is better):

| Band | Condition |
| --- | --- |
| Historical Cutoff Within Range | R ≤ 0.9 · C |
| Within Historical Closing Rank | 0.9 · C < R ≤ C |
| Near Historical Cutoff | C < R ≤ 1.1 · C |
| Beyond Historical Cutoff | R > 1.1 · C |
| Insufficient Data | no verified record (or invalid record) |

- Every round of every selected year is classified separately.
- A year's classification uses its **last regular round**. Special / spot / internal-sliding rounds fill only leftover seats and their closing ranks are erratic (in the official 2026 data, IET Lucknow Electrical OPNO closed at 56,335 in R4 but 128,161 in the R6 Special Round), so they are shown round by round but not used for the headline. If a year has only special rounds, the last of those is used.
- The seat group's headline uses the **most recent year with data**; “within closing rank in X of Y years” is shown for consistency.
- A programme's headline is the most favourable eligible seat group; all seat groups are listed separately.
- Margins live in `DEFAULT_BANDS` (`classify.ts`).

## Default years

The three most recent years with verified data up to the admission year (or up to five years the student selects). Years without data are reported as “Insufficient Data”.
