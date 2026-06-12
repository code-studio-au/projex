import type { Brand } from './brand.ts';
import { brand } from './brand.ts';

/**
 * Branded IDs: compile-time safety for foreign-key-like strings.
 * Runtime: still plain strings.
 */
export type CompanyId = Brand<string, 'CompanyId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type UserId = Brand<string, 'UserId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type SubCategoryId = Brand<string, 'SubCategoryId'>;
export type CompanyDefaultCategoryId = Brand<
  string,
  'CompanyDefaultCategoryId'
>;
export type CompanyDefaultSubCategoryId = Brand<
  string,
  'CompanyDefaultSubCategoryId'
>;
export type CompanyDefaultMappingRuleId = Brand<
  string,
  'CompanyDefaultMappingRuleId'
>;
export type ImportRuleId = Brand<string, 'ImportRuleId'>;
export type ImportBatchId = Brand<string, 'ImportBatchId'>;
export type ImportCandidateId = Brand<string, 'ImportCandidateId'>;
export type CompanyExportJobId = Brand<string, 'CompanyExportJobId'>;
export type TxnId = Brand<string, 'TxnId'>;
export type TxnCommentId = Brand<string, 'TxnCommentId'>;
export type BudgetLineId = Brand<string, 'BudgetLineId'>;

/** Prefer specific ID types; this exists only for cases where a truly-generic ID is required. */
export type AnyId =
  | CompanyId
  | ProjectId
  | UserId
  | CategoryId
  | SubCategoryId
  | CompanyDefaultCategoryId
  | CompanyDefaultSubCategoryId
  | CompanyDefaultMappingRuleId
  | ImportRuleId
  | ImportBatchId
  | ImportCandidateId
  | CompanyExportJobId
  | TxnId
  | TxnCommentId
  | BudgetLineId;

// --- cast helpers (no runtime validation) ---
export const asCompanyId = (v: string) => brand<string, 'CompanyId'>(v);
export const asProjectId = (v: string) => brand<string, 'ProjectId'>(v);
export const asUserId = (v: string) => brand<string, 'UserId'>(v);
export const asCategoryId = (v: string) => brand<string, 'CategoryId'>(v);
export const asSubCategoryId = (v: string) => brand<string, 'SubCategoryId'>(v);
export const asCompanyDefaultCategoryId = (v: string) =>
  brand<string, 'CompanyDefaultCategoryId'>(v);
export const asCompanyDefaultSubCategoryId = (v: string) =>
  brand<string, 'CompanyDefaultSubCategoryId'>(v);
export const asCompanyDefaultMappingRuleId = (v: string) =>
  brand<string, 'CompanyDefaultMappingRuleId'>(v);
export const asImportRuleId = (v: string) => brand<string, 'ImportRuleId'>(v);
export const asImportBatchId = (v: string) => brand<string, 'ImportBatchId'>(v);
export const asImportCandidateId = (v: string) =>
  brand<string, 'ImportCandidateId'>(v);
export const asCompanyExportJobId = (v: string) =>
  brand<string, 'CompanyExportJobId'>(v);
export const asTxnId = (v: string) => brand<string, 'TxnId'>(v);
export const asTxnCommentId = (v: string) => brand<string, 'TxnCommentId'>(v);
export const asBudgetLineId = (v: string) => brand<string, 'BudgetLineId'>(v);
