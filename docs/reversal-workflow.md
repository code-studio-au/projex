# Reversal Workflow

The reversal workflow is designed for month-to-month Power BI expenditure
handling where a user may know a transaction should reverse later, but the
actual reversal has not been imported yet.

## Core flow

1. In month 1, a user codes an imported transaction and marks it as
   `Pending reversal`.
2. When the next import arrives, Projex checks new transactions against open
   pending reversals in the same project. If several months were imported
   together, marking the source pending later checks the reversals already in
   the project.
3. If a clear match is found, Projex suggests the reversal pair for review.
4. If multiple possible matches exist, Projex assigns the closest default match
   and flags the pair for review as an ambiguous defaulted match.
5. An admin or project lead reviews the suggested matches and approves or
   rejects them in bulk or individually.
6. Once approved, both sides move to `Matched reversal pair`.

## What users will see

- `Pending reversal` on the original coded transaction
- `Suggested reversal review` when Projex finds a likely match automatically
- `Defaulted reversal review` when Projex had to choose the closest candidate
  from multiple plausible matches
- `Matched reversal pair` once the review is approved

## Review workflow

- The Transactions tab includes a `Needs review` filter that combines coding
  review work and reversal review work.
- Users can bulk-approve selected suggested reversal matches from the row
  selector.
- A selected bulk approval is atomic: if any suggested pair has become invalid,
  none of the selected pairs or approval comments are committed.
- `Find reversal matches` searches all currently pending sources against
  eligible, unclaimed negative Power BI transactions already in the project.
  This is useful after historical or multi-month imports.
- `Accept all auto-mappings` only applies to coding approvals, while reversal
  suggestions use the dedicated reversal approval action.

## Matching behavior

- Matching is intended for monthly import cadence where month 1 contains the
  source transaction and month 2 may contain its reversal.
- The `Source` value is not vendor-coded. Any current or future source value is
  eligible when both sides contain the same normalized value; transactions from
  different source systems are never paired automatically.
- A reversal candidate must occur on or after its source transaction and no
  more than 62 days later; earlier negative transactions are never considered.
- EXA rows import by default. Company or project Import Rules can still review
  or exclude a narrower EXA subset when the team has a reliable local marker.
- Matching uses the transaction information available in the import data and
  therefore may need a “best available” default when multiple imported rows are
  effectively indistinguishable.
- Default pairs are selected only from metadata-compatible source/reversal
  combinations. Every selected pair in an ambiguous candidate group remains
  visibly defaulted for review.
- Approval rechecks the matching fields, amount, sign, and date window so a
  stale suggestion cannot be approved after its transaction metadata changes.
- Approval and transaction lock changes are serialized per project so a
  concurrent lock or reversal-state change cannot bypass those checks.
- Rejected suggestions return the source transaction to `Pending reversal` so a
  user can match it manually later. The rejected source/counterpart pair is
  excluded from later automatic reconciliation so it is not repeatedly
  suggested.

## Reporting impact

- Pending reversals remain visible in transaction filters and company/project
  summary views.
- Exported transaction detail includes reversal status, counterpart transaction
  id, expected project id, and match metadata for auditability.
