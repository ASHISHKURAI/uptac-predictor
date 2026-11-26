# Importing official UPTAC data

Nothing is ever published automatically. Every row passes through **upload → extraction → normalisation → validation → duplicate detection → admin review → publish**.

## Where the official data is (verified November 2026)

| Data | Official location | How to get a file |
| --- | --- | --- |
| Opening & closing ranks (current year) | <https://uptac.samarth.edu.in/index.php/cut-off-matrix/index> (filter “B.Tech (All Branches)/M.Tech (Integrated)”) | `python processor/scripts/fetch_samarth_orcr.py --out data/official/<year>/orcr.csv --academic-year <year>` (≈ 534 pages, 1 req/s, resumable with `--start-page`) |
| Seat matrix (current year) | <https://uptac.samarth.edu.in/index.php/seat-matrix/index?SeatMatrixFilter%5Bprogramme%5D=5> | `python processor/scripts/fetch_samarth_seat_matrix.py --out data/official/<year>/seat_matrix.csv --academic-year <year>` |
| Notices, brochures | <https://uptac.samarth.edu.in/index.php/notifications/index> | Detected by the monitor → Admin → Data sources |
| Previous years (2023–2025) | The legacy portal `uptac.admissions.nic.in` no longer resolves. | Use official PDFs / Excel files you downloaded during those counselling years, or official archives. Upload them directly (PDF requires the Python processor). |

> **Important:** the unfiltered seat-matrix page also contains **B.Tech Lateral** rows with identical branch names. The fetch script filters to programme 5 (regular B.Tech) by default; the importer flags any duplicate seat groups so they cannot be published by accident.

Ready-to-import exports created while building this project are in `data/official/2026/` (fetched from the official portal on 26 Nov 2026): the B.Tech seat matrix (1,620 rows → 19,193 seat records, 204 institutes) and all OR-CR rounds (26,653 rows → 10,026 cutoff records after skipping 15,356 “no allotment” rows and 1,271 non-JEE rows). A dry run through the normaliser leaves only 15 rows needing a mapping (Indian Institute of Carpet Technology, Bhadohi – programme “Carpet & Textile Technology”).

## Step by step

1. **Admin → Document imports → Upload.** Choose the file, document type (seat matrix / opening & closing rank), academic year, round (only if the file has no Round column), rank type (CRL for the current Samarth OR-CR – it lists JEE Main CRL ranks for every category; verify for older documents), default quota, a source title and the official URL.
2. The file is stored in the **private** bucket with its SHA-256 checksum. The same file cannot be imported twice while an earlier import is active.
3. Processing:
   - CSV / XLSX / XLS – parsed by the `process-import` Edge Function.
   - PDF – extracted by the Python processor (PyMuPDF table detection, page numbers preserved), then normalised by the same Edge Function.
4. **Review** (Admin → Document imports → open the job):
   - **New institutes** (seat matrix): institutes with official codes not yet in the directory – confirm type/district and create them.
   - **Unresolved institute names / programmes** (OR-CR): map them to existing colleges/branches (suggestions provided). Mappings are remembered as aliases for future imports.
   - **Rows**: errors (missing ranks, opening > closing, unknown category…) must be fixed or rejected; warnings should be checked. Duplicates are flagged: *in file*, *identical to published* (auto-skipped) or *conflicting with published* (approving overwrites the published value).
   - Approve rows individually, in bulk, or “approve all valid pending rows”.
5. **Publish.** Approved rows become verified public records with `verified_by`, the source document, page and job reference. One audit entry summarises the publish.

**Recommended order for a new year:** seat matrix first (creates institutes with official codes and types), then OR-CR rounds.

## Normalisation rules

- Category codes `OPNO, OPGL, OPAF, OPFF, OPPH, BCNO … EWSPH, TFW` and older labels (`OPEN(GIRL)`, `OBC-NCL`, `GEN-EWS`, `OPEN-PwD` …) map to category + seat type.
- “Co-Education” → gender-neutral; “WOMEN”/“Female-only” → female-only seats.
- `(Shift I)` / `(Shift II)` → shift; `(FW)` → tuition-fee-waiver programme.
- `-` in both rank columns = no allotment in that round (not imported, counted in the statistics).
- Seat gender “(not set)” (used in the 2026 Special Round) is stored as gender-neutral **with a warning** so reviewers can confirm it.
- Ranks with a decimal part (e.g. `459535.01`, 14 rows in the 2026 export) use the whole-number part **with a warning**.
- Exam names are case-insensitive (`jee-main` = `JEE-MAIN`); rows admitted on other bases (`BOARD`, `cuet-ug`) are skipped because they are not comparable with JEE Main ranks.
- Non-B.Tech programmes (B.Pharm, MBA, MCA, B.Arch, BCA, lateral entry …) are skipped.
- Institute names are matched with the same normalisation in TypeScript (`normalizeKey`) and SQL (`norm_key`).

## Retries & failures

- Failed jobs show the reason (e.g. “PDF processing service is not configured”) and can be retried up to 3 times; retries clear earlier staging rows, so they are safe to repeat.
- Every failure is written to **Error logs** and raises an admin notification.
