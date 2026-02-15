export type Id = string;

export type Company = {
  id: Id;
  name: string;
};

export type Project = {
  id: Id;
  companyId: Id;
  name: string;
  currency: "AUD" | "USD" | "EUR" | "GBP";
  status: "active" | "archived";
};

export type User = {
  id: Id;
  email: string;
  name: string;
};

export type CompanyRole = "superadmin" | "admin" | "executive" | "management" | "member";
export type ProjectRole = "owner" | "lead" | "member" | "viewer";

export type CompanyMembership = {
  companyId: Id;
  userId: Id;
  role: CompanyRole;
};

export type ProjectMembership = {
  projectId: Id;
  userId: Id;
  role: ProjectRole;
};

export type Category = { id: Id; companyId: Id; projectId: Id; name: string };
export type SubCategory = { id: Id; companyId: Id; projectId: Id; categoryId: Id; name: string };

export type Txn = {
  id: Id;
  companyId: Id;
  projectId: Id;
  date: string; // ISO yyyy-mm-dd
  item: string;
  description: string;
  amount: number;
  categoryId?: Id;
  subCategoryId?: Id;
};

export type BudgetLine = {
  id: Id;
  companyId: Id;
  projectId: Id;
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

export type ImportTxn = Omit<Txn, "id" | "companyId" | "projectId"> & { id?: Id };
