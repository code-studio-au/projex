import type {
  Company,
  CompanyId,
  CompanyMembership,
  CompanyRole,
  ProjectMembership,
  ProjectRole,
  Project,
  ProjectId,
  ProjectVisibility,
  BudgetLine,
  Category,
  SubCategory,
  Txn,
  TxnId,
  User,
  UserId,
} from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asProjectId,
  asSubCategoryId,
} from '../../types';
import { can, type Action } from '../../utils/auth';
import { uid } from '../../utils/id';
import {
  buildSeedState,
  PROJEX_STATE_KEY,
  type PersistedStateV1,
} from '../../seed';
import { getPrimaryCompanyForUser } from '../../store/access';

import type {
  BudgetCreateInput,
  BudgetUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyUpdateInput,
  CsvImportMode,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjexApi,
  Session,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
  TxnCreateInput,
  TxnUpdateInput,
} from '../contract';

const SESSION_KEY = 'projex_session_v1';

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function ensureState(): PersistedStateV1 {
  const existing = readJson<PersistedStateV1>(PROJEX_STATE_KEY);
  if (existing) {
    // Lightweight schema migration for local-first development.
    // Keep this minimal so swapping to TanStack Start later is mechanical.
    let changed = false;

    const projects: Project[] = existing.projects.map((p) => {
      const rawVis = (p as unknown as { visibility?: unknown }).visibility;
      const visibility: ProjectVisibility | null =
        rawVis === 'company' || rawVis === 'private'
          ? (rawVis as ProjectVisibility)
          : null;

      // Default + repair invalid values.
      if (!visibility) {
        changed = true;
        return { ...p, visibility: 'company' };
      }

      // Ensure the resulting array remains strongly typed as Project[].
      return { ...p, visibility };
    });

    const next: PersistedStateV1 = changed ? { ...existing, projects } : existing;
    if (changed) writeJson(PROJEX_STATE_KEY, next);
    return next;
  }
  const seed = buildSeedState();
  writeJson(PROJEX_STATE_KEY, seed);
  return seed;
}

function writeState(next: PersistedStateV1) {
  writeJson(PROJEX_STATE_KEY, next);
}

function readSession(): Session | null {
  return readJson<Session>(SESSION_KEY);
}

function writeSession(next: Session | null) {
  if (typeof window === 'undefined') return;
  if (!next) window.localStorage.removeItem(SESSION_KEY);
  else writeJson(SESSION_KEY, next);
}

export class LocalApi implements ProjexApi {
  private requireSession(): Session {
    const s = readSession();
    if (!s) throw new Error('Not authenticated');
    return s;
  }

  private isSuperadmin(userId: UserId, st: PersistedStateV1) {
    // Local-mode simplification: if the user holds superadmin in ANY company,
    // we treat them as a global superadmin.
    return st.companyMemberships.some((m) => m.userId === userId && m.role === 'superadmin');
  }

  private assertCan(action: Action, companyId: CompanyId, projectId?: ProjectId) {
    const st = ensureState();
    const { userId } = this.requireSession();
    const ok = can({
      userId,
      companyId,
      projectId,
      action,
      companyMemberships: st.companyMemberships,
      projectMemberships: st.projectMemberships,
    });
    if (!ok) throw new Error('Forbidden');
  }
  async getSession(): Promise<Session | null> {
    return readSession();
  }

  async loginAs(userId: UserId): Promise<Session> {
    // validate user exists
    const st = ensureState();
    const found = st.users.find((u) => u.id === userId);
    if (!found) throw new Error('Unknown user');
    const session: Session = { userId };
    writeSession(session);
    return session;
  }

  async logout(): Promise<void> {
    writeSession(null);
  }

  async listUsers(): Promise<User[]> {
    return ensureState().users;
  }

  async listCompanies(): Promise<Company[]> {
    const st = ensureState();
    const s = readSession();
    if (!s) return [];
    if (this.isSuperadmin(s.userId, st)) return st.companies;
    const allowed = new Set(
      st.companyMemberships.filter((m) => m.userId === s.userId).map((m) => m.companyId)
    );
    return st.companies.filter((c) => allowed.has(c.id));
  }

