# Budget Semantics

Projex uses the following financial terms consistently across project,
programme, company-summary, and export views.

## Canonical Measures

- **Project budget** is the approved full-project funding total. Date filters do
  not prorate or otherwise invent a period budget.
- **Allocated budget** is the amount assigned to category and subcategory
  budget lines.
- **Unallocated budget** is project budget minus allocated budget. It is a
  planning measure, not a spend measure.
- **Coded actuals** are budget-impacting transactions assigned to a valid
  project subcategory.
- **Uncoded exposure** is the signed value of budget-impacting, categorisable
  transactions without a valid subcategory.
- **Recorded spend** is coded actuals plus uncoded exposure. This is the
  conservative current spend position used for budget health.
- **Pending reversal amount** is coded spend expected to reverse where the
  offsetting transaction has not yet been recorded. Once a candidate reversal
  is imported, its signed value is already part of recorded spend and is not
  subtracted a second time while approval is pending.
- **Expected spend after pending reversals** is recorded spend minus pending
  reversal amount. It is shown as an expected scenario, not as confirmed spend.
- **Budget headroom** is project budget minus recorded spend.
- **Expected headroom after pending reversals** is project budget minus
  expected spend after pending reversals.
- **Allocation remaining** is a budget-line allocation minus its coded actuals.
  It must not be presented as project budget headroom.

Signed transaction amounts are preserved, so credits and approved reversals
reduce spend naturally. Budget allocations remain non-negative.

## Health States

Health is based on recorded spend, not the more optimistic pending-reversal
scenario.

- **Healthy**: below 75% of project budget with no uncoded exposure or pending
  reversals.
- **Watch**: at least 75% but below 90%, a project budget has not been set, or
  uncoded exposure or pending reversals still need resolution.
- **At risk**: at least 90% of project budget without exceeding it.
- **Over budget**: recorded spend exceeds project budget.

Allocation above the project budget is reported separately as a planning
warning. It does not alter spend health until transactions consume the budget.

## Period Filters And Forecasting

Year, quarter, and month filters restrict coded spend, uncoded exposure,
pending reversals, headroom, and health to transactions in that period. The
approved project budget and category allocations remain full-project totals.

Projex does not divide a project budget evenly across observed months or infer
a burn-rate forecast. Credible period forecasting requires explicit period or
milestone plans and remains future work.
