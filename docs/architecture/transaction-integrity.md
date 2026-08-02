# Transaction Integrity

## Server-Owned Imports

PowerBI import preview and commit are one server-owned workflow:

1. Preview parses and validates the CSV, applies import and auto-coding rules,
   and persists one canonical `preview_plan` per `import_candidates` row.
2. The browser receives a presentation copy and sends only the batch ID,
   duplicate policy, source-row exclusions, source-row review decisions, and
   commit mode. Source-row identity remains separate from the eventual
   transaction public ID, including when external journal identifiers repeat.
3. Commit locks the batch and candidates, validates every decision, resolves or
   creates taxonomy, creates budget lines, inserts transactions, reconciles
   reversals, and finalizes the preview in one database transaction.

Financial values, coding targets, and source metadata are never accepted from
the commit request. A committed preview cannot be replayed. Previews created
before the canonical-plan format must be cancelled and recreated.

`replaceAll` remains the wire-level mode name for compatibility, but its
production behavior is a guarded imported-period replacement. It replaces only
PowerBI-imported rows in the original preview date range, including excluded
boundary rows. It preserves rows outside that scope and blocks replacement if
any target is reviewed, locked, commented, reversal-linked, or part of a split
or transfer. Replacement candidates are locked before dependency checks; the
delete verifies its affected-row count so concurrent workflow changes cannot
silently produce a partial replacement.

## Category Targets

The subcategory ID is the canonical coding target; category IDs stored beside
it are a denormalized projection. Composite foreign keys enforce that every
transaction, budget line, auto-coding rule, and rule-suggestion record uses the
subcategory's actual parent category.

Moving an unlocked subcategory cascades its category projection to dependants.
A move is blocked while locked transactions use the subcategory because changing
the taxonomy beneath locked history would alter its meaning. Deletion must
explicitly clear or reassign dependants before the subcategory can be removed.
The server repeats these checks after locking the taxonomy and dependent
transactions, while database triggers protect direct category and subcategory
changes. Whole-project and whole-company deletion remains an intentional
lifecycle operation rather than a taxonomy edit.

## Split And Transfer Lineage

`txn_links` is the authoritative relationship model for splits and transfers.
The transaction type, parent, source, and transfer-project columns remain as a
read/export compatibility projection.

- A split records one link from the original financial fact to every allocation.
- A transfer records one link from the source project transaction to its
  destination project transaction.
- Composite foreign keys enforce company and project ownership for both ends.
- Deferred database checks require at least two split allocations, one transfer
  destination, and exact signed-amount balance.
- A transaction participating in lineage cannot be deleted independently.

Legacy orphaned transfer metadata is repaired during migration without deleting
the surviving financial row. New structural mutations create transactions and
lineage links atomically.

## Review, Lock, And Unlock Workflow

Transaction review state is a versioned relational projection. Every transition
increments `txns.workflow_version`; callers must send the version they read, and
stale commands fail without partially changing the transaction.

- Review and reopen transitions emit sanitized audit telemetry after commit
  when audit logging is enabled. User-entered reasons remain in their dedicated
  workflow records and are never copied into logs.
- A transaction can be locked only after valid coding is complete, coding
  approval is resolved, and any reversal workflow is fully matched.
- Locking protects the transaction from coding, taxonomy, deletion, and
  structural changes.
- An ordinary editor cannot reopen a locked transaction directly. The editor
  creates a separate pending `txn_unlock_requests` record instead.
- Authorized company administrators and project reviewers can approve or reject
  an unlock request. Approval unlocks the transaction without silently changing
  its reviewed state.
- Company administrators can perform a direct administrative unlock, but must
  provide a reason.

Pending unlock requests are included in the transaction `Needs review` view.
Requests, decisions, and direct administrative unlocks remain distinct domain
transitions. Discussion comments are not used as authoritative workflow state.

## Structured Audit Telemetry

Workflow, import, coding, taxonomy, structural, rule, membership, access,
lifecycle, and company-standard inheritance events share the central structured
server logger. `PROJEX_AUDIT_LOGGING=false` disables this category without
affecting application behavior; `PROJEX_LOG_LEVEL` independently controls
operational logs.

Mutation events are buffered while their database transaction runs and emitted
only after it commits. A rejected transaction discards its buffer. Entries
contain reviewed scalar identifiers and stable classifications only; they omit
free-form reasons, state snapshots, request bodies, comments, and financial
payloads. Output is best effort and is not a durable compliance record. The
current application does not write audit telemetry to the database. A retired
`audit_events` table remains temporarily as a write-compatible surface for N-1
rollback only; it must be removed in a later contract release after the
logger-only application is no longer the rollback candidate.

On the current EC2 host, stdout and stderr are collected by journald with a
512 MiB persistent cap, 2 GiB free-space reserve, seven-day maximum retention,
compression, and per-service rate limiting. A future Datadog Agent may collect
the same journal stream without changing application call sites.

## Tenant Ownership

Projects expose `(company_id, id)` as a composite ownership key. Operational
project records reference that key, and cross-project relationships carry the
same company ID on both ends. Application authorization remains mandatory, but
the database now independently rejects accidental cross-company references.

## Company Standard Provenance

Project categories, subcategories, import rules, and auto-coding rules use the
same provenance lifecycle:

- `local`: created in the project and not linked to a company source.
- `inherited`: linked to a company source and currently equal to that source.
- `overridden`: still linked to the source, but deliberately changed in the
  project; future reconciliation preserves the project choice.
- `detached`: the linked company source was removed; the project copy remains
  usable and keeps its former source ID and snapshot for traceability.

The shared reconciliation planner creates missing inherited items, adopts exact
local duplicates instead of creating a second copy, updates inherited items,
preserves overrides, and detaches removed sources. Database constraints reject
invalid provenance combinations and duplicate source links within one project.
Taxonomy, import-rule, and auto-coding adapters retain their own target and
foreign-key validation while sharing this transition model.

Company-standard synchronization preloads source and project state in batches,
then reconciles each project within the calling transaction. Manual application
and automatic propagation both emit inheritance audit logs after commit when
enabled.
