export type Id = string;

export type Category = { id: Id; name: string };
export type SubCategory = { id: Id; categoryId: Id; name: string };

export type Txn = {
  id: Id;
  date: string; // ISO yyyy-mm-dd
  item: string;
  description: string;
  amount: number;
  categoryId?: Id;
  subCategoryId?: Id;
};

export type BudgetLine = {
  id: Id;
  categoryId: Id;
  subCategoryId: Id;
  allocated: number;
};

export type RollupRow = BudgetLine & {
  categoryName: string;
  subCategoryName: string;
  actualByMonthKey: Record<string, number>;
  totalActual: number;
  remaining: number;
};

export type ImportTxn = Omit<Txn, "id"> & { id?: Id };
