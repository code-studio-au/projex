import type { ProjexApi } from '../api/contract';
import type { UserId } from '../types';

export async function getPostLoginTarget(api: ProjexApi, userId: UserId) {
  const memberships = await api.listAllCompanyMemberships();
  const isSuperadmin = memberships.some((m) => m.userId === userId && m.role === 'superadmin');
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
