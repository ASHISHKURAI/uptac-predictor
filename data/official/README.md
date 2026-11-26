# Official UPTAC data exports

Faithful CSV copies of tables published on the official UPTAC counselling portal, produced with the scripts in `processor/scripts/`. They are **not** loaded into the database automatically: upload them in **Admin → Document imports**, review, approve and publish (see `docs/DATA_IMPORT.md`).

| File | Source | Fetched | Notes |
| --- | --- | --- | --- |
| `2026/uptac_2026_btech_seat_matrix.csv` | https://uptac.samarth.edu.in/index.php/seat-matrix/index?SeatMatrixFilter%5Bprogramme%5D=5 | 2026-11-26 | 1,620 rows · B.Tech (All Branches)/M.Tech (Integrated) only – lateral entry excluded. Import as *Seat matrix*, academic year 2026. |
| `2026/uptac_2026_btech_orcr_all_rounds.csv` | https://uptac.samarth.edu.in/index.php/cut-off-matrix/index?PrgAdmissionCutOffSeatsSearch%5Bparent_programme_id%5D=5 | 2026-11-26 | All published rounds (Round column included), JEE Main CRL ranks. `Source Page` / `Source URL` columns reference the exact official page of every row. Import as *Opening & closing ranks*, academic year 2026, rank type CRL. |

Recommended order: seat matrix first (creates the institutes with their official codes), then the OR-CR file.

Re-fetch (politely, ~1 request/second):

```bash
cd processor
.venv/Scripts/python scripts/fetch_samarth_seat_matrix.py --out ../data/official/2026/uptac_2026_btech_seat_matrix.csv --academic-year 2026
.venv/Scripts/python scripts/fetch_samarth_orcr.py --out ../data/official/2026/uptac_2026_btech_orcr_all_rounds.csv --academic-year 2026
```

Previous years (2023–2025) are not available on the live portal; add official files you hold under `data/official/<year>/` and import them the same way.
