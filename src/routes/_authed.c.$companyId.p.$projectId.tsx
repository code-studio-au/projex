import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import type { UserId } from '../types';
import { asCompanyId, asProjectId } from '../types';
import { getUserCompanyRole } from '../store/access';
import { can } from '../utils/auth';
import { parseProjectWorkspaceSearch } from './-routeSearchValidation';

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  validateSearch: parseProjectWorkspaceSearch,
  component: lazyRouteComponent(() => import('../pages/ProjectWorkspacePage')),
  ssr: true,
  loader: async ({ context, params }) => {
    const [
      { budgetsQueryOptions },
      { allCompanyMembershipsQueryOptions, myProjectMembershipsQueryOptions },
      { currentUserQueryOptions },
      { companyQueryOptions, companySummaryQueryOptions, projectQueryOptions },
      { sessionQueryOptions },
      { categoriesQueryOptions, subCategoriesQueryOptions },
    ] = await Promise.all([
      import('../queries/budgets'),
      import('../queries/memberships'),
      import('../queries/account'),
      import('../queries/reference'),
      import('../queries/session'),
      import('../queries/taxonomy'),
    ]);
    const companyId = asCompanyId(params.companyId);
    const projectId = asProjectId(params.projectId);
    const session = (context.queryClient.getQueryData(
      sessionQueryOptions().queryKey
    ) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))) as {
      userId: UserId;
    } | null;
    if (!session?.userId) return null;

    const [company, companyMemberships, myProjectMemberships, currentUser] =
      await Promise.all([
        context.queryClient.ensureQueryData(
          companyQueryOptions(session.userId, companyId)
        ),
        context.queryClient.ensureQueryData(
          allCompanyMembershipsQueryOptions(session.userId)
        ),
        context.queryClient.ensureQueryData(
          myProjectMembershipsQueryOptions(session.userId, companyId)
        ),
        context.queryClient.ensureQueryData(
          currentUserQueryOptions(session.userId)
        ),
      ]);

    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(session.userId, projectId)
    );

    if (project?.projectType === 'project') {
      await Promise.all([
        context.queryClient.ensureQueryData(
          budgetsQueryOptions(session.userId, projectId)
        ),
        context.queryClient.ensureQueryData(
          categoriesQueryOptions(session.userId, projectId)
        ),
        context.queryClient.ensureQueryData(
          subCategoriesQueryOptions(session.userId, projectId)
        ),
      ]);
    }

    const companySummary =
      project?.projectType === 'programme'
        ? await context.queryClient.ensureQueryData(
            companySummaryQueryOptions(session.userId, companyId)
          )
        : null;

    const isGlobalSuperadmin = currentUser?.isGlobalSuperadmin === true;
    const companyRole = getUserCompanyRole(
      session.userId,
      companyId,
      companyMemberships ?? []
    );
    const canViewProgrammeSummary =
      companyRole === 'admin' ||
      companyRole === 'executive' ||
      isGlobalSuperadmin;
    const canImport = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'project:import',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });
    const canEditBudgets = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'budget:edit',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });
    const canEditTaxonomy = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'taxonomy:edit',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });
    const canProjectEdit = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'project:edit',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });
    const canEditCompanyStructure = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'project:configure',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });
    const canEditTxns = can({
      userId: session.userId,
      companyId,
      projectId,
      action: 'txns:edit',
      isGlobalSuperadmin,
      companyMemberships: companyMemberships ?? [],
      projectMemberships: myProjectMemberships ?? [],
    });

    return {
      companyName: company?.name ?? null,
      projectName: project?.name ?? null,
      projectType: project?.projectType ?? 'project',
      currencyCode: project?.currency ?? 'AUD',
      projectVisibility: project?.visibility ?? 'private',
      parentProjectId: project?.parentProjectId ?? null,
      allowSuperadminAccess: project?.allowSuperadminAccess ?? false,
      allowTxnTransfers: project?.allowTxnTransfers ?? false,
      projectBudgetTotalCents: project?.budgetTotalCents ?? 0,
      isGlobalSuperadmin,
      canViewProgrammeSummary,
      initialProgrammeSummary:
        project?.projectType === 'programme'
          ? ((companySummary?.projects ?? []).find(
              (candidate) => candidate.id === projectId
            ) ?? null)
          : null,
      canImport,
      canEditBudgets,
      canEditTxns,
      canEditTaxonomy,
      canProjectEdit,
      canEditCompanyStructure,
    };
  },
});
