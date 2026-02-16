import type { Id, BudgetLine, Category, SubCategory, Txn } from "../types";
import { seedBudgets, seedCategories, seedSubCategories, seedTransactions } from "./fixtures/concurSeedData";

export type SeedProjectDataSlice = {
  budgets: BudgetLine[];
  transactions: Txn[];
  categories: Category[];
  subCategories: SubCategory[];
};

const projectCompany: Record<Id, Id> = {
  prj_acme_alpha: "co_acme",
  prj_acme_beta: "co_acme",
  prj_globex_ops: "co_globex",
};

// Namespace helpers so IDs are globally unique across the entire app state
const catId = (projectId: Id, baseId: Id) => `${projectId}:${baseId}`;
const subId = (projectId: Id, baseId: Id) => `${projectId}:${baseId}`;
const budgetId = (projectId: Id, baseId: Id) => `${projectId}:${baseId}`;

// Deterministic assignment of a txn to a seed project.
// Keeps IDs Concur-like (no prefixing), but ensures each txn only appears in one project.
const pickProjectForTxn = (txnId: string): Id => {
  // simple stable hash: sum char codes
  let s = 0;
  for (let i = 0; i < txnId.length; i++) s = (s + txnId.charCodeAt(i)) % 3;
  return s === 0 ? "prj_acme_alpha" : s === 1 ? "prj_acme_beta" : "prj_globex_ops";
};

const makeProjectSlice = (projectId: Id): SeedProjectDataSlice => {
  const companyId = projectCompany[projectId];

  const categories: Category[] = seedCategories.map((c) => ({
    id: catId(projectId, c.id),
    companyId,
    projectId,
    name: c.name,
  }));

  const subCategories: SubCategory[] = seedSubCategories.map((s) => ({
    id: subId(projectId, s.id),
    companyId,
    projectId,
    categoryId: catId(projectId, s.categoryId),
    name: s.name,
  }));

  // Budgets: replicate the template budget lines per project (IDs namespaced)
  const budgets: BudgetLine[] = seedBudgets.map((b) => ({
    id: budgetId(projectId, b.id),
    companyId,
    projectId,
    categoryId: catId(projectId, b.categoryId),
    subCategoryId: subId(projectId, b.subCategoryId),
    allocated: b.allocated,
  }));

  // Transactions: assign deterministically to projects; keep some uncoded.
  const transactions: Txn[] = seedTransactions
    .filter((t) => pickProjectForTxn(t.id) === projectId)
    .map((t) => ({
      id: t.id, // keep Concur-style ID
      companyId,
      projectId,
      date: t.date,
      item: t.item,
      description: t.description,
      amount: t.amount,
      categoryId: t.categoryId ? catId(projectId, t.categoryId) : undefined,
      subCategoryId: t.subCategoryId ? subId(projectId, t.subCategoryId) : undefined,
    }));

  return { budgets, transactions, categories, subCategories };
};

export const seedDataByProjectId: Record<Id, SeedProjectDataSlice> = {
  prj_acme_alpha: makeProjectSlice("prj_acme_alpha"),
  prj_acme_beta: makeProjectSlice("prj_acme_beta"),
  prj_globex_ops: makeProjectSlice("prj_globex_ops"),
};
