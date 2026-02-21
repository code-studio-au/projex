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

export type Company = {
  id: CompanyId;
  name: string;
  archived?: boolean;
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
};
export type SubCategory = {
  id: SubCategoryId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId: CategoryId;
  name: string;
};

export type Txn = {
  id: TxnId;
  companyId: CompanyId;
  projectId: ProjectId;
  date: string; // ISO yyyy-mm-dd
  item: string;
  description: string;
  amount: number;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
};

export type BudgetLine = {
  id: BudgetLineId;
  companyId: CompanyId;
  projectId: ProjectId;
  categoryId?: CategoryId;
  subCategoryId?: SubCategoryId;
  allocated: number;
};

export type RollupRow = BudgetLine & {
  categoryName: string;
  subCategoryName: string;
  actualByMonthKey: Record<string, number>;
  totalActual: number;
  remaining: number;
};
