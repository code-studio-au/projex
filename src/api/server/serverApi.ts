/* eslint-disable @typescript-eslint/no-unused-vars */
import type { z } from 'zod';
import type { ProjexApi } from '../types';
import { AppError, type AppErrorCode } from '../errors';
import type {
  BudgetLine,
  Category,
  Company,
  CompanyDefaultCategory,
  CompanyDefaultMappingRule,
  CompanyDefaultSubCategory,
  CompanyId,
  CompanyMembership,
  CompanyRole,
  Project,
  ProjectId,
  ProjectMembership,
  ProjectRole,
  SubCategory,
  Txn,
  TxnId,
  User,
  UserId,
  ImportPreviewRow,
} from '../../types';
import type {
  BudgetCreateInput,
  BudgetUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyDefaultMappingRuleCreateInput,
  CompanyDefaultMappingRuleUpdateInput,
  CompanyUserInviteResult,
  CompanyUpdateInput,
  EmailChangeConfirmResult,
  EmailChangeRequestInput,
  EmailChangeRequestResult,
  PendingEmailChange,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProfileUpdateInput,
  Session,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
  TxnCreateInput,
  TxnUpdateInput,
} from '../types';
import {
  companiesResponseSchema,
  companyMembershipsResponseSchema,
  companyResponseSchema,
  companyUserInviteResultResponseSchema,
  countResponseSchema,
  defaultCompanyResponseSchema,
  emailChangeConfirmResponseSchema,
  emailChangeRequestResponseSchema,
  pendingEmailChangeResponseSchema,
  projectMembershipsResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  authenticatedSessionResponseSchema,
  sessionResponseSchema,
  txnImportPreviewResultResponseSchema,
  userResponseSchema,
  usersResponseSchema,
} from '../../validation/responseSchemas';

type ApiErrorBody = {
  code?: AppErrorCode;
  message?: string;
  meta?: Record<string, unknown> | null;
};

/**
 * Server-backed API adapter that talks to Start file routes under `/api/*`.
 */
export class ServerApi implements ProjexApi {
  private async getStartServerRequest(): Promise<Request | null> {
    if (typeof window !== 'undefined') return null;

    try {
      const loadStartServer = new Function(
        'return import("@tanstack/start-server-core")'
      ) as () => Promise<{ getRequest?: () => Request | undefined }>;
      const mod = await loadStartServer();
      return mod.getRequest?.() ?? null;
    } catch {
      return null;
    }
  }

  private async resolveUrl(path: string): Promise<string> {
    if (/^https?:\/\//.test(path)) return path;
    if (typeof window !== 'undefined') return path;

    const request = await this.getStartServerRequest();
    if (request) return new URL(path, request.url).toString();

    return new URL(path, 'http://127.0.0.1:3000').toString();
  }

  private async getServerRequestHeaders(): Promise<HeadersInit | null> {
    if (typeof window !== 'undefined') return null;

    try {
      const request = await this.getStartServerRequest();
      if (!request) return null;

      const headers = new Headers();
      const cookie = request.headers.get('cookie');
      if (cookie) headers.set('cookie', cookie);
      const authorization = request.headers.get('authorization');
      if (authorization) headers.set('authorization', authorization);
      const origin = request.headers.get('origin');
      if (origin) headers.set('origin', origin);
      const referer = request.headers.get('referer');
      if (referer) headers.set('referer', referer);
      return headers;
    } catch {
      return null;
    }
  }

  private parseResponseBody(text: string): unknown {
    if (!text) return null;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AppError('INTERNAL_ERROR', 'Invalid JSON response from API');
    }
  }

  private validateResponse<T>(schema: z.ZodType<T> | undefined, body: unknown, path: string): T {
    if (!schema) return body as T;

    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;

    throw new AppError('INTERNAL_ERROR', `Invalid API response from ${path}`, {
      issues: parsed.error.issues,
    });
  }