  async getCompany(companyId: CompanyId): Promise<Company | null> {
    const st = ensureState();
    const s = readSession();
    if (!s) return null;
    if (!this.isSuperadmin(s.userId, st)) {
      const isMember = st.companyMemberships.some(
        (m) => m.companyId === companyId && m.userId === s.userId
      );
      if (!isMember) return null;
    }
    return st.companies.find((c) => c.id === companyId) ?? null;
  }

  async listProjects(companyId: CompanyId): Promise<Project[]> {
    const st = ensureState();
    const s = readSession();
    if (!s) return [];

    const all = st.projects.filter((p) => p.companyId === companyId);
    if (this.isSuperadmin(s.userId, st)) return all;

    // Exec/admin can see all projects in the company.
    const cRole = st.companyMemberships.find(
      (m) => m.companyId === companyId && m.userId === s.userId
    )?.role;
    if (cRole === 'admin' || cRole === 'executive') return all;

    // Option A: company members can SEE (list) all company-visible projects,
    // but can only OPEN (view) projects they're a member of (enforced by getProject + other endpoints).
    const isCompanyMember = st.companyMemberships.some(
      (m) => m.companyId === companyId && m.userId === s.userId
    );

    const mine = new Set(
      st.projectMemberships.filter((m) => m.userId === s.userId).map((m) => m.projectId)
    );

    return all.filter((p) => {
      if (mine.has(p.id)) return true;
      if (!isCompanyMember) return false;
      return p.visibility === 'company';
    });
  }

  async getProject(projectId: ProjectId): Promise<Project | null> {
    const st = ensureState();
    const s = readSession();
    if (!s) return null;
    const p = st.projects.find((x) => x.id === projectId) ?? null;
    if (!p) return null;
    // Enforce view permissions.
    this.assertCan('project:view', p.companyId, p.id);
    return p;
  }

  async listTransactions(projectId: ProjectId): Promise<Txn[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    return slice?.transactions ?? [];
  }

