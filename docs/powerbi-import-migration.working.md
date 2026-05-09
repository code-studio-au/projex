# PowerBI Import Migration Working Note

Temporary working file for the PowerBI import migration. Delete this before the
final completion commit unless we intentionally promote it into permanent docs.

## Decisions

- PowerBI expenditure actuals will become the primary/only user-facing import
  type.
- The old generic CSV importer should be removed once the PowerBI importer is in
  place.
- Transaction actuals should support signed amounts:
  - positive values are spend/cost
  - negative values are credits/refunds/reversals/recoveries
- Budget allocations remain non-negative for now.
- The full original PowerBI row should be retained as source/audit metadata, but
  only selected fields should be promoted into the transaction model.
- Company-level Import Rules decide whether a row is imported, excluded, or sent
  to review.
- Current company default mapping rules should be renamed conceptually to
  Auto-Categorise Rules.
- Import Rules run before Auto-Categorise Rules.
- Excluded rows should be visible in preview, but admins need a show/hide toggle
  because SAL and EXA can produce many rows.
- Review rows should not become budget-impact transactions immediately.
- Admin can send uncertain review rows to project lead review instead of making
  a spend-context decision alone.

## PowerBI Source Fields

- Core transaction fields:
  - `Posted Date` -> transaction date
  - `Expenditure Actuals` -> signed amount
  - `Vendor Name` -> item when present
  - `Journal Line Description` -> description
  - `Journal ID` + `Journal Line` -> stable external ID
  - `CC and Description` -> categorisation/rule input
  - `Source` -> import rule input
- Raw metadata should preserve all source columns including `Ledger`, `Fiscal
Year`, `Period`, `RC and Description`, `PC and Description`, `AC`, `Reference
Num`, `Journal Date`, `Journal Line Ref`, `Unpost Seq`, `Operator ID`,
  `PO ID`, and `Vendor ID`.

## Default Import Rule Direction

- Exclude `Source = SAL`.
- Exclude `Source = EXA`.
- Exclude or review suspected salary transfers using salary-transfer source
  terms and internal salary transfer cost codes such as `4041`/`4141`.
- Keep remaining `T02` rows reviewable/high-visibility because journal entries
  are riskier than normal AP/expense rows.

## Implementation Phases

1. Signed actuals groundwork:
   - remove non-negative DB constraint from `txns.amount_cents`
   - allow signed transaction validation
   - remove `Math.abs` from rollups/summaries/import parsing
   - update split rules so signed children sum exactly to the signed parent
   - update tests and invariants
2. Auto-Categorise naming:
   - rename UI/docs text from default mapping rules to Auto-Categorise Rules
   - defer or include DB/API renaming depending migration scope
3. PowerBI import foundation:
   - parser/profile for expected PowerBI columns
   - source metadata storage
   - preview statuses for import/exclude/review/invalid/duplicate
4. Import Rules:
   - company-level rule model
   - seeded defaults for SAL/EXA/suspected salary transfer
   - preview summary by matched rule
5. UI replacement:
   - replace CSV importer with PowerBI import preview
   - show/hide excluded rows
   - summary counts and rule buckets
6. Review queue:
   - hold review rows outside budget-impact transactions
   - allow admin to send rows to project lead review
   - project lead approve/reject path
7. Cleanup:
   - remove generic CSV importer paths once PowerBI flow replaces them
   - update permanent docs
   - delete this working file

## Progress

- [x] Signed actuals groundwork
- [x] Auto-Categorise naming updates
- [x] PowerBI parser/profile
- [x] Source metadata persistence
- [x] Import Rules persistence
- [x] Import Rules management UI
- [x] PowerBI preview UI
- [x] Review queue foundations and import/reject UI
- [x] CSV importer cleanup
- [x] Final docs
- [ ] Delete this file

## Current Status

- PowerBI-shaped CSV import is implemented as the only user-facing import flow.
- The generic transaction CSV importer UI/workflow has been removed.
- Local migrations `0016_signed_transaction_amounts.sql` and
  `0017_powerbi_import_foundations.sql` have been applied successfully.
- Verification passed: `npm run typecheck`, `npm run test`, `npm run lint`,
  `npm run format:check`, and `npm run build`.

## Deferred Before Deleting This Note

- Decide whether admins can reliably export PowerBI expenditure actuals as CSV.
  If not, add direct `.xlsx` parsing deliberately with an agreed dependency.
- Decide whether import candidate and Import Rule decisions need a dedicated
  append-only audit-event table beyond the current batch/candidate state.
