import type { CompanyId, CompanyMembership, UserId } from '../types';

export function getSingleCompanyRedirectId(args: {
  userId: UserId | null;
  isSuperadmin: boolean;
  memberships: CompanyMembership[];
}): CompanyId | null {
  if (!args.userId || args.isSuperadmin) return null;

  const companyIds = new Set(
    args.memberships.flatMap((membership) =>
      membership.userId === args.userId ? [membership.companyId] : []
    )
  );

  return companyIds.size === 1
    ? (companyIds.values().next().value ?? null)
    : null;
}
