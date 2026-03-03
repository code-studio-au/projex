/**
 * Invariants to preserve across adapters (localStorage now, Postgres later).
 *
 * These should become DB constraints (unique indexes / foreign keys) and/or
 * enforced in server functions.
 */

export const INVARIANTS: readonly string[] = [
  // IDs
  'Domain/public IDs are branded strings (e.g. Txn.id) used by the client/API boundary.',
  'Transactions also have a server-managed internal BIGINT primary key (Txn.internalId in API shape as decimal string).',
  'Imported transaction references are stored as Txn.externalId (nullable text) for dedupe/audit.',

  // Money
  'All money fields are stored in cents (minor units) as integers.',
  'Txn.amountCents is always positive for expenses; refunds/credits should be modeled explicitly if needed.',

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
];
