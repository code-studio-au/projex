import type { ProjexApi } from '../types';
import { AppError } from '../errors';

/**
 * Server-backed API adapter stub.
 *
 * When migrating to TanStack Start, this adapter becomes a thin client wrapper
 * around Start server functions (or HTTP endpoints), keeping the UI code
 * unchanged.
 */
export class ServerApi implements ProjexApi {
  private notImplemented(): never {
    throw new AppError('NOT_IMPLEMENTED', 'Server API is not wired yet.');
  }

  // session
  async getSession() {
    return this.notImplemented();
  }
  async loginAs() {
    return this.notImplemented();
  }
  async logout() {
    return this.notImplemented();
  }

  // reference data
  async listUsers() {
    return this.notImplemented();
  }
  async listCompanies() {
    return this.notImplemented();
  }
  async listProjects() {
    return this.notImplemented();
  }
  async getCompany() {
    return this.notImplemented();
  }
  async getProject() {
    return this.notImplemented();
  }

  // memberships
  async listCompanyMemberships() {
    return this.notImplemented();
  }
  async listAllCompanyMemberships() {
    return this.notImplemented();
  }
  async listProjectMemberships() {
    return this.notImplemented();
  }
  async listMyProjectMemberships() {
    return this.notImplemented();
  }
  async upsertCompanyMembership() {
    return this.notImplemented();
  }
  async deleteCompanyMembership() {
    return this.notImplemented();
  }
  async upsertProjectMembership() {
    return this.notImplemented();
  }
  async deleteProjectMembership() {
    return this.notImplemented();
  }
  async setCompanyRole() {
    return this.notImplemented();
  }
  async setProjectRole() {
    return this.notImplemented();
  }
  async removeCompanyMember() {
    return this.notImplemented();
  }
  async removeProjectMember() {
    return this.notImplemented();
  }

  // taxonomy
  async listCategories() {
    return this.notImplemented();
  }
  async listSubCategories() {
    return this.notImplemented();
  }
  async createCategory() {
    return this.notImplemented();
  }
  async updateCategory() {
    return this.notImplemented();
  }
  async deleteCategory() {
    return this.notImplemented();
  }
  async createSubCategory() {
    return this.notImplemented();
  }
  async updateSubCategory() {
    return this.notImplemented();
  }
  async deleteSubCategory() {
    return this.notImplemented();
  }

  // budgets
  async listBudgets() {
    return this.notImplemented();
  }
  async createBudget() {
    return this.notImplemented();
  }
  async updateBudget() {
    return this.notImplemented();
  }
  async deleteBudget() {
    return this.notImplemented();
  }

  // transactions
  async listTransactions() {
    return this.notImplemented();
  }
  async createTxn() {
    return this.notImplemented();
  }
  async updateTxn() {
    return this.notImplemented();
  }
  async deleteTxn() {
    return this.notImplemented();
  }
  async importTransactions() {
    return this.notImplemented();
  }

  // admin
  async resetToSeed() {
    return this.notImplemented();
  }

  // helpers
  async getDefaultCompanyIdForUser() {
    return this.notImplemented();
  }
  async createUserInCompany() {
    return this.notImplemented();
  }

  // projects / companies
  async createProject() {
    return this.notImplemented();
  }
  async updateProject() {
    return this.notImplemented();
  }
  async createCompany() {
    return this.notImplemented();
  }
  async updateCompany() {
    return this.notImplemented();
  }

  async deactivateCompany() {
    return this.notImplemented();
  }
  async reactivateCompany() {
    return this.notImplemented();
  }
  async deleteCompany() {
    return this.notImplemented();
  }
  async deactivateProject() {
    return this.notImplemented();
  }
  async reactivateProject() {
    return this.notImplemented();
  }
  async deleteProject() {
    return this.notImplemented();
  }
}
