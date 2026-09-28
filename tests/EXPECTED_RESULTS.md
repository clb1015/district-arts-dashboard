# Synthetic Golden Import expected results

This fixture uses official FLDOE theatre course codes (`0400310` and `0400410`).

First validation pass:
- 13 source rows
- 10 eligible enrollment records
- 2 held records: `T2` and course `9999999`
- 1 exact duplicate
- 8 unique students among currently eligible records
- `SYN-0002` remains two legitimate enrollments because Sections 001 and 002 differ
- blank Section for `SYN-0003` is allowed
- `Local Extra` remains unmapped but is preserved in each raw row

After resolving `T2 → Spring` and marking `9999999` as a local course:
- 12 active enrollment records
- 0 held records
- 1 exact duplicate prevented
- 10 unique students
- reconciliation balances to all 13 source rows
