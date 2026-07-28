import { z } from 'zod';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyExportJobId,
  asCompanyId,
  asImportBatchId,
  asProjectId,
  asSubCategoryId,
  asTxnCommentId,
  asTxnId,
  asTxnUnlockRequestId,
  asUserId,
} from '../types/index.ts';
import { idSchema } from './schemas.ts';

export const companyIdResponseSchema = idSchema.transform(asCompanyId);
export const projectIdResponseSchema = idSchema.transform(asProjectId);
export const userIdResponseSchema = idSchema.transform(asUserId);
export const categoryIdResponseSchema = idSchema.transform(asCategoryId);
export const subCategoryIdResponseSchema = idSchema.transform(asSubCategoryId);
export const budgetLineIdResponseSchema = idSchema.transform(asBudgetLineId);
export const txnUnlockRequestIdResponseSchema =
  idSchema.transform(asTxnUnlockRequestId);
export const mappingRuleIdResponseSchema = idSchema.transform(
  asCompanyDefaultMappingRuleId
);
export const importBatchIdResponseSchema = idSchema.transform(asImportBatchId);
export const txnIdResponseSchema = idSchema.transform(asTxnId);
export const txnCommentIdResponseSchema = idSchema.transform(asTxnCommentId);
export const companyExportJobIdResponseSchema =
  idSchema.transform(asCompanyExportJobId);
export const isoTimestampResponseSchema = z.iso.datetime({ offset: true });
export const optionalIsoTimestampResponseSchema =
  isoTimestampResponseSchema.optional();
export const companyRoleResponseSchema = z.enum([
  'admin',
  'executive',
  'management',
  'member',
]);
export const projectTypeResponseSchema = z.enum(['project', 'programme']);
export const projectStandardOriginScopeResponseSchema = z.enum([
  'company',
  'project',
]);
export const projectStandardSyncStatusResponseSchema = z.enum([
  'local',
  'inherited',
  'overridden',
  'detached',
]);
