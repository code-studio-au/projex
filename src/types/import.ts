import type { CategoryId, SubCategoryId, TxnId } from "./ids";
import type { Txn } from "./domain";

/**
 * Import-only transaction shape (no company/project scoping yet).
 * `id` is optional because many CSVs don't provide a stable transaction ID.
 */
export type ImportTxn = Omit<Txn, "id" | "companyId" | "projectId"> & { id?: TxnId | string };

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
