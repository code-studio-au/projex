import type { CategoryId, SubCategoryId, TxnId } from './ids.ts';
import type { Txn } from './domain.ts';

/**
 * Import-only transaction shape (no company/project scoping yet).
 * `externalId` is optional because many CSVs don't provide a stable source ID.
 * `id` is optional and may be synthesized later for local/client identity.
 */
export type ImportTxn = Omit<Txn, 'id' | 'internalId' | 'companyId' | 'projectId'> & {
  id?: TxnId | string;
  externalId?: string;
};

/**
 * Import transaction with raw taxonomy names still attached.
 * This avoids `any` and `@ts-expect-error` in the CSV pipeline.
 */
export type ImportTxnWithTaxonomy = ImportTxn & {
  category?: string;
  subcategory?: string;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
};
