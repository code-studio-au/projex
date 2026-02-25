import type {
  BudgetLineId,
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategoryId,
  TxnId,
  UserId,
} from './ids';
import type { CompanyRole, ProjectRole } from './roles';

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
  description?: string;
  currency: 'AUD' | 'USD' | 'EUR' | 'GBP';
  status: 'active' | 'archived';
  /** Visibility within the company. */
  visibility: ProjectVisibility;
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

export type Txn = {
  id: TxnId;
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
