# Rule Suggestions Design

This note defines the implemented design for suggesting company default mapping
rules from repeated manual transaction coding.

It is intentionally a design and delivery guide, not a quick implementation
patch.

## Status

The repo has now shipped the complete V1 to V3 workflow:

- repeated manual coding can prompt immediate project auto-coding suggestions in project workflow
- admins can review repeated-pattern suggestion items and accept them into company auto-coding defaults
- repeated overrides of a known company rule create a distinct correction suggestion that preserves the source rule identity
- admins can update the existing rule or create a narrower rule immediately ahead of it in priority order
- deterministic confidence indicators explain the sample, date, project, and text-basis evidence
- normalized match-text alternatives remove unstable invoice and reference suffixes without introducing opaque scoring
- dismissals record a reason and remain suppressed for 30 days unless 3 more examples arrive
- accepted evidence is cleared so a resolved suggestion needs a fresh threshold of examples before resurfacing
- project/company auto-coding now participates in the same synced company-standards model as taxonomy and import rules

The sections below document the shipped architecture and its intentional safety boundaries.

## Goal

Help company admins turn repeated manual coding into reusable default mapping
rules without:

- scanning raw transaction history on every page load
- creating noisy or brittle suggestions
- silently changing existing transaction outcomes
- mixing project taxonomy behavior with company default rule governance

## Why This Feature Matters

Today the app already supports:

- company default mapping rules for imported transactions
- transaction-level coding metadata such as `codingSource`
- explicit manual coding from the transactions grid

That means the product already knows the difference between:

- transactions coded by an existing company rule
- transactions coded manually by a user

Repeated manual coding is therefore a reliable product signal that the team is
teaching the system a rule it does not yet know.

## Current Product Reality

The design should stay anchored to the existing repo behavior:

- imported transactions can be tagged with `companyDefaultMappingRuleId`,
  `codingSource: 'company_default_rule'`, and `codingPendingApproval`
- manual category and subcategory edits in `TransactionsPanel` explicitly write
  `codingSource: 'manual'`, clear any prior mapping rule reference, and clear
  pending approval
- company default mapping rules are company-scoped and canonically target a
  company default subcategory ID; the category is derived from that target
- company rules resolve into project taxonomy by explicit company-origin IDs
  first, with a category-qualified name fallback for older or local taxonomy

This means suggestions should be created from manual coding events, but the
accepted output should still be a normal company default mapping rule.

## Recommended Product Scope

### V1: New-rule suggestions only

Status: shipped

Detect repeated manual coding patterns where uncoded or manually coded
transactions with a similar merchant or description are repeatedly assigned to
the same category and subcategory.

Admins can then:

- review the proposed match text
- see supporting evidence
- accept the suggestion into a new company default mapping rule
- dismiss it

### V2: Update existing-rule suggestions

Status: shipped

Detect cases where users repeatedly override the same existing company default
mapping rule toward a different target subcategory.

Admins can then:

- review whether the current rule is too broad or mis-targeted
- update the existing rule or create a narrower replacement
- dismiss the suggestion if the override pattern is intentional edge-case work

### V3: Confidence and operator refinement

Status: shipped

Expand beyond simple suggested match text by offering:

- preferred match-text alternatives
- rule narrowing hints
- confidence indicators
- richer evidence windows and duplicate suppression

## Non-Goals

The implementation does not:

- auto-create rules with no admin approval
- rewrite historical transactions automatically on suggestion acceptance
- use opaque ML scoring or external AI dependencies
- scan the entire `txns` table during normal user workflows
- create project-only rules that bypass the company default model

## Suggested Detection Model

### Signal source

Capture a suggestion signal when a user manually changes a transaction to a
valid category and subcategory combination and the transaction remains
categorisable.

Good qualifying examples:

- uncoded imported transaction manually coded to `Travel > Flights`
- previously rule-coded transaction manually recoded to a different target
- manually coded transaction re-confirmed to the same target across similar
  vendors

Signals to ignore:

- edits that only change amount, text, or date
- rows that are uncategorisable or source-only
- split-parent or transfer-source structural rows after they lose coding
- transactions with invalid or incomplete category/subcategory state
- lock/unlock or review actions with no coding change

### Suggestion key

Aggregate signals into a stable suggestion key rather than treating each edit
as its own suggestion candidate.

Suggestion key:

- `company_id`
- normalized pattern source
  - start with normalized `item`
  - fallback to normalized `description`
  - store raw forms for evidence and match-text alternatives
- source company rule ID for update suggestions
- target project taxonomy outcome
  - `category_id`
  - `sub_category_id`

Important:

- suggestions should still be company-scoped, even though evidence comes from
  project transactions
- acceptance should resolve the project taxonomy target back into company
  default category and subcategory ids before creating the real rule

