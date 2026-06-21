import { Outlet, createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import type { CompanyMembership, UserId } from '../types';
import { asCompanyId } from '../types';
import { getUserCompanyRole } from '../store/access';
import {
  allCompanyMembershipsQueryOptions,
  myProjectMembershipsQueryOptions,
} from '../queries/memberships';
import { currentUserQueryOptions } from '../queries/account';
import {
  companiesQueryOptions,
  companyQueryOptions,
  projectsQueryOptions,
} from '../queries/reference';
import { companyDefaultsQueryOptions } from '../queries/taxonomy';
import { importRulesQueryOptions } from '../queries/importRules';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/_authed/c/$companyId')({
  component: Outlet,
  ssr: isServerAuthMode,
  loader: async ({ context, params }) => {
    const companyId = asCompanyId(params.companyId);
    const session = (context.queryClient.getQueryData(
      sessionQueryOptions().queryKey
    ) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))) as {
      userId: UserId;
    } | null;
    if (!session?.userId) return null;

    const [
      currentUser,
      ,
      companyMemberships,
      ,
      company,
      projects,
      companyDefaults,
    ] = await Promise.all([
      context.queryClient.ensureQueryData(
        currentUserQueryOptions(session.userId)
      ),
      context.queryClient.ensureQueryData(
        companiesQueryOptions(session.userId)
      ),
      context.queryClient.ensureQueryData(
        allCompanyMembershipsQueryOptions(session.userId)
      ),
      context.queryClient.ensureQueryData(
        myProjectMembershipsQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        companyQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        projectsQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        companyDefaultsQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        importRulesQueryOptions(session.userId, companyId)
      ),
    ]);

    const userCompanyCount = new Set(
      ((companyMemberships ?? []) as CompanyMembership[])
        .filter((membership) => membership.userId === session.userId)
        .map((membership) => membership.companyId)
    ).size;
    const companyRole = getUserCompanyRole(
      session.userId,
      companyId,
      companyMemberships ?? []
    );
    const isGlobalSuperadmin = currentUser?.isGlobalSuperadmin === true;
    const canViewCompanySummary =
      companyRole === 'admin' ||
      companyRole === 'executive' ||
      (isGlobalSuperadmin && (projects?.length ?? 0) > 0);
    const canAccessSettings =
      isGlobalSuperadmin ||
      companyRole === 'admin' ||
      companyRole === 'executive' ||
      companyRole === 'management';
    const canManageCompanyMembers =
      isGlobalSuperadmin || companyRole === 'admin';
    const canManageCompanyDefaults =
      isGlobalSuperadmin ||
      companyRole === 'admin' ||
      companyRole === 'executive';
    const canExportCompany =
      isGlobalSuperadmin ||
      companyRole === 'admin' ||
      companyRole === 'executive';
    const canCreateProjects =
      isGlobalSuperadmin ||
      companyRole === 'admin' ||
      companyRole === 'executive';

    return {
      companyName: company?.name ?? null,
      companyRole,
      isGlobalSuperadmin,
      userCompanyCount,
      canCreateProjects,
      canViewCompanySummary,
      canAccessSettings,
      canManageCompanyMembers,
      canManageCompanyDefaults,
      canExportCompany,
      companyDefaultsCategoryCount: companyDefaults?.categories.length ?? 0,
      companyDefaultsSubCategoryCount:
        companyDefaults?.subCategories.length ?? 0,
      companyDefaultsMappingRuleCount:
        companyDefaults?.mappingRules.length ?? 0,
    };
  },
});
