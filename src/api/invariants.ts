/**
 * Invariants to preserve across adapters (localStorage now, Postgres later).
 *
 * These should become DB constraints (unique indexes / foreign keys) and/or
 * enforced in server functions.
 */

export const INVARIANTS: readonly string[] = [
  // IDs
  'All IDs are branded strings generated client-side; server may also generate but must return branded IDs.',

  // Money
  'All money fields are stored in cents (minor units) as integers.',
  'Txn.amountCents is always positive for expenses; refunds/credits should be modeled explicitly if needed.',

  // Dates & time
  'Txn.date is YYYY-MM-DD and maps to Postgres DATE.',
  'createdAt/updatedAt are ISO strings (UTC) and map to Postgres TIMESTAMPTZ.',

  // Uniqueness
  'Budget lines are unique per (projectId, subCategoryId).',
  'Company membership is unique per (companyId, userId).',
  'Project membership is unique per (projectId, userId).',
  'Category names are unique per project (case-insensitive).',
  'Subcategory names are unique per (projectId, categoryId) (case-insensitive).',

  // Authorization
  'All write operations validate session and authorize against company/project roles on the server.',
];
