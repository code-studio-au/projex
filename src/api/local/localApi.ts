import type {
  Company,
  CompanyDefaultCategory,
  CompanyDefaults,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  CompanyMembership,
  CompanyRole,
  CompanySummary,
  ProjectMembership,
  ProjectRole,
  Project,
  ProjectId,
  BudgetLine,
  Category,
  SubCategory,
  Txn,
  TxnId,
  User,
  UserId,
  ImportPreviewRow,
} from '../../types';
import {
  asBudgetLineId,
  asCategoryId,
  asCompanyId,
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asProjectId,
  asSubCategoryId,
  asTxnId,
  asUserId,
} from '../../types';
import { can, type Action } from '../../utils/auth';
import { uid } from '../../utils/id';
import {
  buildSeedState,
  PROJEX_STATE_KEY,
  type PersistedStateV1,
} from '../../seed';
import { getPrimaryCompanyForUser } from '../../store/access';
import { AppError } from '../errors';
import {
  budgetAllocatedCentsSchema,
  categoryNameSchema,
  companyNameSchema,
  emailSchema,
  projectBudgetTotalCentsSchema,
  projectNameSchema,
  subCategoryNameSchema,
  txnInputSchema,
  userNameSchema,
} from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import {
  defaultCategoryIdForRule,
  mapImportedTransactionWithCompanyDefaults,
} from '../../utils/companyDefaultMappings';
import { planApplyCompanyDefaultTaxonomy } from '../../utils/companyDefaultTaxonomy';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { planImportPreview } from '../../utils/importPreviewPlan';
import {
  assertUniqueTransactionKeysInProject,
  normalizeExternalId,
  normalizeTxnPatch,
  sortTransactionsForList,
} from '../../utils/transactions';
import {
  localPersistedStateSchema,
  localSessionSchema,
} from '../../validation/localStateSchemas';

import type {
  BudgetCreateInput,
  BudgetUpdateInput,
  CompanyDefaultCategoryCreateInput,
  CompanyDefaultCategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyDefaultSubCategoryCreateInput,
  CompanyDefaultSubCategoryUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyUserInviteResult,
  CompanyUpdateInput,
  ApplyCompanyDefaultsResult,
  PendingEmailChange,
  EmailChangeRequestInput,
  EmailChangeRequestResult,
  EmailChangeConfirmResult,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProfileUpdateInput,
  ProjexApi,
  Session,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
  TxnCreateInput,
  TxnImportInput,
  TxnUpdateInput,
} from '../contract';

const SESSION_KEY = 'projex_session_v1';

function readJsonWithSchema<T>(
  key: string,
  parse: (value: unknown) => T
): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function emptyCompanyDefaultsSlice() {
  return {
    categories: [],
    subCategories: [],
    mappingRules: [],
  };
}

function ensureState(): PersistedStateV1 {
  const existing = readJsonWithSchema(
    PROJEX_STATE_KEY,
    localPersistedStateSchema.parse
  );
  if (existing) {
    writeJson(PROJEX_STATE_KEY, existing);
    return existing;
  }

  const seed = buildSeedState();
  writeJson(PROJEX_STATE_KEY, seed);
  return seed;
}

function writeState(next: PersistedStateV1) {
  writeJson(PROJEX_STATE_KEY, next);
}

function readSession(): Session | null {
  return readJsonWithSchema(SESSION_KEY, localSessionSchema.parse);
}

function writeSession(next: Session | null) {
  if (typeof window === 'undefined') return;
  if (!next) window.localStorage.removeItem(SESSION_KEY);
  else writeJson(SESSION_KEY, next);
}

function projectAllowsSuperadminAccess(project: Project | undefined): boolean {
  return project?.allowSuperadminAccess ?? true;
}

export class LocalApi implements ProjexApi {
  private nowIso() {
    return new Date().toISOString();
  }
  private requireSession(): Session {
    const s = readSession();
    if (!s) throw new AppError('UNAUTHENTICATED', 'Not authenticated');
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
    if (projectId && this.isSuperadmin(userId, st)) {
      const project = st.projects.find((p) => p.id === projectId);
      if (!projectAllowsSuperadminAccess(project)) {
        throw new AppError('FORBIDDEN', 'Superadmin access is disabled for this project');
      }
    }
    const ok = can({
      userId,
      companyId,
      projectId,
      action,
      companyMemberships: st.companyMemberships,
      projectMemberships: st.projectMemberships,
    });
    if (!ok) throw new AppError('FORBIDDEN', 'Forbidden');
  }
  async getSession(): Promise<Session | null> {
    return readSession();
  }

  async requestEmailChange(input: EmailChangeRequestInput): Promise<EmailChangeRequestResult> {
    void input;
    throw new AppError(
      'NOT_IMPLEMENTED',
      'Verified email change is only available in server-auth mode.'
    );
  }

  async getPendingEmailChange(): Promise<PendingEmailChange | null> {
    return null;
  }

