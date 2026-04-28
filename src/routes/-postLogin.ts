import type { ProjexApi } from '../api/contract';
import type { UserId } from '../types';

export async function getPostLoginTarget(api: ProjexApi, userId: UserId) {
  const users = await api.listUsers();
  const isSuperadmin =
    users.find((user) => user.id === userId)?.isGlobalSuperadmin === true;
  if (isSuperadmin) return { to: '/companies' as const };

  const companies = await api.listCompanies();
  if (companies.length > 1) return { to: '/companies' as const };

  const companyId = await api.getDefaultCompanyIdForUser(userId);
  if (companyId) {
    return {
      to: '/c/$companyId' as const,
      params: { companyId },
    };
  }

  return { to: '/companies' as const };
}
