import type { Generated } from 'kysely';

// Minimal DB schema types for the Start + Kysely migration.
// Extend as you move more logic server-side.

export interface TxnTable {
  id: string;
  company_id: string;
  project_id: string;
  txn_date: string; // Postgres DATE (YYYY-MM-DD)
  item: string;
  description: string;
  amount_cents: number; // BIGINT in Postgres, represented as number in JS
  category_id: string | null;
  sub_category_id: string | null;
  created_at: Generated<string>; // TIMESTAMPTZ (ISO)
  updated_at: Generated<string>; // TIMESTAMPTZ (ISO)
}

export interface BudgetLineTable {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  allocated_cents: number;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CategoryTable {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SubCategoryTable {
  id: string;
  company_id: string;
  project_id: string;
  category_id: string;
  name: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface DB {
  txns: TxnTable;
  budget_lines: BudgetLineTable;
  categories: CategoryTable;
  sub_categories: SubCategoryTable;
}
