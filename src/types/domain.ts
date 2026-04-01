import type {
  BudgetLineId,
  CategoryId,
  CompanyId,
  CompanyDefaultCategoryId,
  CompanyDefaultSubCategoryId,
  ProjectId,
  SubCategoryId,
  TxnId,
  UserId,
} from './ids.ts';
import type { CompanyRole, ProjectRole } from './roles.ts';

export type CompanyStatus = 'active' | 'deactivated';

export type Company = {
  id: CompanyId;
  name: string;
  status: CompanyStatus;
  /** Audit timestamps as ISO strings (UTC). */
  deactivatedAt?: string;
};

export type ProjectVisibility = 'company' | 'private';

export type Project = {
  id: ProjectId;
  companyId: CompanyId;
  name: string;
  budgetTotalCents: number;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  /** Audit timestamp as ISO string (UTC). */
  deactivatedAt?: string;
  /** Visibility within the company. */
  visibility: ProjectVisibility;
  /** Whether global superadmin support access is permitted for this project. */
  allowSuperadminAccess: boolean;
};

export type User = {
  id: UserId;
  email: string;
  name: string;
  disabled?: boolean;
};

export type CompanyMembership = {
  companyId: CompanyId;
  userId: UserId;
  role: CompanyRole;
};

export type ProjectMembership = {
  projectId: ProjectId;
  userId: UserId;
  role: ProjectRole;
};

export type Category = {
  id: CategoryId;
  companyId: CompanyId;
  projectId: ProjectId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};
export type SubCategory = {
  id: SubCategoryId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId: CategoryId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyDefaultCategory = {
  id: CompanyDefaultCategoryId;
  companyId: CompanyId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyDefaultSubCategory = {
  id: CompanyDefaultSubCategoryId;
  companyId: CompanyId;
  companyDefaultCategoryId: CompanyDefaultCategoryId;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Txn = {
  id: TxnId;
  /**
   * Internal DB PK (BIGINT) for server mode.
   * Represented as decimal string to avoid bigint JSON/localStorage issues.
   */
  internalId?: string;
  /** External/imported transaction reference used for dedupe + audit. */
  externalId?: string;
  companyId: CompanyId;
  projectId: ProjectId;
  date: string; // ISO yyyy-mm-dd
  item: string;
  description: string;
  /** Monetary amount in minor units (e.g. cents). Expenses are positive. */
  amountCents: number;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  /** Audit timestamps as ISO strings (UTC). */
  createdAt?: string;
  updatedAt?: string;
};

export type BudgetLine = {
  id: BudgetLineId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  /** Monetary amount in minor units (e.g. cents). */
  allocatedCents: number;
  /** Audit timestamps as ISO strings (UTC). */
  createdAt?: string;
  updatedAt?: string;
};

export type RollupRow = BudgetLine & {
  categoryName: string;
  subCategoryName: string;
  /** Monetary amounts in minor units (e.g. cents). */
  actualByMonthKey: Record<string, number>;
  totalActualCents: number;
  remainingCents: number;
};
