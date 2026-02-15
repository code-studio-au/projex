import type { Id, BudgetLine, Category, SubCategory, Txn } from "../types";

export type SeedProjectDataSlice = {
  budgets: BudgetLine[];
  transactions: Txn[];
  categories: Category[];
  subCategories: SubCategory[];
};

export const seedDataByProjectId: Record<Id, SeedProjectDataSlice> = {
  prj_acme_alpha: { transactions: [], budgets: [], categories: [], subCategories: [] },
  prj_acme_beta: { transactions: [], budgets: [], categories: [], subCategories: [] },
  prj_globex_ops: { transactions: [], budgets: [], categories: [], subCategories: [] },
};
