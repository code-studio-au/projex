/**
 * Invariants to preserve across the client/API/server boundary.
 *
 * These should be backed by DB constraints (unique indexes / foreign keys)
 * and/or enforced in server functions.
 */

export const INVARIANTS: readonly string[] = [
  // IDs
  'Domain/public IDs are branded strings (e.g. Txn.id) used by the client/API boundary.',
  'Transactions also have a server-managed internal BIGINT primary key (Txn.internalId in API shape as decimal string).',
  'Imported transaction references are stored as Txn.externalId (nullable text) for dedupe/audit.',

  // Money
  'All money fields are stored in cents (minor units) as integers.',
  'Txn.amountCents is signed: positive values increase spend/cost and negative values reduce net actuals as credits/refunds/reversals.',
  'Budget allocations remain non-negative approved spend capacity.',
  'Only transactions with Txn.budgetImpact=true contribute to budget actuals and uncoded spend exposure.',
  'Transactions with Txn.categorisable=false cannot carry category, subcategory, mapping rule, or pending-coding metadata.',
  'Project.allowTxnTransfers is the server-enforced source-project gate for moving transactions to another project and defaults to false.',

  // Dates & time
  'Txn.date is YYYY-MM-DD and maps to Postgres DATE.',
  'createdAt/updatedAt are ISO strings (UTC) and map to Postgres TIMESTAMPTZ.',
  'deactivatedAt is an ISO string (UTC) set when a company or project is deactivated.',

  // Uniqueness
  'Transaction public IDs are unique per project.',
  'Transaction external IDs are unique per project when present (NULL/empty allowed).',
  'Budget lines are unique per (projectId, subCategoryId).',
  'Company membership is unique per (companyId, userId).',
  'Project membership is unique per (projectId, userId).',
  'Category names are unique per project (case-insensitive).',
  'Subcategory names are unique per (projectId, categoryId) (case-insensitive).',

  // Authorization
  'All write operations validate session and authorize against company/project roles on the server.',
  'Unexpected server exceptions use a generic public message; original causes remain server-side in request-ID logs.',
];