  async createTransaction(projectId: ProjectId, input: TxnCreateInput): Promise<Txn> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const next: Txn = {
      ...input,
      id: (input.id ?? uid('txn')) as TxnId,
    } as Txn;
    const nextState: PersistedStateV1 = {
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, transactions: [...slice.transactions, next] },
      },
    };
    writeState(nextState);
    return next;
  }

  async updateTransaction(projectId: ProjectId, input: TxnUpdateInput): Promise<Txn> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const idx = slice.transactions.findIndex((t) => t.id === input.id);
    if (idx < 0) throw new Error('Unknown transaction');
    const updated: Txn = { ...slice.transactions[idx], ...input } as Txn;

    const nextTxns = slice.transactions.slice();
    nextTxns[idx] = updated;

    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, transactions: nextTxns },
      },
    });
    return updated;
  }

  async deleteTransaction(projectId: ProjectId, txnId: TxnId): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: {
          ...slice,
          transactions: slice.transactions.filter((t) => t.id !== txnId),
        },
      },
    });
  }

  async listCompanyMemberships(companyId: CompanyId): Promise<CompanyMembership[]> {
    const st = ensureState();
    // only admins/execs/superadmin can manage members; regular members can view company but not list members
    // For simplicity in local mode we allow all company members to read memberships.
    this.requireSession();
    return st.companyMemberships.filter((m) => m.companyId === companyId);
  }

  async listProjectMemberships(projectId: ProjectId): Promise<ProjectMembership[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.projectMemberships.filter((m) => m.projectId === projectId);
  }

  async upsertCompanyMembership(
    companyId: CompanyId,
    userId: UserId,
    role: CompanyRole
  ): Promise<CompanyMembership> {
    const st = ensureState();
    const idx = st.companyMemberships.findIndex(
      (m) => m.companyId === companyId && m.userId === userId
    );
    const next: CompanyMembership = { companyId, userId, role };
    const companyMemberships = st.companyMemberships.slice();
    if (idx >= 0) companyMemberships[idx] = next;
    else companyMemberships.push(next);
    writeState({ ...st, companyMemberships });
    return next;
  }

  async deleteCompanyMembership(companyId: CompanyId, userId: UserId): Promise<void> {
    const st = ensureState();
    writeState({
      ...st,
      companyMemberships: st.companyMemberships.filter(
        (m) => !(m.companyId === companyId && m.userId === userId)
      ),
    });
  }

  async upsertProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ): Promise<ProjectMembership> {
    const st = ensureState();
    const idx = st.projectMemberships.findIndex(
      (m) => m.projectId === projectId && m.userId === userId
    );
    const next: ProjectMembership = { projectId, userId, role };
    const projectMemberships = st.projectMemberships.slice();
    if (idx >= 0) projectMemberships[idx] = next;
    else projectMemberships.push(next);
    writeState({ ...st, projectMemberships });
    return next;
  }

  async deleteProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ): Promise<void> {
    const st = ensureState();
    writeState({
      ...st,
      projectMemberships: st.projectMemberships.filter(
        (m) => !(m.projectId === projectId && m.userId === userId && m.role === role)
      ),
    });
  }

  async listCategories(projectId: ProjectId): Promise<Category[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.categories ?? [];
  }

  async listSubCategories(projectId: ProjectId): Promise<SubCategory[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.subCategories ?? [];
  }

  async createCategory(projectId: ProjectId, input: CategoryCreateInput): Promise<Category> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const id = (input.id ?? asCategoryId(uid('cat'))) as Category['id'];
    const next: Category = { ...input, id } as Category;
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, categories: [...slice.categories, next] },
      },
    });
    return next;
  }

  async updateCategory(projectId: ProjectId, input: CategoryUpdateInput): Promise<Category> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const idx = slice.categories.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new Error('Unknown category');
    const updated: Category = { ...slice.categories[idx], ...input } as Category;
    const categories = slice.categories.slice();
    categories[idx] = updated;
    writeState({
      ...st,
      dataByProjectId: { ...st.dataByProjectId, [projectId]: { ...slice, categories } },
    });
    return updated;
  }

  async deleteCategory(projectId: ProjectId, categoryId: Category['id']): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const remainingCats = slice.categories.filter((c) => c.id !== categoryId);
    const remainingSubs = slice.subCategories.filter((s) => s.categoryId !== categoryId);
    // Clear references on budgets + transactions
    const budgets: BudgetLine[] = slice.budgets.map((b) =>
      b.categoryId === categoryId
        ? ({ ...b, categoryId: undefined, subCategoryId: undefined } as BudgetLine)
        : b
    );
    const transactions: Txn[] = slice.transactions.map((t) =>
      t.categoryId === categoryId
        ? ({ ...t, categoryId: undefined, subCategoryId: undefined } as Txn)
        : t
    );
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: {
          ...slice,
          categories: remainingCats,
          subCategories: remainingSubs,
          budgets,
          transactions,
        },
      },
    });
  }

  async createSubCategory(
    projectId: ProjectId,
    input: SubCategoryCreateInput
  ): Promise<SubCategory> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const id = (input.id ?? asSubCategoryId(uid('sub'))) as SubCategory['id'];
    const next: SubCategory = { ...input, id } as SubCategory;
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, subCategories: [...slice.subCategories, next] },
      },
    });
    return next;
  }

  async updateSubCategory(
    projectId: ProjectId,
    input: SubCategoryUpdateInput
  ): Promise<SubCategory> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const idx = slice.subCategories.findIndex((s) => s.id === input.id);
    if (idx < 0) throw new Error('Unknown subcategory');
    const updated: SubCategory = { ...slice.subCategories[idx], ...input } as SubCategory;
    const subCategories = slice.subCategories.slice();
    subCategories[idx] = updated;
    writeState({
      ...st,
      dataByProjectId: { ...st.dataByProjectId, [projectId]: { ...slice, subCategories } },
    });
    return updated;
  }

  async deleteSubCategory(projectId: ProjectId, subCategoryId: SubCategory['id']): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const subCategories = slice.subCategories.filter((s) => s.id !== subCategoryId);
    const budgets = slice.budgets.map((b) =>
      b.subCategoryId === subCategoryId
        ? ({ ...b, subCategoryId: undefined } as BudgetLine)
        : b
    );
    const transactions = slice.transactions.map((t) =>
      t.subCategoryId === subCategoryId
        ? ({ ...t, subCategoryId: undefined } as Txn)
        : t
    );
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, subCategories, budgets, transactions },
      },
    });
  }

  async listBudgets(projectId: ProjectId): Promise<BudgetLine[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.budgets ?? [];
  }

  async createBudget(projectId: ProjectId, input: BudgetCreateInput): Promise<BudgetLine> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const id = (input.id ?? asBudgetLineId(uid('bud'))) as BudgetLine['id'];
    const next: BudgetLine = { ...input, id } as BudgetLine;
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, budgets: [...slice.budgets, next] },
      },
    });
    return next;
  }

  async updateBudget(projectId: ProjectId, input: BudgetUpdateInput): Promise<BudgetLine> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const idx = slice.budgets.findIndex((b) => b.id === input.id);
    if (idx < 0) throw new Error('Unknown budget');
    const updated: BudgetLine = { ...slice.budgets[idx], ...input } as BudgetLine;
    const budgets = slice.budgets.slice();
    budgets[idx] = updated;
    writeState({
      ...st,
      dataByProjectId: { ...st.dataByProjectId, [projectId]: { ...slice, budgets } },
    });
    return updated;
  }

  async deleteBudget(projectId: ProjectId, budgetId: BudgetLine['id']): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, budgets: slice.budgets.filter((b) => b.id !== budgetId) },
      },
    });
  }

  async createProject(companyId: CompanyId, input: ProjectCreateInput): Promise<Project> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const id = input.id ?? asProjectId(uid('prj'));
    const next: Project = {
      id,
      companyId,
      name: input.name,
      currency: 'AUD',
      status: 'active',
      visibility: 'private',
    };
    // Start with an empty slice (taxonomy/budgets/txns can be added later).
    const slice = st.dataByProjectId[id] ?? {
      budgets: [],
      transactions: [],
      categories: [],
      subCategories: [],
    };

    writeState({
      ...st,
      projects: [...st.projects, next],
      dataByProjectId: { ...st.dataByProjectId, [id]: slice },
    });
    return next;
  }

  async updateProject(input: ProjectUpdateInput): Promise<Project> {
    const st = ensureState();
    const idx = st.projects.findIndex((p) => p.id === input.id);
    if (idx < 0) throw new Error('Unknown project');
    this.assertCan('project:edit', st.projects[idx].companyId, st.projects[idx].id);
    const updated: Project = { ...st.projects[idx], ...input } as Project;
    const projects = st.projects.slice();
    projects[idx] = updated;
    writeState({ ...st, projects });
    return updated;
  }

  async updateCompany(input: CompanyUpdateInput): Promise<Company> {
    const st = ensureState();
    const idx = st.companies.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new Error('Unknown company');
    this.assertCan('company:edit', st.companies[idx].id);
    const updated: Company = { ...st.companies[idx], ...input } as Company;
    const companies = st.companies.slice();
    companies[idx] = updated;
    writeState({ ...st, companies });
    return updated;
  }

  async createUserInCompany(
    companyId: CompanyId,
    name: string,
    email: string,
    role: CompanyRole
  ): Promise<User> {
    const st = ensureState();
    this.assertCan('company:manage_members', companyId);
    const next: User = { id: uid('usr') as UserId, name, email } as User;
    writeState({ ...st, users: [...st.users, next] });
    // add membership
    await this.upsertCompanyMembership(companyId, next.id, role);
    return next;
  }

  async importTransactions(
    projectId: ProjectId,
    txns: Txn[],
    mode: CsvImportMode
  ): Promise<{ imported: number }> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new Error('Unknown project');
    this.assertCan('project:import', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new Error('Unknown project');
    const nextTxns = mode === 'replaceAll' ? txns : [...slice.transactions, ...txns];
    writeState({
      ...st,
      dataByProjectId: { ...st.dataByProjectId, [projectId]: { ...slice, transactions: nextTxns } },
    });
    return { imported: txns.length };
  }

  async resetToSeed(): Promise<void> {
    const session = readSession();
    writeState(buildSeedState());
    // Keep session so the user isn't kicked out in local mode.
    writeSession(session);
  }

  async getDefaultCompanyIdForUser(userId: UserId): Promise<CompanyId | null> {
    const st = ensureState();
    // Superadmin should be able to jump into any company. Default to the first "real" company.
    if (this.isSuperadmin(userId, st)) {
      const first = st.companies.find((c) => c.id !== asCompanyId('co_projex')) ?? st.companies[0];
      return first?.id ?? null;
    }

    const primary = getPrimaryCompanyForUser(userId, st.companyMemberships);
    if (primary) return primary.companyId;

    return st.companies[0]?.id ?? null;
  }
}