### Pattern normalization

Use a deterministic normalization pass similar in spirit to the existing
`companyDefaultMappings` helpers:

- trim
- lowercase
- collapse whitespace
- strip punctuation that does not carry meaning
- remove unstable invoice/reference suffix tokens while retaining the useful
  text around them

The normalization remains conservative. A slightly under-eager suggestion
engine is better than a noisy one.

## Recommended Data Model

Use a small indexed aggregate table plus an evidence table.

### 1. `rule_suggestion_signals`

Purpose:

- append-only or near-append-only evidence that a qualifying manual coding event
  happened

Stored columns:

- `id`
- `company_id`
- `project_id`
- `txn_public_id`
- `source_type`
  - `manual_coding`
- `pattern_basis`
  - `item`, `description`, or `item_description`
- `pattern_text_normalized`
- `pattern_text_raw`
- `category_id`
- `sub_category_id`
- `prior_company_default_mapping_rule_id` nullable
- `acted_by_user_id`
- `created_at`

Constraints:

- unique enough to avoid double-counting the same transaction state change
- index on company, normalized pattern, and target taxonomy

### 2. `rule_suggestions`

Purpose:

- materialized admin-facing queue item

Stored columns:

- `id`
- `company_id`
- `status`
  - `open`, `accepted`, `dismissed`
- `suggestion_type`
  - `create_rule`, `update_rule`
- `source_rule_id` for update suggestions
- `pattern_basis`
- `pattern_text_normalized`
- `proposed_match_text`
- `project_category_id`
- `project_sub_category_id`
- `company_default_category_id`
- `company_default_sub_category_id`
- `sample_count`
- `distinct_txn_date_count`
- `distinct_project_count`
- `confidence_score`
- `match_text_alternatives`
- `recommended_action`
- `first_seen_at`
- `last_seen_at`
- `accepted_rule_id` nullable
- `dismissed_reason` nullable
- `created_at`
- `updated_at`

Constraints:

- partial unique index preventing multiple open suggestions for the same company,
  normalized pattern, target subcategory, and suggestion type

### 3. Optional `rule_suggestion_evidence`

Purpose:

- preserve a bounded set of example transactions for admin review

Evidence fields:

- `suggestion_id`
- `txn_public_id`
- `project_id`
- `item`
- `description`
- `amount_cents`
- `txn_date`
- `acted_by_user_id`
- `created_at`

This can be a separate table or derived from the signal table. I prefer a
separate bounded evidence table only if the UI needs direct examples without
extra joins or historical drift.

## Suggestion Lifecycle

### 1. Manual coding event occurs

When a transaction is manually recoded through the existing transaction update
flow:

- compare previous and next coding state
- if the change qualifies, record a signal
- upsert or refresh the corresponding suggestion aggregate

### 2. Suggestion becomes reviewable

A suggestion should only appear in the admin queue once it crosses a threshold.

Recommended initial threshold:

- at least 3 distinct transactions
- across at least 2 separate dates or import batches when possible

This avoids creating queue noise from one-off cleanup work.

### 3. Admin reviews

The queue should show:

- proposed match text
- proposed category and subcategory
- number of supporting examples
- last seen date
- whether the target resolves cleanly to company default taxonomy

### 4. Admin accepts

Acceptance flow:

- verify company default category and subcategory exist
- create the normal company default mapping rule
- mark suggestion accepted
- link `accepted_rule_id`

Not currently offered:

- offer a separate action to re-run the new rule against uncoded historical rows

### 5. Admin dismisses

Dismissal records a reason:

- noise
- one-off vendor
- too broad
- intentionally handled manually

Dismissal suppresses regeneration for the same key for 30 days unless 3 more
supporting transactions appear first.

## Create-Rule vs Update-Rule Suggestions

This distinction matters and should be explicit in the design.

### Create-rule suggestion

Use when:

- repeated manual coding happens
- there is no existing company default rule reference on the prior state
- or the prior state was uncoded

Outcome:

- propose a brand-new company default mapping rule

### Update-rule suggestion

Use when:

- the previous transaction state was rule-coded by a known company default rule
- users repeatedly change those results to a different target

Outcome:

- suggest narrowing or changing an existing rule rather than blindly creating a
  duplicate

Update suggestions store the source rule ID so the review and acceptance path
cannot lose the rule that produced the overridden result.

## Trigger Point In This Repo

The cleanest first trigger point is the server-side transaction update path, not
the React component.

Recommended place:

- inside or immediately after `updateTxnServer`

Why:

- the server has both previous and next transaction state
- this covers UI edits and any future API clients consistently
- it avoids trusting the frontend to emit suggestion-side effects

Recommended pattern:

