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


## Acceptance status

Synthetic Golden Import regression suite: **7 tests passing locally** as of 2026-09-28.

The suite verifies mapping, term normalization, Section-aware identity, exact duplicate prevention, unknown-course review, pseudonymous-key enforcement, and manual course-map validation.
