# Reversal Workflow

The reversal workflow is designed for month-to-month expenditure handling
where a user may know a transaction should reverse later, but the actual
reversal has not been imported yet.

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
6. Once approved, the table distinguishes `Matched original` from
   `Matched reversal`, while both rows open the same read-only pair record.

## What users will see

- `Awaiting reversal` on an original transaction with no candidate yet
- `Review reversal match` and `Suggested reversal` on a clear proposal
- `Review default match` and `Default reversal` when Projex had to choose from
  multiple plausible candidates
- `Matched original` and `Matched reversal` once the review is approved

## Review workflow

- The Transactions tab includes a `Needs review` filter that combines coding
  review work and reversal review work.
- `Review matches` opens a stable queue of suggested pairs from the current
  workflow and date filters, in the table's selected sort order. Reviewers can
  move between pairs and approve or reject each match without reopening the
  modal.
- The queue shows progress. Completing or closing it reports how many matches
  were approved, rejected, and still remain.
- Users can bulk-approve selected suggested reversal pairs from the row
  selector. Selecting both rows of one pair still counts as one approval.
- Individual and bulk review show the original and reversal side by side,
  including date, amount, description, source metadata, evidence, and any
  alternative candidates. Internal IDs remain in authoritative workflow rows,
  sanitized audit telemetry, and exports but are omitted from the primary
  review cards.
- A selected bulk approval is atomic: if any suggested pair has become invalid,
  none of the selected pairs, reviewer notes, or audit transitions are
  committed.
- `Find reversal matches` searches all currently pending sources against
  eligible, unclaimed negative transactions already in the project.
  This is useful after historical or multi-month imports.
- `Accept all auto-mappings` only applies to coding approvals, while reversal
  suggestions use the dedicated reversal approval action.

## Matching behavior

- Matching is intended for monthly import cadence where month 1 contains the
  source transaction and month 2 may contain its reversal.
- Matching uses canonical source facts rather than a vendor-specific source
  name. Any current or future source system is eligible when both sides contain
  the same normalized source system and journal description; transactions from
  different source systems are never paired automatically.
- A reversal candidate must occur on or after its source transaction and no
  more than 62 days later; earlier negative transactions are never considered.
- EXA rows import by default. Company or project Import Rules can still hold a
  narrower EXA subset for an explicit preview decision, or exclude it, when the
  team has a reliable local marker.
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
- Running full reconciliation returns all unapproved proposals to the candidate
  pool before rebuilding the best complete pairing. This lets newly arrived
  transactions improve an earlier proposal without changing approved history.
- Manual matches enforce the same amount, sign, project, and date-order
  invariants as automatic proposals. The 62-day limit applies only to automatic
  matching.
- Linked transaction identity is immutable while a reversal workflow exists.
  Users must cancel or unmatch the workflow before changing matching fields,
  deleting, splitting, or transferring either side.
- Every proposal and state transition increments an optimistic version and,
  when audit logging is enabled, emits sanitized audit telemetry only after the
  transaction commits.
- Transaction comments contain human notes rather than repeating the reversal
  status, pair details, or internal IDs. Automatic suggestions do not create
  comments because their state and evidence are already visible in the table
  and review modal.
- Pending-reversal notes remain open while action is required. Accepting a
  manual or suggested match closes the pair's reversal notes; an optional
  approval note is saved as closed. Unrelated transaction comments remain
  unchanged.
- Clearing an exception returns it to the pending queue. Cancelling the
  workflow is a separate, explicit action.

## Reporting impact

- Pending reversals remain visible in transaction filters and company/project
  summary views.
- Exported transaction detail includes reversal status, pair version, method,
  score, candidate count, human-readable source/counterpart snapshots, and the
  recorded match evidence for auditability.