1. load existing transaction
2. compute `prev`
3. validate and persist `next`
4. if the coding change qualifies, call a dedicated server helper such as
   `recordRuleSuggestionSignal(...)`

That helper should own all normalization, dedupe, thresholding, and upsert
logic.

## Taxonomy Resolution Rule

Accepted suggestions must produce company default mapping rules, not project-only
taxonomy shortcuts.

That means suggestion acceptance must verify that the chosen project
subcategory maps cleanly to existing company default taxonomy. Subcategory ID
is the canonical rule target; category is retained for display and
rollback-compatible storage but is derived by the server.

For all suggestions:

- resolve explicit company-origin subcategory IDs first, including project
  overrides that have moved the inherited subcategory to a different category
- use a category-qualified name fallback only when no explicit origin link is
  available, so duplicate subcategory names in different categories remain
  unambiguous
- if the project target cannot be resolved back to company defaults, block
  acceptance and ask the admin to fix company defaults first

This is stricter, but it preserves the architecture already used by import-time
mapping.

## Admin UX Recommendation

Place the queue in Company Settings near company default taxonomy and mapping
rule management.

Recommended first UI:

- a new `Rule Suggestions` modal or panel beside:
  - company default categories
  - company default mapping rules
  - company import rules

Each suggestion row should show:

- proposed match text
- target category and subcategory
- support count
- last seen
- 1 to 3 example transactions
- actions: `Accept`, `Dismiss`

Acceptance UX should allow a final edit to:

- proposed match text
- target company default category, used to narrow and explain the available
  choices
- target company default subcategory, whose ID is the submitted rule target

This keeps the system helpful without being overly automatic.

## Taxonomy Change Behaviour

- Moving a subcategory keeps its ID, so dependent auto-coding rules follow it
  automatically and their derived category is updated atomically.
- Duplicate subcategory names are allowed across categories and are
  distinguished by ID and full category path.
- Deleting a subcategory with dependent rules requires an explicit choice to
  reassign those rules to another subcategory or delete them with the target.
- Company-linked project taxonomy can be renamed or moved as a project
  override, but cannot be deleted while its company source still exists.
- Unlocked transactions and budget lines follow project subcategory moves;
  locked transactions preserve their historical category assignment.

## Performance Approach

Do not derive the queue by re-reading all transactions.

Preferred approach:

- write a small signal record on qualifying manual coding changes
- upsert a compact aggregate row
- query only the aggregate table for the admin queue

Indexes should prioritize:

- company-scoped queue reads
- open suggestion lookups by key
- signal dedupe by transaction and normalized target

## Abuse And Noise Controls

The feature will only feel professional if it is quiet.

Recommended controls:

- threshold before queue visibility
- dedupe repeated edits on the same transaction
- ignore stale suggestions after taxonomy deletion
- cooldown after dismissal
- prefer item-based patterns over long free-form descriptions when both exist
- cap evidence samples stored per suggestion

Shipped defaults:

- minimum 3 distinct transactions
- maximum 5 evidence samples shown
- 30-day dismissal cooldown

## Auditing Expectations

We are not building the broader audit feature yet, but this design should leave
space for later auditability.

At minimum, store:

- who triggered the manual coding signal
- who accepted or dismissed the suggestion
- which rule was created from acceptance

This can live on the suggestion records now and later feed the fuller audit
system.

## Delivery Plan

### Phase 1: Foundations

Status: shipped

- add schema for suggestion signals and suggestions
- add domain types, mappers, and response schemas
- add server helper for qualifying manual coding events
- add DB integration tests for signal capture and dedupe

### Phase 2: Admin review queue

Status: shipped

- add company-scoped query and mutations
- add Company Settings UI for listing, accepting, and dismissing suggestions
- create normal company default mapping rules from accepted suggestions
- add tests covering acceptance and dismissal behavior

### Phase 3: Professional polish

Status: shipped

- improve normalization heuristics
- add update-rule suggestions
- add cooldown tuning and better evidence presentation
- add smoke coverage for end-to-end suggestion review

## Resolved Decisions

The implementation:

1. Uses a preferred single match text, usually `item` first and then
   `description` fallback, because it will create cleaner rules.
2. Blocks acceptance when company default taxonomy does not yet support the
   target. This keeps rule governance explicit and avoids hidden taxonomy
   sprawl.
3. Uses a cooldown dismissal model rather than permanent suppression.
4. Creates a separate `update_rule` suggestion for repeated overrides of a
   known company rule and preserves that source rule for review.

## Shipped Safety Boundary

Company Auto-Categorise Rules continue to use deterministic contains-text
matching. V3 refines the proposed text and confidence evidence without adding a
second matching engine or rewriting historical transactions. Narrower rules
are inserted immediately before their broader source rule so existing rule
priority remains understandable.
