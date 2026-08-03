# Immediate TODO Backlog

This archived backlog records the engineering implementation follow-up from the
[31 July 2026 full repository review](full-repository-review-2026-07-31.md).
It is retained as point-in-time evidence and is no longer an active work queue.

The completed 29 July review, including its implementation decisions and
verification evidence, is retained in the
[documentation archive](immediate-todo-backlog-2026-07-29-full-repository-review.md).
Product ideas and work awaiting business decisions remain in the
[product backlog](../../product/product-backlog.md).

## Status at archival

| Item | Recommendation                                                                   | Priority     | Status   |
| ---: | -------------------------------------------------------------------------------- | ------------ | -------- |
|    1 | Move the single-company redirect into route loading                              | High         | Complete |
|    2 | Consolidate the repeated `visiblePeriods` aggregates                             | Medium       | Complete |
|    3 | Convert export polling and reversal-suggestion reads to TanStack Query           | Medium       | Complete |
|    4 | Enforce TypeScript strictness ratchets and whole-repository coverage reporting   | Medium       | Complete |
|    5 | Run the network-enabled dependency freshness and framework-cohort review         | Medium       | Complete |
|    6 | Continue bundle-budget and browser-performance maintenance using measured traces | High/ongoing | Ongoing  |

The previous review's Item 11 is closed as a standalone backlog item. Its
bundle-headroom concern remains enforced through Item 6 as an ongoing
repository control.

## Retained maintenance direction

1. Continue bundle and browser-performance maintenance using measured route
   budgets and traces.

Items 1 and 2 are complete. The companies route now redirects a regular user
with one company membership during route loading, before the landing page can
render. The browser smoke suite asserts both the destination SSR response and
the absence of the landing-page heading. Project transaction workflow totals
now filter and aggregate period summaries in one model traversal, backed by a
pure unit test.

Item 3 is complete. Export job reads and polling are owned by TanStack Query
with user/company/job-scoped keys, request cancellation through the query
`AbortSignal`, cache seeding after creation, and polling that stops for terminal
states. Reversal-suggestion reads now use the same query ownership, scoped keys,
response validation, cancellation, and error conventions. The modal keeps only
the user's selected candidate and action state locally.

Item 4 is complete. Whole-application coverage is reported alongside enforced
risk-domain thresholds. `noUncheckedIndexedAccess` has now been burned down and
promoted into the application, Node/server, and test TypeScript gates.
`exactOptionalPropertyTypes` has also been burned down from 247 unique findings
to zero and promoted into all three enforced compilation boundaries. Domain,
API, persistence, validation, query, route, component, and test-fixture objects
now omit absent optional keys instead of representing absence with explicit
`undefined`. The strictness report retains zero baselines for both flags so any
regression fails CI.

Item 5 is complete. The
[1 August dependency freshness report](../../dependencies/dependency-freshness-2026-08-01.md)
records the verified direct upgrades, exact framework/tooling holds, the
React Query WebKit regression hold, and the transitive provenance downgrade
that remains blocked without weakening the repository trust policy.

## Definition of done

Each follow-up must satisfy the
[review definition of done](full-repository-review-2026-07-31.md#definition-of-done-for-follow-up-changes),
including focused regression tests, the relevant application/database/CDK/smoke
lanes, bundle comparison for client-visible changes, documentation updates, and
an explicit security and rollback statement.
