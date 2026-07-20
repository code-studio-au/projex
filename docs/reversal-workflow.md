# Reversal Workflow

The reversal workflow is designed for month-to-month EXA handling where a user
may know a transaction should reverse later, but the actual reversal has not
been imported yet.

## Core flow

1. In month 1, a user codes an EXA transaction and marks it as `Pending reversal`.
2. When the next import arrives, Projex checks new transactions against open
   pending reversals in the same project.
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
- `Accept all auto-mappings` only applies to coding approvals, while reversal
  suggestions use the dedicated reversal approval action.

## Matching behavior

- Matching is intended for monthly import cadence where month 1 contains the
  source EXA and month 2 may contain the reversing EXA.
- Matching uses the transaction information available in the import data and
  therefore may need a “best available” default when multiple imported rows are
  effectively indistinguishable.
- Rejected suggestions return the source transaction to `Pending reversal` so a
  user can match it manually later.

## Reporting impact

- Pending reversals remain visible in transaction filters and company/project
  summary views.
- Exported transaction detail includes reversal status, counterpart transaction
  id, expected project id, and match metadata for auditability.
