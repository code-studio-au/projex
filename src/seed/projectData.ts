import type {
  BudgetLine,
  Category,
  CategoryId,
  CompanyId,
  ProjectId,
  SubCategory,
  SubCategoryId,
  Txn,
  TxnId,
} from '../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
} from '../types';
import {
  seedBudgets,
  seedCategories,
  seedSubCategories,
  seedTransactions,
} from './fixtures/concurSeedData';

export type SeedProjectDataSlice = {
  budgets: BudgetLine[];
  transactions: Txn[];
  categories: Category[];
  subCategories: SubCategory[];
};

const projectCompany: Record<ProjectId, CompanyId> = {
  [asProjectId('prj_acme_alpha')]: asCompanyId('co_acme'),
  [asProjectId('prj_acme_beta')]: asCompanyId('co_acme'),
  [asProjectId('prj_globex_ops')]: asCompanyId('co_globex'),
};

// Namespace helpers so IDs are globally unique across the entire app state
const catId = (projectId: ProjectId, baseId: string): CategoryId =>
  asCategoryId(`${projectId}:${baseId}`);
const subId = (projectId: ProjectId, baseId: string): SubCategoryId =>
  asSubCategoryId(`${projectId}:${baseId}`);
const budgetId = (projectId: ProjectId, baseId: string) =>
  asBudgetLineId(`${projectId}:${baseId}`);

// Deterministic assignment of a txn to a seed project.
// Keeps IDs Concur-like (no prefixing), but ensures each txn only appears in one project.
const pickProjectForTxn = (txnId: string): ProjectId => {
  // simple stable hash: sum char codes
  let s = 0;
  for (let i = 0; i < txnId.length; i++) s = (s + txnId.charCodeAt(i)) % 3;
  return s === 0
    ? asProjectId('prj_acme_alpha')
    : s === 1
      ? asProjectId('prj_acme_beta')
      : asProjectId('prj_globex_ops');
};

function makeProjectSlice(projectId: ProjectId): SeedProjectDataSlice {
  const companyId = projectCompany[projectId];

  const categories: Category[] = seedCategories.map((c) => ({
    ...c,
    id: catId(projectId, c.id as unknown as string),
    companyId,
    projectId,
  }));

  const subCategories: SubCategory[] = seedSubCategories.map((s) => ({
    ...s,
    id: subId(projectId, s.id as unknown as string),
    companyId,
    projectId,
    categoryId: catId(projectId, s.categoryId as unknown as string),
  }));

  const budgets: BudgetLine[] = seedBudgets.map((b) => ({
    ...b,
    id: budgetId(projectId, b.id as unknown as string),
    companyId,
    projectId,
    categoryId: catId(projectId, b.categoryId as unknown as string),
    subCategoryId: subId(projectId, b.subCategoryId as unknown as string),
  }));

  const transactions: Txn[] = seedTransactions
    .filter((t) => pickProjectForTxn(String(t.id)) === projectId)
    .map((t) => ({
      ...t,
      id: asTxnId(String(t.id)),
      companyId,
      projectId,
      categoryId: t.categoryId
        ? catId(projectId, t.categoryId as unknown as string)
        : undefined,
      subCategoryId: t.subCategoryId
        ? subId(projectId, t.subCategoryId as unknown as string)
        : undefined,
    }));

  return { budgets, transactions, categories, subCategories };
}

export const seedDataByProjectId: Record<ProjectId, SeedProjectDataSlice> = {
  [asProjectId('prj_acme_alpha')]: makeProjectSlice(
    asProjectId('prj_acme_alpha')
  ),
  [asProjectId('prj_acme_beta')]: makeProjectSlice(
    asProjectId('prj_acme_beta')
  ),
  [asProjectId('prj_globex_ops')]: makeProjectSlice(
    asProjectId('prj_globex_ops')
  ),
};
