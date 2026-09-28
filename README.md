# SDOC Arts Import & Reconciliation

Canonical source repository for the School District of Osceola County Fine & Performing Arts enrollment import pipeline.

## Current milestone

Build and certify the data foundation before adding analytics.

Workflow:

**Upload → Map → Validate → Resolve → Approve → Import → Audit → Golden Import certification**

Golden Import certification remains gated until pathway-classification coverage is available from the SDOC Arts Pathway Dictionary.

## Canonical schema

Required:
- Student ID / approved pseudonymous key
- School
- School Year
- Term
- Course Code
- Course Title

Optional:
- Teacher
- Grade
- Section

## Privacy

The acceptance build is browser-local. Use synthetic or appropriately de-identified records only. Do not place identifiable student data in development fixtures, logs, issues, or AI tools.

## Run locally

Serve the repository with any static HTTP server. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

XLSX parsing uses the pinned SheetJS 0.20.3 browser distribution stored in `vendor/`, so workbook upload does not depend on a third-party CDN at runtime. CSV/TSV parsing uses the repository's local code. Imports and original file bytes are stored in this browser's IndexedDB and are not shared across devices.

## Tests

The regression tests use Node's built-in test runner and require no npm dependencies:

```bash
npm test
```

The synthetic acceptance fixture checks:
- all 9 canonical mappings
- Fall/Spring/Yearlong normalization
- unresolved `T2`
- Section-aware enrollment identity
- one exact duplicate
- blank optional Section
- one unknown local course
- FLDOE leading-zero restoration
- reconciliation balance
- import readiness only after explicit resolutions

## Source of truth

Do not create another independent importer or duplicate course-matching engine. Changes to enrollment ingestion belong here.

## Course reference provenance

`data/florida-arts-courses.csv` is a curated arts-course reference, not the full Florida Course Code Directory. On September 28, 2026, all 366 bundled codes were checked against FLDOE's [2026–27 District Course File](https://www.fldoe.org/file/7746/2627-CCD.xlsx) linked from the [2026–27 Course Directory](https://www.fldoe.org/policy/articulation/ccd/2026-2027-course-directory.stml). The downloaded workbook had SHA-256 `22f832960a37e735d037ab80c39f6a30f6dd86d9de20d8f47d4296621c95734d`. Two incorrect bundled titles were corrected to the official wording; other title differences are mostly formatting and the importer matches by code.

Administrative waiver codes `1500440`, `1500441`, `1500442`, and `1500445` appear in the reference but are excluded from active arts enrollment and FLDOE match coverage. Their source rows and exclusion reasons remain in the import audit. Confirm other district inclusion rules and local-course mappings before using coverage as a participation metric.


## Acceptance status

Synthetic Golden Import regression suite: **7 tests passing locally** as of 2026-09-28.

The suite verifies mapping, term normalization, Section-aware identity, exact duplicate prevention, unknown-course review, pseudonymous-key enforcement, and manual course-map validation.