  async resendEmailChange(): Promise<EmailChangeRequestResult> {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'Verified email change is only available in server-auth mode.'
    );
  }

  async cancelEmailChange(): Promise<void> {
    throw new AppError(
      'NOT_IMPLEMENTED',
      'Verified email change is only available in server-auth mode.'
    );
  }

  async confirmEmailChange(token: string): Promise<EmailChangeConfirmResult> {
    void token;
    throw new AppError(
      'NOT_IMPLEMENTED',
      'Verified email change is only available in server-auth mode.'
    );
  }

  async updateCurrentUserProfile(input: ProfileUpdateInput): Promise<User> {
    const st = ensureState();
    const { userId } = this.requireSession();
    validateOrThrow(userNameSchema, input.name);
    const idx = st.users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown user');
    const users = st.users.slice();
    users[idx] = {
      ...users[idx],
      name: input.name.trim(),
    };
    writeState({ ...st, users });
    return users[idx];
  }

  async loginAs(userId: UserId): Promise<Session> {
    // validate user exists
    const st = ensureState();
    const found = st.users.find((u) => u.id === userId);
    if (!found) throw new AppError('NOT_FOUND', 'Unknown user');
    const session: Session = { userId };
    writeSession(session);
    return session;
  }

  async logout(): Promise<void> {
    writeSession(null);
  }

  async listUsers(): Promise<User[]> {
    const st = ensureState();
    const s = readSession();

    // Local login bootstrap: allow reading seed users before auth.
    if (!s) return st.users;
    if (this.isSuperadmin(s.userId, st)) return st.users;

    const allowedCompanyIds = new Set(
      st.companyMemberships
        .filter((m) => m.userId === s.userId)
        .map((m) => m.companyId)
    );

    const allowedUserIds = new Set(
      st.companyMemberships
        .filter((m) => allowedCompanyIds.has(m.companyId))
        .map((m) => m.userId)
    );

    return st.users.filter((u) => allowedUserIds.has(u.id));
  }

  async listAllCompanyMemberships(): Promise<CompanyMembership[]> {
    const st = ensureState();
    const { userId } = this.requireSession();
    if (this.isSuperadmin(userId, st)) return st.companyMemberships;

    const allowedCompanyIds = new Set(
      st.companyMemberships
        .filter((m) => m.userId === userId)
        .map((m) => m.companyId)
    );

    return st.companyMemberships.filter((m) => allowedCompanyIds.has(m.companyId));
  }

  async listCompanies(): Promise<Company[]> {
    const st = ensureState();
    const s = readSession();
    if (!s) return [];
    if (this.isSuperadmin(s.userId, st)) {
      return st.companies.filter((c) => c.id !== asCompanyId('co_projex'));
    }
    const allowed = new Set(
      st.companyMemberships.filter((m) => m.userId === s.userId).map((m) => m.companyId)
    );
    return st.companies.filter((c) => allowed.has(c.id) && c.status === 'active');
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
    const comp = st.companies.find((c) => c.id === companyId) ?? null;
    if (!comp) return null;
    if (comp.status === 'deactivated' && !this.isSuperadmin(s.userId, st)) return null;
    return comp;
  }

  async getCompanySummary(companyId: CompanyId): Promise<CompanySummary> {
    const st = ensureState();
    const session = this.requireSession();
    const company = st.companies.find((item) => item.id === companyId);
    if (!company) throw new AppError('NOT_FOUND', 'Unknown company');

    const isSuperadmin = this.isSuperadmin(session.userId, st);
    const companyRole =
      st.companyMemberships.find(
        (membership) => membership.companyId === companyId && membership.userId === session.userId
      )?.role ?? null;
    if (!isSuperadmin && companyRole !== 'admin' && companyRole !== 'executive') {
      throw new AppError('FORBIDDEN', 'Company summary access requires admin or executive role');
    }

    const projects = await this.listProjects(companyId);
    const validSubCategoryIdsByProject = new Map<ProjectId, Set<string>>();
    const transactions = projects.flatMap((project) => {
      const slice = st.dataByProjectId[project.id];
      validSubCategoryIdsByProject.set(
        project.id,
        new Set((slice?.subCategories ?? []).map((subCategory) => String(subCategory.id)))
      );
      return (slice?.transactions ?? []).map((txn) => ({
        projectId: project.id,
        date: txn.date,
        amountCents: txn.amountCents,
        subCategoryId: txn.subCategoryId,
      }));
    });

    return {
      projects: buildCompanySummaryProjects({
        projects,
        transactions,
        validSubCategoryIdsByProject,
      }),
    };
  }

  async listProjects(companyId: CompanyId): Promise<Project[]> {
    const st = ensureState();
    const s = readSession();
    if (!s) return [];

    const company = st.companies.find((c) => c.id === companyId) ?? null;
    if (!company) return [];
    if (company.status === 'deactivated' && !this.isSuperadmin(s.userId, st)) return [];

    const all = st.projects.filter((p) => p.companyId === companyId);
    if (this.isSuperadmin(s.userId, st)) {
      return all.filter((p) => projectAllowsSuperadminAccess(p));
    }

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
      if (p.status === 'archived') return false;

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
    if (this.isSuperadmin(s.userId, st) && !projectAllowsSuperadminAccess(p)) return null;
    const company = st.companies.find((c) => c.id === p.companyId) ?? null;
    if (!company) return null;
    if (company.status === 'deactivated' && !this.isSuperadmin(s.userId, st)) return null;
    if (p.status === 'archived' && !this.isSuperadmin(s.userId, st)) {
      const cRole = st.companyMemberships.find((m) => m.companyId === p.companyId && m.userId === s.userId)?.role;
      if (cRole !== 'admin' && cRole !== 'executive') {
        throw new AppError('FORBIDDEN', 'Project is deactivated');
      }
    }
    // Enforce view permissions.
    this.assertCan('project:view', p.companyId, p.id);
    return p;
  }

  async listTransactions(projectId: ProjectId): Promise<Txn[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    return sortTransactionsForList(slice?.transactions ?? []);
  }

  async createTxn(projectId: ProjectId, input: TxnCreateInput): Promise<Txn> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    validateOrThrow(txnInputSchema, input);
    const now = this.nowIso();
    const next: Txn = {
      ...input,
      id: input.id ?? asTxnId(uid('txn')),
      externalId: normalizeExternalId(input.externalId),
      createdAt: now,
      updatedAt: now,
    };
    assertUniqueTransactionKeysInProject([...slice.transactions, next]);
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

  async updateTxn(projectId: ProjectId, input: TxnUpdateInput): Promise<Txn> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const idx = slice.transactions.findIndex((t) => t.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown transaction');
    const normalizedInput = normalizeTxnPatch(input);
    const nextExternalId = Object.prototype.hasOwnProperty.call(normalizedInput, 'externalId')
      ? normalizeExternalId(normalizedInput.externalId ?? undefined)
      : normalizeExternalId(slice.transactions[idx].externalId);
    const updated: Txn = {
      ...slice.transactions[idx],
      ...normalizedInput,
      externalId: nextExternalId,
      updatedAt: this.nowIso(),
    };
    validateOrThrow(txnInputSchema, updated);

    const nextTxns = slice.transactions.slice();
    nextTxns[idx] = updated;
    assertUniqueTransactionKeysInProject(nextTxns);

    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, transactions: nextTxns },
      },
    });
    return updated;
  }

  async deleteTxn(projectId: ProjectId, txnId: TxnId): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('txns:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
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
    this.assertCan('company:view', companyId);
    return st.companyMemberships.filter((m) => m.companyId === companyId);
  }

  // Convenience wrappers expected by the API contract
  async setCompanyRole(companyId: CompanyId, userId: UserId, role: CompanyRole): Promise<void> {
    await this.upsertCompanyMembership(companyId, userId, role);
  }

  async setProjectRole(projectId: ProjectId, userId: UserId, role: ProjectRole): Promise<void> {
    await this.upsertProjectMembership(projectId, userId, role);
  }

  async removeCompanyMember(companyId: CompanyId, userId: UserId): Promise<void> {
    await this.deleteCompanyMembership(companyId, userId);
  }

  async removeProjectMember(projectId: ProjectId, userId: UserId): Promise<void> {
    const st = ensureState();
    const membership = st.projectMemberships.find((m) => m.projectId === projectId && m.userId === userId);
    if (!membership) return;
    await this.deleteProjectMembership(projectId, userId, membership.role);
  }

  async listProjectMemberships(projectId: ProjectId): Promise<ProjectMembership[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.projectMemberships.filter((m) => m.projectId === projectId);
  }

  async listMyProjectMemberships(companyId: CompanyId): Promise<ProjectMembership[]> {
    const st = ensureState();
    const { userId } = this.requireSession();
    const isSuper = this.isSuperadmin(userId, st);

    // Explicit memberships only (no synthetic/implicit memberships).
    // Company-wide access for admin/executive/superadmin is enforced via `can(...)`
    // and endpoint-level checks (e.g. getProject asserts project:view).
    const projectIdsInCompany = new Set(
      st.projects
        .filter((p) => p.companyId === companyId)
        .filter((p) => !isSuper || projectAllowsSuperadminAccess(p))
        .map((p) => p.id)
    );

    return st.projectMemberships.filter(
      (m) => m.userId === userId && projectIdsInCompany.has(m.projectId)
    );
  }

  async upsertCompanyMembership(
    companyId: CompanyId,
    userId: UserId,
    role: CompanyRole
  ): Promise<CompanyMembership> {
    const st = ensureState();
    this.assertCan('company:manage_members', companyId);
    const existing = st.companyMemberships.find(
      (m) => m.companyId === companyId && m.userId === userId
    );
    if (existing?.role === 'admin' && role !== 'admin') {
      const adminCount = st.companyMemberships.filter(
        (m) => m.companyId === companyId && m.role === 'admin'
      ).length;
      if (adminCount <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Company must retain at least one admin');
      }
    }
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
    this.assertCan('company:manage_members', companyId);
    const existing = st.companyMemberships.find(
      (m) => m.companyId === companyId && m.userId === userId
    );
    if (existing?.role === 'admin') {
      const adminCount = st.companyMemberships.filter(
        (m) => m.companyId === companyId && m.role === 'admin'
      ).length;
      if (adminCount <= 1) {
        throw new AppError('VALIDATION_ERROR', 'Company must retain at least one admin');
      }
    }
    const companyProjectIds = new Set(
      st.projects.filter((p) => p.companyId === companyId).map((p) => p.id)
    );
    writeState({
      ...st,
      companyMemberships: st.companyMemberships.filter(
        (m) => !(m.companyId === companyId && m.userId === userId)
      ),
      projectMemberships: st.projectMemberships.filter(
        (m) => !(m.userId === userId && companyProjectIds.has(m.projectId))
      ),
    });
  }

  async upsertProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ): Promise<ProjectMembership> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:edit', p.companyId, projectId);
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
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:edit', p.companyId, projectId);
    writeState({
      ...st,
      projectMemberships: st.projectMemberships.filter(
        (m) => !(m.projectId === projectId && m.userId === userId && m.role === role)
      ),
    });
  }

  async listCompanyDefaultCategories(companyId: CompanyId): Promise<CompanyDefaultCategory[]> {
    const st = ensureState();
    this.assertCan('company:view', companyId);
    return st.companyDefaultsByCompanyId[companyId]?.categories ?? [];
  }

  async getCompanyDefaults(companyId: CompanyId): Promise<CompanyDefaults> {
    const st = ensureState();
    this.assertCan('company:view', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    return {
      categories: slice.categories,
      subCategories: slice.subCategories,
      mappingRules: [...slice.mappingRules].sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  async listCompanyDefaultSubCategories(
    companyId: CompanyId
  ): Promise<CompanyDefaultSubCategory[]> {
    const st = ensureState();
    this.assertCan('company:view', companyId);
    return st.companyDefaultsByCompanyId[companyId]?.subCategories ?? [];
  }

  async listCompanyDefaultMappingRules(companyId: CompanyId): Promise<CompanyDefaultMappingRule[]> {
    const st = ensureState();
    this.assertCan('company:view', companyId);
    return [...(st.companyDefaultsByCompanyId[companyId]?.mappingRules ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
  }

  async createCompanyDefaultCategory(
    companyId: CompanyId,
    input: CompanyDefaultCategoryCreateInput
  ): Promise<CompanyDefaultCategory> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    validateOrThrow(categoryNameSchema, input.name);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    const nameKey = input.name.trim().toLowerCase();
    const existing = slice.categories.find((c) => c.name.trim().toLowerCase() === nameKey);
    if (existing) return existing;

    const id = input.id ?? asCompanyDefaultCategoryId(uid('ccat'));
    const now = this.nowIso();
    const next: CompanyDefaultCategory = {
      ...input,
      id,
      companyId,
      name: input.name.trim(),
      createdAt: now,
      updatedAt: now,
    };
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, categories: [...slice.categories, next] },
      },
    });
    return next;
  }

  async updateCompanyDefaultCategory(
    companyId: CompanyId,
    input: CompanyDefaultCategoryUpdateInput
  ): Promise<CompanyDefaultCategory> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    if (typeof input.name === 'string') {
      validateOrThrow(categoryNameSchema, input.name);
    }
    const idx = slice.categories.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown company default category');
    if (typeof input.name === 'string') {
      const nameKey = input.name.trim().toLowerCase();
      const duplicate = slice.categories.find(
        (c) => c.id !== input.id && c.name.trim().toLowerCase() === nameKey
      );
      if (duplicate) {
        throw new AppError('CONFLICT', `Company default category "${input.name.trim()}" already exists`);
      }
    }
    const updated: CompanyDefaultCategory = {
      ...slice.categories[idx],
      ...input,
      companyId,
      name: typeof input.name === 'string' ? input.name.trim() : slice.categories[idx].name,
      updatedAt: this.nowIso(),
    };
    const categories = slice.categories.slice();
    categories[idx] = updated;
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, categories },
      },
    });
    return updated;
  }

  async deleteCompanyDefaultCategory(
    companyId: CompanyId,
    categoryId: CompanyDefaultCategory['id']
  ): Promise<void> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: {
          categories: slice.categories.filter((c) => c.id !== categoryId),
          subCategories: slice.subCategories.filter((s) => s.companyDefaultCategoryId !== categoryId),
          mappingRules: slice.mappingRules.filter(
            (rule) => rule.companyDefaultCategoryId !== categoryId
          ),
        },
      },
    });
  }

  async createCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: CompanyDefaultSubCategoryCreateInput
  ): Promise<CompanyDefaultSubCategory> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    validateOrThrow(subCategoryNameSchema, input.name);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    const category = slice.categories.find((c) => c.id === input.companyDefaultCategoryId);
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');
    const nameKey = input.name.trim().toLowerCase();
    const existing = slice.subCategories.find(
      (s) =>
        s.companyDefaultCategoryId === input.companyDefaultCategoryId &&
        s.name.trim().toLowerCase() === nameKey
    );
    if (existing) return existing;

    const id = input.id ?? asCompanyDefaultSubCategoryId(uid('csub'));
    const now = this.nowIso();
    const next: CompanyDefaultSubCategory = {
      ...input,
      id,
      companyId,
      name: input.name.trim(),
      createdAt: now,
      updatedAt: now,
    };
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, subCategories: [...slice.subCategories, next] },
      },
    });
    return next;
  }

  async updateCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: CompanyDefaultSubCategoryUpdateInput
  ): Promise<CompanyDefaultSubCategory> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    if (typeof input.name === 'string') {
      validateOrThrow(subCategoryNameSchema, input.name);
    }
    const idx = slice.subCategories.findIndex((s) => s.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    const current = slice.subCategories[idx];
    const nextCategoryId = input.companyDefaultCategoryId ?? current.companyDefaultCategoryId;
    const nextName = (typeof input.name === 'string' ? input.name : current.name).trim();
    const duplicate = slice.subCategories.find(
      (subCategory) =>
        subCategory.id !== input.id &&
        subCategory.companyDefaultCategoryId === nextCategoryId &&
        subCategory.name.trim().toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Company default subcategory "${nextName}" already exists in this category`
      );
    }
    const updated: CompanyDefaultSubCategory = {
      ...current,
      ...input,
      companyId,
      name: nextName,
      updatedAt: this.nowIso(),
    };
    const subCategories = slice.subCategories.slice();
    subCategories[idx] = updated;
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, subCategories },
      },
    });
    return updated;
  }

  async deleteCompanyDefaultSubCategory(
    companyId: CompanyId,
    subCategoryId: CompanyDefaultSubCategory['id']
  ): Promise<void> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: {
          ...slice,
          subCategories: slice.subCategories.filter((s) => s.id !== subCategoryId),
          mappingRules: slice.mappingRules.filter(
            (rule) => rule.companyDefaultSubCategoryId !== subCategoryId
          ),
        },
      },
    });
  }

  async createCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleCreateInput
  ): Promise<CompanyDefaultMappingRule> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    validateOrThrow(subCategoryNameSchema, input.matchText);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    const category = slice.categories.find((item) => item.id === input.companyDefaultCategoryId);
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');
    const subCategory = slice.subCategories.find(
      (item) =>
        item.id === input.companyDefaultSubCategoryId &&
        item.companyDefaultCategoryId === input.companyDefaultCategoryId
    );
    if (!subCategory) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    const matchText = input.matchText.trim();
    const duplicate = slice.mappingRules.find(
      (rule) =>
        rule.matchText.trim().toLowerCase() === matchText.toLowerCase() &&
        rule.companyDefaultSubCategoryId === input.companyDefaultSubCategoryId
    );
    if (duplicate) return duplicate;

    const id = input.id ?? asCompanyDefaultMappingRuleId(uid('cmap'));
    const now = this.nowIso();
    const next: CompanyDefaultMappingRule = {
      id,
      companyId,
      matchText,
      companyDefaultCategoryId: input.companyDefaultCategoryId,
      companyDefaultSubCategoryId: input.companyDefaultSubCategoryId,
      sortOrder:
        input.sortOrder ??
        (slice.mappingRules.reduce((max, rule) => Math.max(max, rule.sortOrder), -1) + 1),
      createdAt: now,
      updatedAt: now,
    };
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, mappingRules: [...slice.mappingRules, next] },
      },
    });
    return next;
  }

  async updateCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleUpdateInput
  ): Promise<CompanyDefaultMappingRule> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    const idx = slice.mappingRules.findIndex((rule) => rule.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown company default mapping rule');
    const current = slice.mappingRules[idx];
    if (typeof input.matchText === 'string') {
      validateOrThrow(subCategoryNameSchema, input.matchText);
    }
    const nextSubCategoryId =
      input.companyDefaultSubCategoryId ?? current.companyDefaultSubCategoryId;
    const nextCategoryId =
      input.companyDefaultCategoryId ??
      defaultCategoryIdForRule(nextSubCategoryId, slice.subCategories) ??
      current.companyDefaultCategoryId;
    const category = slice.categories.find((item) => item.id === nextCategoryId);
    if (!category) throw new AppError('NOT_FOUND', 'Unknown company default category');
    const subCategory = slice.subCategories.find(
      (item) =>
        item.id === nextSubCategoryId && item.companyDefaultCategoryId === nextCategoryId
    );
    if (!subCategory) throw new AppError('NOT_FOUND', 'Unknown company default subcategory');
    const nextMatchText =
      typeof input.matchText === 'string' ? input.matchText.trim() : current.matchText;
    const duplicate = slice.mappingRules.find(
      (rule) =>
        rule.id !== input.id &&
        rule.matchText.trim().toLowerCase() === nextMatchText.toLowerCase() &&
        rule.companyDefaultSubCategoryId === nextSubCategoryId
    );
    if (duplicate) {
      throw new AppError(
        'CONFLICT',
        `Default mapping "${nextMatchText}" already points to this subcategory`
      );
    }
    const updated: CompanyDefaultMappingRule = {
      ...current,
      ...input,
      companyId,
      matchText: nextMatchText,
      companyDefaultCategoryId: nextCategoryId,
      companyDefaultSubCategoryId: nextSubCategoryId,
      sortOrder: input.sortOrder ?? current.sortOrder,
      updatedAt: this.nowIso(),
    };
    const mappingRules = slice.mappingRules.slice();
    mappingRules[idx] = updated;
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: { ...slice, mappingRules },
      },
    });
    return updated;
  }

  async deleteCompanyDefaultMappingRule(
    companyId: CompanyId,
    ruleId: CompanyDefaultMappingRule['id']
  ): Promise<void> {
    const st = ensureState();
    this.assertCan('company:edit', companyId);
    const slice = st.companyDefaultsByCompanyId[companyId] ?? emptyCompanyDefaultsSlice();
    writeState({
      ...st,
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [companyId]: {
          ...slice,
          mappingRules: slice.mappingRules.filter((rule) => rule.id !== ruleId),
        },
      },
    });
  }

  async applyCompanyDefaultTaxonomy(projectId: ProjectId): Promise<ApplyCompanyDefaultsResult> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const defaults = st.companyDefaultsByCompanyId[p.companyId] ?? emptyCompanyDefaultsSlice();
    const plan = planApplyCompanyDefaultTaxonomy({
      companyId: p.companyId,
      projectId,
      defaultCategories: defaults.categories,
      defaultSubCategories: defaults.subCategories,
      projectCategories: slice.categories,
      projectSubCategories: slice.subCategories,
      createCategoryId: () => asCategoryId(uid('cat')),
      createSubCategoryId: () => asSubCategoryId(uid('sub')),
      nowIso: this.nowIso(),
    });

    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: {
          ...slice,
          categories: [...slice.categories, ...plan.categoriesToCreate],
          subCategories: [...slice.subCategories, ...plan.subCategoriesToCreate],
        },
      },
    });

    return plan.result;
  }

  async listCategories(projectId: ProjectId): Promise<Category[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.categories ?? [];
  }

  async listSubCategories(projectId: ProjectId): Promise<SubCategory[]> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.subCategories ?? [];
  }

  async createCategory(projectId: ProjectId, input: CategoryCreateInput): Promise<Category> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    validateOrThrow(categoryNameSchema, input.name);

    // Idempotency: categories are unique by name per project (case-insensitive).
    const nameKey = input.name.trim().toLowerCase();
    const existing = slice.categories.find((c) => c.name.trim().toLowerCase() === nameKey);
    if (existing) return existing;

    const id = input.id ?? asCategoryId(uid('cat'));
    const now = this.nowIso();
    const next: Category = { ...input, id, createdAt: now, updatedAt: now };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    if (typeof input.name === 'string') {
      validateOrThrow(categoryNameSchema, input.name);
    }
    const idx = slice.categories.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown category');
    const updated: Category = { ...slice.categories[idx], ...input, updatedAt: this.nowIso() };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const remainingCats = slice.categories.filter((c) => c.id !== categoryId);
    const remainingSubs = slice.subCategories.filter((s) => s.categoryId !== categoryId);
    // Clear references on budgets + transactions
    const budgets: BudgetLine[] = slice.budgets.map((b) =>
      b.categoryId === categoryId
        ? ({ ...b, categoryId: undefined, subCategoryId: undefined })
        : b
    );
    const transactions: Txn[] = slice.transactions.map((t) =>
      t.categoryId === categoryId
        ? ({
            ...t,
            categoryId: undefined,
            subCategoryId: undefined,
            companyDefaultMappingRuleId: undefined,
            codingSource: 'manual',
            codingPendingApproval: false,
          })
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    validateOrThrow(subCategoryNameSchema, input.name);

    // Idempotency: subcategories are unique per (categoryId, name) within a project.
    const nameKey = input.name.trim().toLowerCase();
    const existing = slice.subCategories.find(
      (s) => s.categoryId === input.categoryId && s.name.trim().toLowerCase() === nameKey
    );
    if (existing) return existing;

    const id = input.id ?? asSubCategoryId(uid('sub'));
    const now = this.nowIso();
    const next: SubCategory = { ...input, id, createdAt: now, updatedAt: now };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    if (typeof input.name === 'string') {
      validateOrThrow(subCategoryNameSchema, input.name);
    }
    const idx = slice.subCategories.findIndex((s) => s.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown subcategory');
    const updated: SubCategory = { ...slice.subCategories[idx], ...input, updatedAt: this.nowIso() };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('taxonomy:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const subCategories = slice.subCategories.filter((s) => s.id !== subCategoryId);
    const budgets = slice.budgets.map((b) =>
      b.subCategoryId === subCategoryId
        ? ({ ...b, subCategoryId: undefined })
        : b
    );
    const transactions = slice.transactions.map((t) =>
      t.subCategoryId === subCategoryId
        ? ({
            ...t,
            categoryId: undefined,
            subCategoryId: undefined,
            companyDefaultMappingRuleId: undefined,
            codingSource: 'manual',
            codingPendingApproval: false,
          })
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:view', p.companyId, projectId);
    return st.dataByProjectId[projectId]?.budgets ?? [];
  }
  async createBudget(projectId: ProjectId, input: BudgetCreateInput): Promise<BudgetLine> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    validateOrThrow(budgetAllocatedCentsSchema, input.allocatedCents);

    // Idempotency: budget lines are unique per (projectId, subCategoryId).
    // This mirrors a future DB uniqueness constraint and prevents duplicate
    // creation due to racing invalidations or optimistic UI.
    const existingIdx = slice.budgets.findIndex((b) => b.subCategoryId === input.subCategoryId);
    if (existingIdx >= 0) {
      const existing = slice.budgets[existingIdx];
      // If the caller is trying to associate the subcategory to a different
      // category (e.g. after a move), keep the budget consistent.
      if (existing.categoryId !== input.categoryId) {
        const budgets = slice.budgets.slice();
        budgets[existingIdx] = { ...existing, categoryId: input.categoryId };
        writeState({
          ...st,
          dataByProjectId: { ...st.dataByProjectId, [projectId]: { ...slice, budgets } },
        });
        return budgets[existingIdx];
      }
      return existing;
    }

    const id = input.id ?? asBudgetLineId(uid('bud'));
    const now = this.nowIso();
    const next: BudgetLine = { ...input, id, createdAt: now, updatedAt: now };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const idx = slice.budgets.findIndex((b) => b.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown budget');
    if (typeof input.allocatedCents !== 'undefined') {
      validateOrThrow(budgetAllocatedCentsSchema, input.allocatedCents);
    }
    const updated: BudgetLine = { ...slice.budgets[idx], ...input, updatedAt: this.nowIso() };
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
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('budget:edit', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
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
    validateOrThrow(projectNameSchema, input.name);
    const id = input.id ?? asProjectId(uid('prj'));
    const next: Project = {
      id,
      companyId,
      name: input.name,
      budgetTotalCents: 0,
      currency: 'AUD',
      status: 'active',
      visibility: 'private',
      allowSuperadminAccess: true,
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
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown project');
    if (typeof input.name === 'string') {
      validateOrThrow(projectNameSchema, input.name);
    }
    if (typeof input.budgetTotalCents !== 'undefined') {
      validateOrThrow(projectBudgetTotalCentsSchema, input.budgetTotalCents);
    }
    this.assertCan('project:edit', st.projects[idx].companyId, st.projects[idx].id);
    const updated: Project = { ...st.projects[idx], ...input };
    const projects = st.projects.slice();
    projects[idx] = updated;
    writeState({ ...st, projects });
    return updated;
  }

  async createCompany(input: Pick<Company, 'name'> & { id?: CompanyId }): Promise<Company> {
    const st = ensureState();
    const { userId } = this.requireSession();
    if (!this.isSuperadmin(userId, st)) throw new AppError('FORBIDDEN', 'Forbidden');
    validateOrThrow(companyNameSchema, input.name);

    const id = input.id ?? asCompanyId(uid('co'));
    const next: Company = { id, name: input.name, status: 'active' };
    writeState({
      ...st,
      companies: [...st.companies, next],
      companyMemberships: [...st.companyMemberships, { companyId: id, userId, role: 'superadmin' }],
      companyDefaultsByCompanyId: {
        ...st.companyDefaultsByCompanyId,
        [id]: { categories: [], subCategories: [] },
      },
    });
    return next;
  }

  async updateCompany(input: CompanyUpdateInput): Promise<Company> {
    const st = ensureState();
    const idx = st.companies.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Unknown company');
    if (typeof input.name === 'string') {
      validateOrThrow(companyNameSchema, input.name);
    }
    this.assertCan('company:edit', st.companies[idx].id);
    const updated: Company = { ...st.companies[idx], ...input };
    const companies = st.companies.slice();
    companies[idx] = updated;
    writeState({ ...st, companies });
    return updated;
  }

  async deactivateCompany(companyId: CompanyId): Promise<void> {
    const st = ensureState();
    const { userId } = this.requireSession();
    if (!this.isSuperadmin(userId, st)) throw new AppError('FORBIDDEN', 'Forbidden');

    const idx = st.companies.findIndex((c) => c.id === companyId);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Company not found');
    const company = st.companies[idx];
    if (company.status === 'deactivated') return;

    const now = new Date().toISOString();

    // Deactivate company
    const companies = st.companies.slice();
    companies[idx] = { ...company, status: 'deactivated', deactivatedAt: now };

    // Deactivate all projects in the company
    const projects: Project[] = st.projects.map((p) =>
      p.companyId === companyId && p.status !== 'archived' ? { ...p, status: 'archived' } : p
    );

    // Disable users that belong to this company (local-mode simplification).
    // In server mode you'll likely disable memberships instead of disabling the user globally.
    const memberUserIds = new Set(st.companyMemberships.filter((m) => m.companyId === companyId).map((m) => m.userId));
    const users = st.users.map((u) => {
      if (!memberUserIds.has(u.id)) return u;
      // keep superadmin accounts usable
      const isSuper = st.companyMemberships.some((m) => m.userId === u.id && m.role === 'superadmin');
      if (isSuper) return u;
      return { ...u, disabled: true };
    });

    writeState({ ...st, companies, projects, users });
  }

  async reactivateCompany(companyId: CompanyId): Promise<void> {
    const st = ensureState();
    const { userId } = this.requireSession();
    if (!this.isSuperadmin(userId, st)) throw new AppError('FORBIDDEN', 'Forbidden');

    const idx = st.companies.findIndex((c) => c.id === companyId);
    if (idx < 0) throw new AppError('NOT_FOUND', 'Company not found');
    const company = st.companies[idx];
    if (company.status === 'active') return;

    // Reactivate company
    const companies = st.companies.slice();
    companies[idx] = { ...company, status: 'active', deactivatedAt: undefined };

    // Reactivate all projects in the company
    const projects: Project[] = st.projects.map((p) =>
      p.companyId === companyId && p.status !== 'active' ? { ...p, status: 'active' } : p
    );

    // Re-enable users that are members of this company (local-mode simplification).
    const memberUserIds = new Set(st.companyMemberships.filter((m) => m.companyId === companyId).map((m) => m.userId));
    const users = st.users.map((u) => (memberUserIds.has(u.id) ? { ...u, disabled: false } : u));

    writeState({ ...st, companies, projects, users });
  }

  async deleteCompany(companyId: CompanyId): Promise<void> {
    const st = ensureState();
    const { userId } = this.requireSession();
    if (!this.isSuperadmin(userId, st)) throw new AppError('FORBIDDEN', 'Forbidden');

    const company = st.companies.find((c) => c.id === companyId);
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status !== 'deactivated') {
      throw new AppError('VALIDATION_ERROR', 'Company must be deactivated before deletion');
    }

    const projectIds = st.projects.filter((p) => p.companyId === companyId).map((p) => p.id);
    const projectIdSet = new Set(projectIds);

    const projects = st.projects.filter((p) => p.companyId !== companyId);
    const companies = st.companies.filter((c) => c.id !== companyId);
    const companyMemberships = st.companyMemberships.filter((m) => m.companyId !== companyId);
    const projectMemberships = st.projectMemberships.filter((m) => !projectIdSet.has(m.projectId));
    const companyDefaultsByCompanyId = { ...st.companyDefaultsByCompanyId };
    delete companyDefaultsByCompanyId[companyId];

    // Drop all project slices for the deleted company.
    const dataByProjectId = { ...st.dataByProjectId };
    for (const pid of projectIds) {
      delete dataByProjectId[pid];
    }

    const nextActiveCompanyId =
      st.activeCompanyId === companyId
        ? (companies.find((candidate) => candidate.status === 'active') ?? companies[0])?.id
        : st.activeCompanyId;
    const nextActiveProjectId =
      st.activeProjectId && projectIdSet.has(st.activeProjectId) ? null : st.activeProjectId;

    writeState({
      ...st,
      companies,
      projects,
      companyMemberships,
      projectMemberships,
      companyDefaultsByCompanyId,
      dataByProjectId,
      activeCompanyId: nextActiveCompanyId ?? st.activeCompanyId,
      activeProjectId: nextActiveProjectId,
    });
  }

  async deactivateProject(projectId: ProjectId): Promise<void> {
    const st = ensureState();
    const pIdx = st.projects.findIndex((p) => p.id === projectId);
    if (pIdx < 0) throw new AppError('NOT_FOUND', 'Project not found');
    const p = st.projects[pIdx];

    // exec/admin/superadmin can deactivate projects
    this.assertCan('company:edit', p.companyId);

    if (p.status === 'archived') return;
    const projects = st.projects.slice();
    projects[pIdx] = { ...p, status: 'archived', deactivatedAt: this.nowIso() };
    writeState({ ...st, projects });
  }

  async reactivateProject(projectId: ProjectId): Promise<void> {
    const st = ensureState();
    const pIdx = st.projects.findIndex((p) => p.id === projectId);
    if (pIdx < 0) throw new AppError('NOT_FOUND', 'Project not found');
    const p = st.projects[pIdx];

    this.assertCan('company:edit', p.companyId);

    const company = st.companies.find((c) => c.id === p.companyId);
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status !== 'active') {
      throw new AppError('VALIDATION_ERROR', 'Company must be active to reactivate a project');
    }

    if (p.status === 'active') return;
    const projects = st.projects.slice();
    projects[pIdx] = { ...p, status: 'active', deactivatedAt: undefined };
    writeState({ ...st, projects });
  }

  async deleteProject(projectId: ProjectId): Promise<void> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Project not found');

    this.assertCan('company:edit', p.companyId);

    if (p.status !== 'archived') {
      throw new AppError('VALIDATION_ERROR', 'Project must be deactivated before deletion');
    }

    const projects = st.projects.filter((x) => x.id !== projectId);
    const projectMemberships = st.projectMemberships.filter((m) => m.projectId !== projectId);

    const dataByProjectId = { ...st.dataByProjectId };
    delete dataByProjectId[projectId];

    writeState({
      ...st,
      projects,
      projectMemberships,
      dataByProjectId,
      activeProjectId: st.activeProjectId === projectId ? null : st.activeProjectId,
    });
  }

  async createUserInCompany(
    companyId: CompanyId,
    input: { name: string; email: string; role: CompanyRole; sendOnboardingEmail?: boolean }
  ): Promise<CompanyUserInviteResult> {
    const st = ensureState();
    this.assertCan('company:manage_members', companyId);
    validateOrThrow(userNameSchema, input.name);
    validateOrThrow(emailSchema, input.email);
    const emailNorm = input.email.trim().toLowerCase();
    const existingUser = st.users.find((u) => u.email.trim().toLowerCase() === emailNorm);
    const next: User = existingUser ?? {
      id: asUserId(uid('usr')),
      name: input.name.trim(),
      email: input.email.trim(),
    };
    if (!existingUser) {
      writeState({ ...st, users: [...st.users, next] });
    }
    const membershipCreated = !st.companyMemberships.some(
      (m) => m.companyId === companyId && m.userId === next.id
    );
    await this.upsertCompanyMembership(companyId, next.id, input.role);
    return {
      user: next,
      createdAuthUser: !existingUser,
      membershipCreated,
      onboardingEmailSent: false,
      onboardingDelivery: 'none',
    };
  }

  async sendCompanyUserInviteEmail(companyId: CompanyId, userId: UserId): Promise<CompanyUserInviteResult> {
    const st = ensureState();
    this.assertCan('company:manage_members', companyId);
    const user = st.users.find((u) => u.id === userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const hasMembership = st.companyMemberships.some((m) => m.companyId === companyId && m.userId === userId);
    if (!hasMembership) throw new AppError('NOT_FOUND', 'User is not a member of this company');
    return {
      user,
      createdAuthUser: false,
      membershipCreated: false,
      onboardingEmailSent: false,
      onboardingDelivery: 'none',
    };
  }

  async importTransactions(
    projectId: ProjectId,
    input: TxnImportInput
  ): Promise<{ count: number }> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:import', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');
    const normalizedIncoming = input.txns.map((t) => {
      if (t.projectId !== projectId) {
        throw new AppError('VALIDATION_ERROR', 'Transaction projectId does not match import target');
      }
      if (t.companyId !== p.companyId) {
        throw new AppError('VALIDATION_ERROR', 'Transaction companyId does not match project company');
      }
      return {
        ...t,
        externalId: normalizeExternalId(t.externalId),
      };
    });
    const defaults = st.companyDefaultsByCompanyId[p.companyId] ?? emptyCompanyDefaultsSlice();
    const autoMappedIncoming = normalizedIncoming.map((txn) =>
      mapImportedTransactionWithCompanyDefaults({
        txn,
        rules: defaults.mappingRules,
        defaultCategories: defaults.categories,
        defaultSubCategories: defaults.subCategories,
        projectCategories: slice.categories,
        projectSubCategories: slice.subCategories,
      })
    );
    autoMappedIncoming.forEach((txn) => validateOrThrow(txnInputSchema, txn));

    let budgets = slice.budgets;
    if (input.autoCreateBudgets) {
      this.assertCan('budget:edit', p.companyId, projectId);
      const existingBudgetSubIds = new Set(
        budgets.map((budget) => budget.subCategoryId).filter((id): id is SubCategory['id'] => Boolean(id))
      );
      const nextBudgets = budgets.slice();
      for (const txn of autoMappedIncoming) {
        if (!txn.categoryId || !txn.subCategoryId || existingBudgetSubIds.has(txn.subCategoryId)) continue;
        existingBudgetSubIds.add(txn.subCategoryId);
        nextBudgets.push({
          id: asBudgetLineId(uid('bud')),
          companyId: p.companyId,
          projectId,
          categoryId: txn.categoryId,
          subCategoryId: txn.subCategoryId,
          allocatedCents: 0,
          createdAt: this.nowIso(),
          updatedAt: this.nowIso(),
        });
      }
      budgets = nextBudgets;
    }

    const nextTxns =
      input.mode === 'replaceAll'
        ? autoMappedIncoming
        : [...slice.transactions, ...autoMappedIncoming];

    assertUniqueTransactionKeysInProject(nextTxns);

    writeState({
      ...st,
      dataByProjectId: {
        ...st.dataByProjectId,
        [projectId]: { ...slice, transactions: nextTxns, budgets },
      },
    });
    return { count: autoMappedIncoming.length };
  }

  async previewImportTransactions(
    projectId: ProjectId,
    input: { csvText: string; autoCreateStructures?: boolean }
  ): Promise<{ rows: ImportPreviewRow[] }> {
    const st = ensureState();
    const p = st.projects.find((x) => x.id === projectId);
    if (!p) throw new AppError('NOT_FOUND', 'Unknown project');
    this.assertCan('project:import', p.companyId, projectId);
    const slice = st.dataByProjectId[projectId];
    if (!slice) throw new AppError('NOT_FOUND', 'Unknown project');

    const session = this.requireSession();
    const canEditTaxonomy =
      Boolean(input.autoCreateStructures) &&
      can({
        userId: session.userId,
        action: 'taxonomy:edit',
        companyId: p.companyId,
        projectId,
        companyMemberships: st.companyMemberships,
        projectMemberships: st.projectMemberships,
      });
    const canEditBudgets =
      Boolean(input.autoCreateStructures) &&
      can({
        userId: session.userId,
        action: 'budget:edit',
        companyId: p.companyId,
        projectId,
        companyMemberships: st.companyMemberships,
        projectMemberships: st.projectMemberships,
      });

    const defaults = st.companyDefaultsByCompanyId[p.companyId] ?? emptyCompanyDefaultsSlice();

    return planImportPreview({
      csvText: input.csvText,
      existingTransactions: slice.transactions,
      categories: slice.categories,
      subCategories: slice.subCategories,
      budgets: slice.budgets,
      defaultCategories: defaults.categories,
      defaultSubCategories: defaults.subCategories,
      mappingRules: defaults.mappingRules,
      autoCreateStructures: Boolean(input.autoCreateStructures),
      canEditTaxonomy,
      canEditBudgets,
    });
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
      const preferred = st.companies.find((c) => c.status === 'active' && c.id !== asCompanyId('co_projex'))
        ?? st.companies.find((c) => c.status === 'active')
        ?? st.companies[0];
      return preferred?.id ?? null;
    }

    const primary = getPrimaryCompanyForUser(userId, st.companyMemberships);
    if (primary) {
      const c = st.companies.find((x) => x.id === primary.companyId) ?? null;
      if (c && c.status === 'active') return primary.companyId;
    }

    return (st.companies.find((c) => c.status === 'active') ?? st.companies[0])?.id ?? null;
  }
}
