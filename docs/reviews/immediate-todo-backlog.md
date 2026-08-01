# Immediate TODO Backlog

This is the current engineering implementation backlog from the
[31 July 2026 full repository review](full-repository-review-2026-07-31.md).
It contains only active follow-up work from that review.

The completed 29 July review, including its implementation decisions and
verification evidence, is retained in the
[documentation archive](archive/immediate-todo-backlog-2026-07-29-full-repository-review.md).
Product ideas and work awaiting business decisions remain in the
[product backlog](../product/product-backlog.md).

## Current execution status

| Item | Recommendation                                                                   | Priority     | Status   |
| ---: | -------------------------------------------------------------------------------- | ------------ | -------- |
|    1 | Move the single-company redirect into route loading                              | High         | Pending  |
|    2 | Consolidate the repeated `visiblePeriods` aggregates                             | Medium       | Pending  |
|    3 | Convert export polling and reversal-suggestion reads to TanStack Query           | Medium       | Pending  |
|    4 | Enforce TypeScript strictness ratchets and whole-repository coverage reporting   | Medium       | Complete |
|    5 | Run the network-enabled dependency freshness and framework-cohort review         | Medium       | Complete |
|    6 | Continue bundle-budget and browser-performance maintenance using measured traces | High/ongoing | Ongoing  |

The previous review's Item 11 is closed as a standalone backlog item. Its
bundle-headroom concern remains enforced through Item 6 as an ongoing
repository control.

## Recommended delivery sequence

1. Move the single-company redirect to route loading and add an SSR/browser
   regression proving that the landing UI is not painted first.
2. Consolidate the `visiblePeriods` aggregates and add a pure-model unit test.
3. Convert export job reads and polling to TanStack Query, then convert reversal
   suggestions using the same cancellation and error conventions.
4. Continue bundle and browser-performance maintenance using measured route
   budgets and traces.

Item 4 is complete. Whole-application coverage is reported alongside enforced
risk-domain thresholds. `noUncheckedIndexedAccess` has now been burned down and
promoted into the application, Node/server, and test TypeScript gates. CI
separately ratchets `exactOptionalPropertyTypes` findings by compilation
boundary so existing debt is visible and any baseline change requires explicit
review before that final flag is promoted. The first exact-optional cohort now
omits undefined route and search properties at navigation boundaries, reducing
the unique findings from 247 to 225 and the application/test project baselines
from 107/203 to 85/181. The second cohort now omits undefined properties from
validated taxonomy and transaction command DTOs, reducing the unique findings
from 225 to 202 and the Node/server baseline from 139 to 116. The third cohort
now omits absent transaction-import options and normalized identifiers across
preview, trusted commit, and planning boundaries, reducing the unique findings
from 202 to 185 and the application/Node/test baselines from 85/116/181 to
80/100/165.

Item 5 is complete. The
[1 August dependency freshness report](../dependencies/dependency-freshness-2026-08-01.md)
records the verified direct upgrades, exact framework/tooling holds, the
React Query WebKit regression hold, and the transitive provenance downgrade
that remains blocked without weakening the repository trust policy.

## Definition of done

Each follow-up must satisfy the
[review definition of done](full-repository-review-2026-07-31.md#definition-of-done-for-follow-up-changes),
including focused regression tests, the relevant application/database/CDK/smoke
lanes, bundle comparison for client-visible changes, documentation updates, and
an explicit security and rollback statement.
