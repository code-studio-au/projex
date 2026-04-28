import type {
  ProjectCreateInput,
  ProjectUpdateInput,
  ProjexApi,
  Session,
} from '../../api/types';
import type {
  Company,
  CompanyId,
  CompanyRole,
  ProjectId,
  ProjectRole,
  TxnId,
  UserId,
} from '../../types';
import type { ServerFnContextInput } from '../fns/runtime';
import { toServerSession } from '../auth/session';
import {
  createCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  createUserInCompanyServer,
  sendCompanyUserInviteEmailServer,
  getCompanyServer,
  getCompanySummaryServer,
  getDefaultCompanyIdForUserServer,
  listCompaniesServer,
  listUsersServer,
  reactivateCompanyServer,
  updateCurrentUserProfileServer,
  updateCompanyServer,
} from '../fns/companies';
import {
  cancelEmailChangeServer,
  confirmEmailChangeServer,
  getPendingEmailChangeServer,
  requestEmailChangeServer,
  resendEmailChangeServer,
} from '../fns/account';
import {
  deleteCompanyMembershipServer,
  deleteProjectMembershipServer,
  listAllCompanyMembershipsServer,
  listCompanyMembershipsServer,
  listMyProjectMembershipsServer,
  listProjectMembershipsServer,
  upsertCompanyMembershipServer,
  upsertProjectMembershipServer,
} from '../fns/memberships';
import {
  createProjectServer,
  deactivateProjectServer,
  deleteProjectServer,
  getProjectServer,
  listProjectsServer,
  reactivateProjectServer,
  updateProjectServer,
} from '../fns/projects';
import {
  createTxnServer,
  deleteTxnServer,
  importTransactionsServer,
  listTransactionsServer,
  previewImportTransactionsServer,
  updateTxnServer,
} from '../fns/transactions';
import {
  applyCompanyDefaultTaxonomyServer,
  getCompanyDefaultsServer,
  createCompanyDefaultCategoryServer,
  createCompanyDefaultMappingRuleServer,
  createCompanyDefaultSubCategoryServer,
  createCategoryServer,
  createSubCategoryServer,
  deleteCompanyDefaultCategoryServer,
  deleteCompanyDefaultMappingRuleServer,
  deleteCompanyDefaultSubCategoryServer,
  deleteCategoryServer,
  deleteSubCategoryServer,
  listCompanyDefaultCategoriesServer,
  listCompanyDefaultMappingRulesServer,
  listCompanyDefaultSubCategoriesServer,
  listCategoriesServer,
  listSubCategoriesServer,
  updateCompanyDefaultCategoryServer,
  updateCompanyDefaultMappingRuleServer,
  updateCompanyDefaultSubCategoryServer,
  updateCategoryServer,
  updateSubCategoryServer,
} from '../fns/taxonomy';
import {
  createBudgetServer,
  deleteBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../fns/budgets';

/**
 * Server-only adapter for TanStack Start server functions/routes.
 *
 * Keep this out of client bundles. It wires the `ProjexApi` contract directly
 * to server function implementations with auth context.
 */
export class StartServerApi implements ProjexApi {
  private readonly context: ServerFnContextInput;

  constructor(context: ServerFnContextInput) {
    this.context = context;
  }

  // session
  async getSession() {
    const session = toServerSession(
      this.context.auth ?? this.context.session ?? null
    );
    if (!session) return null;
    const value: Session = { userId: session.userId };
    return value;
  }
  async logout() {
    // Auth logout is owned by the auth provider; keep this as a no-op for now.
    return;
  }

  // reference data
  async listUsers() {
    return listUsersServer({ context: this.context });
  }
  async listCompanies() {
    return listCompaniesServer({ context: this.context });
  }
  async listProjects(companyId: CompanyId) {
    return listProjectsServer({ context: this.context, companyId });
  }
  async getCompany(companyId: CompanyId) {
    return getCompanyServer({ context: this.context, companyId });
  }
  async getCompanySummary(companyId: CompanyId) {
    return getCompanySummaryServer({ context: this.context, companyId });
  }
  async getProject(projectId: ProjectId) {
    return getProjectServer({ context: this.context, projectId });
  }

  // memberships
  async listCompanyMemberships(companyId: CompanyId) {
    return listCompanyMembershipsServer({ context: this.context, companyId });
  }
  async listAllCompanyMemberships() {
    return listAllCompanyMembershipsServer({ context: this.context });
  }
  async listProjectMemberships(projectId: ProjectId) {
    return listProjectMembershipsServer({ context: this.context, projectId });
  }
  async listMyProjectMemberships(companyId: CompanyId) {
    return listMyProjectMembershipsServer({ context: this.context, companyId });
  }
  async upsertCompanyMembership(
    companyId: CompanyId,
    userId: UserId,
    role: CompanyRole
  ) {
    return upsertCompanyMembershipServer({
      context: this.context,
      companyId,
      userId,
      role,
    });
  }
  async deleteCompanyMembership(companyId: CompanyId, userId: UserId) {
    return deleteCompanyMembershipServer({
      context: this.context,
      companyId,
      userId,
    });
  }
  async upsertProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ) {
    return upsertProjectMembershipServer({
      context: this.context,
      projectId,
      userId,
      role,
    });
  }
  async deleteProjectMembership(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ) {
    return deleteProjectMembershipServer({
      context: this.context,
      projectId,
      userId,
      role,
    });
  }
  async setCompanyRole(
    companyId: CompanyId,
    userId: UserId,
    role: CompanyRole
  ) {
    await this.upsertCompanyMembership(companyId, userId, role);
  }
  async setProjectRole(
    projectId: ProjectId,
    userId: UserId,
    role: ProjectRole
  ) {
    await this.upsertProjectMembership(projectId, userId, role);
  }
  async removeCompanyMember(companyId: CompanyId, userId: UserId) {
    await this.deleteCompanyMembership(companyId, userId);
  }
  async removeProjectMember(projectId: ProjectId, userId: UserId) {
    const memberships = await this.listProjectMemberships(projectId);
    const existing = memberships.find((m) => m.userId === userId);
    if (!existing) return;
    await this.deleteProjectMembership(projectId, userId, existing.role);
  }

  // taxonomy
  async getCompanyDefaults(companyId: CompanyId) {
    return getCompanyDefaultsServer({ context: this.context, companyId });
  }
  async listCompanyDefaultCategories(companyId: CompanyId) {
    return listCompanyDefaultCategoriesServer({
      context: this.context,
      companyId,
    });
  }
  async listCompanyDefaultSubCategories(companyId: CompanyId) {
    return listCompanyDefaultSubCategoriesServer({
      context: this.context,
      companyId,
    });
  }
  async listCompanyDefaultMappingRules(companyId: CompanyId) {
    return listCompanyDefaultMappingRulesServer({
      context: this.context,
      companyId,
    });
  }
  async createCompanyDefaultCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['createCompanyDefaultCategory']>[1]
  ) {
    return createCompanyDefaultCategoryServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async updateCompanyDefaultCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['updateCompanyDefaultCategory']>[1]
  ) {
    return updateCompanyDefaultCategoryServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async deleteCompanyDefaultCategory(
    companyId: CompanyId,
    categoryId: Parameters<ProjexApi['deleteCompanyDefaultCategory']>[1]
  ) {
    return deleteCompanyDefaultCategoryServer({
      context: this.context,
      companyId,
      categoryId,
    });
  }
  async createCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['createCompanyDefaultSubCategory']>[1]
  ) {
    return createCompanyDefaultSubCategoryServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async updateCompanyDefaultSubCategory(
    companyId: CompanyId,
    input: Parameters<ProjexApi['updateCompanyDefaultSubCategory']>[1]
  ) {
    return updateCompanyDefaultSubCategoryServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async deleteCompanyDefaultSubCategory(
    companyId: CompanyId,
    subCategoryId: Parameters<ProjexApi['deleteCompanyDefaultSubCategory']>[1]
  ) {
    return deleteCompanyDefaultSubCategoryServer({
      context: this.context,
      companyId,
      subCategoryId,
    });
  }
  async createCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: Parameters<ProjexApi['createCompanyDefaultMappingRule']>[1]
  ) {
    return createCompanyDefaultMappingRuleServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async updateCompanyDefaultMappingRule(
    companyId: CompanyId,
    input: Parameters<ProjexApi['updateCompanyDefaultMappingRule']>[1]
  ) {
    return updateCompanyDefaultMappingRuleServer({
      context: this.context,
      companyId,
      input,
    });
  }
  async deleteCompanyDefaultMappingRule(
    companyId: CompanyId,
    ruleId: Parameters<ProjexApi['deleteCompanyDefaultMappingRule']>[1]
  ) {
    return deleteCompanyDefaultMappingRuleServer({
      context: this.context,
      companyId,
      ruleId,
    });
  }
  async applyCompanyDefaultTaxonomy(projectId: ProjectId) {
    return applyCompanyDefaultTaxonomyServer({
      context: this.context,
      projectId,
    });
  }
  async listCategories(projectId: ProjectId) {
    return listCategoriesServer({ context: this.context, projectId });
  }
  async listSubCategories(projectId: ProjectId) {
    return listSubCategoriesServer({ context: this.context, projectId });
  }
  async createCategory(
    projectId: ProjectId,
    input: Parameters<ProjexApi['createCategory']>[1]
  ) {
    return createCategoryServer({ context: this.context, projectId, input });
  }
  async updateCategory(
    projectId: ProjectId,
    input: Parameters<ProjexApi['updateCategory']>[1]
  ) {
    return updateCategoryServer({ context: this.context, projectId, input });
  }
  async deleteCategory(
    projectId: ProjectId,
    categoryId: Parameters<ProjexApi['deleteCategory']>[1]
  ) {
    return deleteCategoryServer({
      context: this.context,
      projectId,
      categoryId,
    });
  }
  async createSubCategory(
    projectId: ProjectId,
    input: Parameters<ProjexApi['createSubCategory']>[1]
  ) {
    return createSubCategoryServer({ context: this.context, projectId, input });
  }
  async updateSubCategory(
    projectId: ProjectId,
    input: Parameters<ProjexApi['updateSubCategory']>[1]
  ) {
    return updateSubCategoryServer({ context: this.context, projectId, input });
  }
  async deleteSubCategory(
    projectId: ProjectId,
    subCategoryId: Parameters<ProjexApi['deleteSubCategory']>[1]
  ) {
    return deleteSubCategoryServer({
      context: this.context,
      projectId,
      subCategoryId,
    });
  }

  // budgets
  async listBudgets(projectId: ProjectId) {
    return listBudgetsServer({ context: this.context, projectId });
  }
  async createBudget(
    projectId: ProjectId,
    input: Parameters<ProjexApi['createBudget']>[1]
  ) {
    return createBudgetServer({ context: this.context, projectId, input });
  }
  async updateBudget(
    projectId: ProjectId,
    input: Parameters<ProjexApi['updateBudget']>[1]
  ) {
    return updateBudgetServer({ context: this.context, projectId, input });
  }
  async deleteBudget(
    projectId: ProjectId,
    budgetId: Parameters<ProjexApi['deleteBudget']>[1]
  ) {
    return deleteBudgetServer({ context: this.context, projectId, budgetId });
  }

  // transactions
  async listTransactions(projectId: ProjectId) {
    return listTransactionsServer({ context: this.context, projectId });
  }
  async createTxn(
    projectId: ProjectId,
    input: Parameters<ProjexApi['createTxn']>[1]
  ) {
    return createTxnServer({
      context: this.context,
      projectId,
      input,
    });
  }
  async updateTxn(
    projectId: ProjectId,
    input: Parameters<ProjexApi['updateTxn']>[1]
  ) {
    return updateTxnServer({
      context: this.context,
      projectId,
      input,
    });
  }
  async deleteTxn(projectId: ProjectId, txnId: TxnId) {
    return deleteTxnServer({ context: this.context, projectId, txnId });
  }
  async importTransactions(
    projectId: ProjectId,
    input: Parameters<ProjexApi['importTransactions']>[1]
  ) {
    return importTransactionsServer({
      context: this.context,
      projectId,
      txns: input.txns,
      mode: input.mode,
      autoCreateBudgets: input.autoCreateBudgets,
    });
  }
  async previewImportTransactions(
    projectId: ProjectId,
    input: Parameters<ProjexApi['previewImportTransactions']>[1]
  ) {
    return previewImportTransactionsServer({
      context: this.context,
      projectId,
      csvText: input.csvText,
      autoCreateStructures: input.autoCreateStructures,
    });
  }

  // helpers
  async getPendingEmailChange() {
    return getPendingEmailChangeServer({ context: this.context });
  }
  async requestEmailChange(input: { newEmail: string }) {
    return requestEmailChangeServer({ context: this.context, input });
  }
  async resendEmailChange() {
    return resendEmailChangeServer({ context: this.context });
  }
  async cancelEmailChange() {
    return cancelEmailChangeServer({ context: this.context });
  }
  async confirmEmailChange(token: string) {
    return confirmEmailChangeServer({ context: this.context, token });
  }

  async getDefaultCompanyIdForUser(userId: UserId) {
    void userId;
    return getDefaultCompanyIdForUserServer({ context: this.context });
  }
  async updateCurrentUserProfile(input: { name: string }) {
    return updateCurrentUserProfileServer({ context: this.context, input });
  }
  async createUserInCompany(
    companyId: CompanyId,
    input: {
      name: string;
      email: string;
      role: CompanyRole;
      sendOnboardingEmail?: boolean;
    }
  ) {
    return createUserInCompanyServer({
      context: this.context,
      companyId,
      name: input.name,
      email: input.email,
      role: input.role,
      sendOnboardingEmail: input.sendOnboardingEmail,
    });
  }
  async sendCompanyUserInviteEmail(companyId: CompanyId, userId: UserId) {
    return sendCompanyUserInviteEmailServer({
      context: this.context,
      companyId,
      userId,
    });
  }

  // projects / companies
  async createProject(companyId: CompanyId, input: ProjectCreateInput) {
    return createProjectServer({ context: this.context, companyId, input });
  }
  async updateProject(input: ProjectUpdateInput) {
    return updateProjectServer({ context: this.context, input });
  }
  async createCompany(input: Pick<Company, 'name'> & { id?: CompanyId }) {
    return createCompanyServer({ context: this.context, input });
  }
  async updateCompany(input: Parameters<ProjexApi['updateCompany']>[0]) {
    return updateCompanyServer({ context: this.context, input });
  }

  async deactivateCompany(companyId: CompanyId) {
    return deactivateCompanyServer({ context: this.context, companyId });
  }
  async reactivateCompany(companyId: CompanyId) {
    return reactivateCompanyServer({ context: this.context, companyId });
  }
  async deleteCompany(companyId: CompanyId) {
    return deleteCompanyServer({ context: this.context, companyId });
  }
  async deactivateProject(projectId: ProjectId) {
    return deactivateProjectServer({ context: this.context, projectId });
  }
  async reactivateProject(projectId: ProjectId) {
    return reactivateProjectServer({ context: this.context, projectId });
  }
  async deleteProject(projectId: ProjectId) {
    return deleteProjectServer({ context: this.context, projectId });
  }
}