  private async request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
    const serverHeaders = await this.getServerRequestHeaders();
    const res = await fetch(await this.resolveUrl(path), {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(serverHeaders ? Object.fromEntries(new Headers(serverHeaders).entries()) : {}),
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    const body = this.parseResponseBody(text);

    if (!res.ok) {
      const errBody = (body ?? {}) as ApiErrorBody;
      const code = errBody.code ?? this.statusToCode(res.status);
      const message = errBody.message ?? `Request failed (${res.status})`;
      throw new AppError(code, message, errBody.meta ?? undefined);
    }

    return this.validateResponse(schema, body, path);
  }

  private statusToCode(status: number): AppErrorCode {
    if (status === 401) return 'UNAUTHENTICATED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION_ERROR';
    if (status === 501) return 'NOT_IMPLEMENTED';
    return 'INTERNAL_ERROR';
  }

  // session
  async getSession(): Promise<Session | null> {
    return this.request('/api/session', { cache: 'no-store' }, sessionResponseSchema);
  }
  async loginAs(_userId: UserId): Promise<Session> {
    return this.request(
      '/api/dev/session',
      {
        method: 'POST',
        body: JSON.stringify({ userId: _userId }),
      },
      authenticatedSessionResponseSchema
    );
  }
  async logout(): Promise<void> {
    await this.request<void>('/api/session', { method: 'DELETE' });
  }

  // reference data
  async listUsers(): Promise<User[]> {
    return this.request('/api/users', undefined, usersResponseSchema);
  }
  async listCompanies(): Promise<Company[]> {
    return this.request('/api/companies', undefined, companiesResponseSchema);
  }
  async listProjects(companyId: CompanyId): Promise<Project[]> {
    return this.request(
      `/api/companies/${encodeURIComponent(companyId)}/projects`,
      undefined,
      projectsResponseSchema
    );
  }
  async getCompany(companyId: CompanyId): Promise<Company | null> {
    return this.request(
      `/api/companies/${encodeURIComponent(companyId)}`,
      undefined,
      companyResponseSchema.nullable()
    );
  }
  async getProject(projectId: ProjectId): Promise<Project | null> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}`,
      undefined,
      projectResponseSchema.nullable()
    );
  }

  // memberships
  async listCompanyMemberships(_companyId: CompanyId): Promise<CompanyMembership[]> {
    return this.request(
      `/api/companies/${encodeURIComponent(_companyId)}/memberships`,
      undefined,
      companyMembershipsResponseSchema
    );
  }
  async listAllCompanyMemberships(): Promise<CompanyMembership[]> {
    return this.request('/api/memberships/companies', undefined, companyMembershipsResponseSchema);
  }
  async listProjectMemberships(_projectId: ProjectId): Promise<ProjectMembership[]> {
    return this.request(
      `/api/projects/${encodeURIComponent(_projectId)}/memberships`,
      undefined,
      projectMembershipsResponseSchema
    );
  }
  async listMyProjectMemberships(_companyId: CompanyId): Promise<ProjectMembership[]> {
    return this.request(
      `/api/companies/${encodeURIComponent(_companyId)}/my-project-memberships`,
      undefined,
      projectMembershipsResponseSchema
    );
  }
  async upsertCompanyMembership(
    _companyId: CompanyId,
    _userId: UserId,
    _role: CompanyRole
  ): Promise<CompanyMembership> {
    return this.request<CompanyMembership>(
      `/api/companies/${encodeURIComponent(_companyId)}/memberships`,
      {
        method: 'POST',
        body: JSON.stringify({ userId: _userId, role: _role }),
      }
    );
  }
  async deleteCompanyMembership(_companyId: CompanyId, _userId: UserId): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/companies/${encodeURIComponent(_companyId)}/memberships?userId=${encodeURIComponent(_userId)}`,
      { method: 'DELETE' }
    );
  }
  async upsertProjectMembership(
    _projectId: ProjectId,
    _userId: UserId,
    _role: ProjectRole
  ): Promise<ProjectMembership> {
    return this.request<ProjectMembership>(
      `/api/projects/${encodeURIComponent(_projectId)}/memberships`,
      {
        method: 'POST',
        body: JSON.stringify({ userId: _userId, role: _role }),
      }
    );
  }
  async deleteProjectMembership(
    _projectId: ProjectId,
    _userId: UserId,
    _role: ProjectRole
  ): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(_projectId)}/memberships?userId=${encodeURIComponent(_userId)}&role=${encodeURIComponent(_role)}`,
      { method: 'DELETE' }
    );
  }
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
    const existing = await this.listProjectMemberships(projectId);
    const membership = existing.find((m) => m.userId === userId);
    if (!membership) return;
    await this.deleteProjectMembership(projectId, userId, membership.role);
  }

  // taxonomy
  async listCompanyDefaultCategories(companyId: CompanyId) {
    return this.request<CompanyDefaultCategory[]>(
      `/api/companies/${encodeURIComponent(companyId)}/default-categories`
    );
  }
  async listCompanyDefaultSubCategories(companyId: CompanyId) {
    return this.request<CompanyDefaultSubCategory[]>(
      `/api/companies/${encodeURIComponent(companyId)}/default-sub-categories`
    );
  }
  async listCompanyDefaultMappingRules(companyId: CompanyId) {
    return this.request<CompanyDefaultMappingRule[]>(
      `/api/companies/${encodeURIComponent(companyId)}/default-mapping-rules`
    );
  }
  async createCompanyDefaultCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['createCompanyDefaultCategory']>[1]
  ) {
    return this.request<CompanyDefaultCategory>(
      `/api/companies/${encodeURIComponent(companyId)}/default-categories`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }
  async updateCompanyDefaultCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['updateCompanyDefaultCategory']>[1]
  ) {
    return this.request<CompanyDefaultCategory>(
      `/api/companies/${encodeURIComponent(companyId)}/default-categories`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  }
  async deleteCompanyDefaultCategory(companyId: CompanyId, categoryId: string): Promise<void> {
    await this.request(
      `/api/companies/${encodeURIComponent(companyId)}/default-categories/${encodeURIComponent(categoryId)}`,
      { method: 'DELETE' }
    );
  }
  async createCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['createCompanyDefaultSubCategory']>[1]
  ) {
    return this.request<CompanyDefaultSubCategory>(
      `/api/companies/${encodeURIComponent(companyId)}/default-sub-categories`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }
  async updateCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['updateCompanyDefaultSubCategory']>[1]
  ) {
    return this.request<CompanyDefaultSubCategory>(
      `/api/companies/${encodeURIComponent(companyId)}/default-sub-categories`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  }
  async deleteCompanyDefaultSubCategory(
    companyId: CompanyId,
    subCategoryId: string
  ): Promise<void> {
    await this.request(
      `/api/companies/${encodeURIComponent(companyId)}/default-sub-categories/${encodeURIComponent(subCategoryId)}`,
      { method: 'DELETE' }
    );
  }
  async createCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleCreateInput
  ): Promise<CompanyDefaultMappingRule> {
    return this.request<CompanyDefaultMappingRule>(
      `/api/companies/${encodeURIComponent(companyId)}/default-mapping-rules`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }
  async updateCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: CompanyDefaultMappingRuleUpdateInput
  ): Promise<CompanyDefaultMappingRule> {
    return this.request<CompanyDefaultMappingRule>(
      `/api/companies/${encodeURIComponent(companyId)}/default-mapping-rules`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  }
  async deleteCompanyDefaultMappingRule(
    companyId: CompanyId,
    ruleId: CompanyDefaultMappingRule['id']
  ): Promise<void> {
    await this.request(
      `/api/companies/${encodeURIComponent(companyId)}/default-mapping-rules/${encodeURIComponent(ruleId)}`,
      { method: 'DELETE' }
    );
  }
  async applyCompanyDefaultTaxonomy(projectId: ProjectId) {
    return this.request<{
      companyDefaultsConfigured: boolean;
      categoriesAdded: number;
      subCategoriesAdded: number;
    }>(
      `/api/projects/${encodeURIComponent(projectId)}/apply-company-default-taxonomy`,
      {
        method: 'POST',
      }
    );
  }
  async listCategories(_projectId: ProjectId): Promise<Category[]> {
    return this.request<Category[]>(`/api/projects/${encodeURIComponent(_projectId)}/categories`);
  }
  async listSubCategories(_projectId: ProjectId): Promise<SubCategory[]> {
    return this.request<SubCategory[]>(
      `/api/projects/${encodeURIComponent(_projectId)}/sub-categories`
    );
  }
  async createCategory(_projectId: ProjectId, _input: CategoryCreateInput): Promise<Category> {
    return this.request<Category>(`/api/projects/${encodeURIComponent(_projectId)}/categories`, {
      method: 'POST',
      body: JSON.stringify(_input),
    });
  }
  async updateCategory(_projectId: ProjectId, _input: CategoryUpdateInput): Promise<Category> {
    return this.request<Category>(`/api/projects/${encodeURIComponent(_projectId)}/categories`, {
      method: 'PATCH',
      body: JSON.stringify(_input),
    });
  }
  async deleteCategory(_projectId: ProjectId, _categoryId: Category['id']): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(_projectId)}/categories/${encodeURIComponent(_categoryId)}`,
      { method: 'DELETE' }
    );
  }
  async createSubCategory(
    _projectId: ProjectId,
    _input: SubCategoryCreateInput
  ): Promise<SubCategory> {
    return this.request<SubCategory>(
      `/api/projects/${encodeURIComponent(_projectId)}/sub-categories`,
      {
        method: 'POST',
        body: JSON.stringify(_input),
      }
    );
  }
  async updateSubCategory(
    _projectId: ProjectId,
    _input: SubCategoryUpdateInput
  ): Promise<SubCategory> {
    return this.request<SubCategory>(
      `/api/projects/${encodeURIComponent(_projectId)}/sub-categories`,
      {
        method: 'PATCH',
        body: JSON.stringify(_input),
      }
    );
  }
  async deleteSubCategory(_projectId: ProjectId, _subCategoryId: SubCategory['id']): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(_projectId)}/sub-categories/${encodeURIComponent(_subCategoryId)}`,
      { method: 'DELETE' }
    );
  }

  // budgets
  async listBudgets(_projectId: ProjectId): Promise<BudgetLine[]> {
    return this.request<BudgetLine[]>(`/api/projects/${encodeURIComponent(_projectId)}/budgets`);
  }
  async createBudget(_projectId: ProjectId, _input: BudgetCreateInput): Promise<BudgetLine> {
    return this.request<BudgetLine>(`/api/projects/${encodeURIComponent(_projectId)}/budgets`, {
      method: 'POST',
      body: JSON.stringify(_input),
    });
  }
  async updateBudget(_projectId: ProjectId, _input: BudgetUpdateInput): Promise<BudgetLine> {
    return this.request<BudgetLine>(`/api/projects/${encodeURIComponent(_projectId)}/budgets`, {
      method: 'PATCH',
      body: JSON.stringify(_input),
    });
  }
  async deleteBudget(_projectId: ProjectId, _budgetId: BudgetLine['id']): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(_projectId)}/budgets/${encodeURIComponent(_budgetId)}`,
      { method: 'DELETE' }
    );
  }

  // transactions
  async listTransactions(projectId: ProjectId): Promise<Txn[]> {
    return this.request<Txn[]>(`/api/projects/${encodeURIComponent(projectId)}/transactions`);
  }
  async createTxn(projectId: ProjectId, txn: TxnCreateInput): Promise<Txn> {
    return this.request<Txn>(`/api/projects/${encodeURIComponent(projectId)}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ txn }),
    });
  }
  async updateTxn(projectId: ProjectId, txn: TxnUpdateInput): Promise<Txn> {
    return this.request<Txn>(`/api/projects/${encodeURIComponent(projectId)}/transactions`, {
      method: 'PATCH',
      body: JSON.stringify({ txn }),
    });
  }
  async deleteTxn(projectId: ProjectId, txnId: TxnId): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/projects/${encodeURIComponent(projectId)}/transactions/${encodeURIComponent(txnId)}`,
      { method: 'DELETE' }
    );
  }
  async importTransactions(
    projectId: ProjectId,
    input: Parameters<ProjexApi['importTransactions']>[1]
  ): Promise<{ count: number }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/transactions/import`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      countResponseSchema
    );
  }
  async previewImportTransactions(
    projectId: ProjectId,
    input: Parameters<ProjexApi['previewImportTransactions']>[1]
  ): Promise<{ rows: ImportPreviewRow[] }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/transactions/import-preview`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      txnImportPreviewResultResponseSchema
    );
  }

  // admin
  async resetToSeed(): Promise<void> {
    await this.request<{ ok: true }>('/api/dev/reset-seed', { method: 'POST' });
  }

  // helpers
  async getDefaultCompanyIdForUser(_userId: UserId): Promise<CompanyId | null> {
    const res = await this.request('/api/me/default-company', undefined, defaultCompanyResponseSchema);
    return res.companyId;
  }
  async updateCurrentUserProfile(input: ProfileUpdateInput): Promise<User> {
    return this.request(
      '/api/me/profile',
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
      userResponseSchema
    );
  }
  async getPendingEmailChange(): Promise<PendingEmailChange | null> {
    return this.request('/api/me/email-change', undefined, pendingEmailChangeResponseSchema);
  }
  async requestEmailChange(input: EmailChangeRequestInput): Promise<EmailChangeRequestResult> {
    return this.request(
      '/api/me/email-change',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      emailChangeRequestResponseSchema
    );
  }
  async resendEmailChange(): Promise<EmailChangeRequestResult> {
    return this.request(
      '/api/me/email-change/resend',
      {
        method: 'POST',
      },
      emailChangeRequestResponseSchema
    );
  }
  async cancelEmailChange(): Promise<void> {
    await this.request<void>('/api/me/email-change', {
      method: 'DELETE',
    });
  }
  async confirmEmailChange(token: string): Promise<EmailChangeConfirmResult> {
    return this.request(
      '/api/me/email-change/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      },
      emailChangeConfirmResponseSchema
    );
  }
  async createUserInCompany(
    _companyId: CompanyId,
    _input: { name: string; email: string; role: CompanyRole; sendOnboardingEmail?: boolean }
  ): Promise<CompanyUserInviteResult> {
    return this.request(
      `/api/companies/${encodeURIComponent(_companyId)}/users`,
      {
        method: 'POST',
        body: JSON.stringify(_input),
      },
      companyUserInviteResultResponseSchema
    );
  }
  async sendCompanyUserInviteEmail(_companyId: CompanyId, _userId: UserId): Promise<CompanyUserInviteResult> {
    return this.request(
      `/api/companies/${encodeURIComponent(_companyId)}/users/${encodeURIComponent(_userId)}/invite`,
      {
        method: 'POST',
      },
      companyUserInviteResultResponseSchema
    );
  }

  // projects / companies
  async createProject(_companyId: CompanyId, _input: ProjectCreateInput): Promise<Project> {
    return this.request(
      `/api/companies/${encodeURIComponent(_companyId)}/projects`,
      {
        method: 'POST',
        body: JSON.stringify(_input),
      },
      projectResponseSchema
    );
  }
  async updateProject(_input: ProjectUpdateInput): Promise<Project> {
    const { id, ...patch } = _input;
    return this.request(
      `/api/projects/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
      projectResponseSchema
    );
  }
  async createCompany(_input: Pick<Company, 'name'> & { id?: CompanyId }): Promise<Company> {
    return this.request(
      '/api/companies',
      {
        method: 'POST',
        body: JSON.stringify(_input),
      },
      companyResponseSchema
    );
  }
  async updateCompany(_input: CompanyUpdateInput): Promise<Company> {
    const { id, ...patch } = _input;
    return this.request(
      `/api/companies/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
      companyResponseSchema
    );
  }

  async deactivateCompany(_companyId: CompanyId): Promise<void> {
    await this.request<{ ok: true }>(`/api/companies/${encodeURIComponent(_companyId)}/deactivate`, {
      method: 'POST',
    });
  }
  async reactivateCompany(_companyId: CompanyId): Promise<void> {
    await this.request<{ ok: true }>(`/api/companies/${encodeURIComponent(_companyId)}/reactivate`, {
      method: 'POST',
    });
  }
  async deleteCompany(_companyId: CompanyId): Promise<void> {
    await this.request<{ ok: true }>(`/api/companies/${encodeURIComponent(_companyId)}`, {
      method: 'DELETE',
    });
  }
  async deactivateProject(_projectId: ProjectId): Promise<void> {
    await this.request<{ ok: true }>(`/api/projects/${encodeURIComponent(_projectId)}/deactivate`, {
      method: 'POST',
    });
  }
  async reactivateProject(_projectId: ProjectId): Promise<void> {
    await this.request<{ ok: true }>(`/api/projects/${encodeURIComponent(_projectId)}/reactivate`, {
      method: 'POST',
    });
  }
  async deleteProject(_projectId: ProjectId): Promise<void> {
    await this.request<{ ok: true }>(`/api/projects/${encodeURIComponent(_projectId)}`, {
      method: 'DELETE',
    });
  }
}
