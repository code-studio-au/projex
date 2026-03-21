/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ProjexApi } from '../types';
import { AppError, type AppErrorCode } from '../errors';
import type {
  BudgetLine,
  Category,
  Company,
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
} from '../../types';
import type {
  BudgetCreateInput,
  BudgetUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  CompanyUserInviteResult,
  CompanyUpdateInput,
  CsvImportMode,
  EmailChangeConfirmResult,
  EmailChangeRequestInput,
  EmailChangeRequestResult,
  ProjectCreateInput,
  ProjectUpdateInput,
  ProfileUpdateInput,
  Session,
  SubCategoryCreateInput,
  SubCategoryUpdateInput,
  TxnCreateInput,
  TxnUpdateInput,
} from '../types';

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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
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
    const body = text ? (JSON.parse(text) as unknown) : null;

    if (!res.ok) {
      const errBody = (body ?? {}) as ApiErrorBody;
      const code = errBody.code ?? this.statusToCode(res.status);
      const message = errBody.message ?? `Request failed (${res.status})`;
      throw new AppError(code, message, errBody.meta ?? undefined);
    }

    return body as T;
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
    return this.request<Session | null>('/api/session');
  }
  async loginAs(_userId: UserId): Promise<Session> {
    return this.request<Session>('/api/dev/session', {
      method: 'POST',
      body: JSON.stringify({ userId: _userId }),
    });
  }
  async logout(): Promise<void> {
    await this.request<void>('/api/session', { method: 'DELETE' });
  }

  // reference data
  async listUsers(): Promise<User[]> {
    return this.request<User[]>('/api/users');
  }
  async listCompanies(): Promise<Company[]> {
    return this.request<Company[]>('/api/companies');
  }
  async listProjects(companyId: CompanyId): Promise<Project[]> {
    return this.request<Project[]>(`/api/companies/${encodeURIComponent(companyId)}/projects`);
  }
  async getCompany(companyId: CompanyId): Promise<Company | null> {
    return this.request<Company | null>(`/api/companies/${encodeURIComponent(companyId)}`);
  }
  async getProject(projectId: ProjectId): Promise<Project | null> {
    return this.request<Project | null>(`/api/projects/${encodeURIComponent(projectId)}`);
  }

  // memberships
  async listCompanyMemberships(_companyId: CompanyId): Promise<CompanyMembership[]> {
    return this.request<CompanyMembership[]>(
      `/api/companies/${encodeURIComponent(_companyId)}/memberships`
    );
  }
  async listAllCompanyMemberships(): Promise<CompanyMembership[]> {
    return this.request<CompanyMembership[]>('/api/memberships/companies');
  }
  async listProjectMemberships(_projectId: ProjectId): Promise<ProjectMembership[]> {
    return this.request<ProjectMembership[]>(
      `/api/projects/${encodeURIComponent(_projectId)}/memberships`
    );
  }
  async listMyProjectMemberships(_companyId: CompanyId): Promise<ProjectMembership[]> {
    return this.request<ProjectMembership[]>(
      `/api/companies/${encodeURIComponent(_companyId)}/my-project-memberships`
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
    input: { txns: Txn[]; mode: CsvImportMode }
  ): Promise<{ count: number }> {
    return this.request<{ count: number }>(
      `/api/projects/${encodeURIComponent(projectId)}/transactions/import`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  }

  // admin
  async resetToSeed(): Promise<void> {
    await this.request<{ ok: true }>('/api/dev/reset-seed', { method: 'POST' });
  }

  // helpers
  async getDefaultCompanyIdForUser(_userId: UserId): Promise<CompanyId | null> {
    const res = await this.request<{ companyId: CompanyId | null }>('/api/me/default-company');
    return res.companyId;
  }
  async updateCurrentUserProfile(input: ProfileUpdateInput): Promise<User> {
    return this.request<User>('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async requestEmailChange(input: EmailChangeRequestInput): Promise<EmailChangeRequestResult> {
    return this.request<EmailChangeRequestResult>('/api/me/email-change', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  async confirmEmailChange(token: string): Promise<EmailChangeConfirmResult> {
    return this.request<EmailChangeConfirmResult>('/api/me/email-change/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }
  async createUserInCompany(
    _companyId: CompanyId,
    _name: string,
    _email: string,
    _role: CompanyRole
  ): Promise<CompanyUserInviteResult> {
    return this.request<CompanyUserInviteResult>(`/api/companies/${encodeURIComponent(_companyId)}/users`, {
      method: 'POST',
      body: JSON.stringify({
        name: _name,
        email: _email,
        role: _role,
      }),
    });
  }
  async sendCompanyUserInviteEmail(_companyId: CompanyId, _userId: UserId): Promise<CompanyUserInviteResult> {
    return this.request<CompanyUserInviteResult>(
      `/api/companies/${encodeURIComponent(_companyId)}/users/${encodeURIComponent(_userId)}/invite`,
      {
        method: 'POST',
      }
    );
  }

  // projects / companies
  async createProject(_companyId: CompanyId, _input: ProjectCreateInput): Promise<Project> {
    return this.request<Project>(`/api/companies/${encodeURIComponent(_companyId)}/projects`, {
      method: 'POST',
      body: JSON.stringify(_input),
    });
  }
  async updateProject(_input: ProjectUpdateInput): Promise<Project> {
    const { id, ...patch } = _input;
    return this.request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }
  async createCompany(_input: Pick<Company, 'name'> & { id?: CompanyId }): Promise<Company> {
    return this.request<Company>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(_input),
    });
  }
  async updateCompany(_input: CompanyUpdateInput): Promise<Company> {
    const { id, ...patch } = _input;
    return this.request<Company>(`/api/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
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
