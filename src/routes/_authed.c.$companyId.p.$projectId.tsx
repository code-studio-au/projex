import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import type { UserId } from '../types';
import { asCompanyId, asProjectId } from '../types';
import { getUserCompanyRole } from '../store/access';
import { can } from '../utils/auth';
import { budgetsQueryOptions } from '../queries/budgets';
import { importCandidatesQueryOptions } from '../queries/importCandidates';
import {
  allCompanyMembershipsQueryOptions,
  myProjectMembershipsQueryOptions,
} from '../queries/memberships';
import { currentUserQueryOptions } from '../queries/account';
import {
  companyQueryOptions,
  companySummaryQueryOptions,
  projectQueryOptions,
} from '../queries/reference';
import { sessionQueryOptions } from '../queries/session';
import {
  categoriesQueryOptions,
  subCategoriesQueryOptions,
} from '../queries/taxonomy';
import { transactionCommentSummariesQueryOptions } from '../queries/transactionComments';

const quarterSchema = z.enum(['Q1', 'Q2', 'Q3', 'Q4']);

const projectWorkspaceSearchSchema = z
  .object({
    tab: z.enum(['budget', 'transactions', 'import', 'settings']).optional(),
    year: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    quarter: quarterSchema.optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    view: z
      .enum(['all', 'uncoded', 'auto-mapped-pending', 'assigned-to-me'])
      .optional(),
    commentTxn: z.string().trim().min(1).optional(),
    commentId: z.string().trim().min(1).optional(),
    source: z.enum(['company-summary']).optional(),
    focus: z
      .enum(['budget', 'actual', 'remaining', 'uncoded', 'health'])
      .optional(),
    drilldownKind: z.enum(['category', 'subcategory']).optional(),
    categoryId: z.string().trim().min(1).optional(),
    subCategoryId: z.string().trim().min(1).optional(),
    categoryName: z.string().trim().min(1).optional(),
    subCategoryName: z.string().trim().min(1).optional(),
  })
  .catch({});

function projectWorkspaceLoaderDeps(
  search: z.infer<typeof projectWorkspaceSearchSchema>
) {
  return {
    tab: search.tab,
    year: search.year,
    quarter: search.quarter,
    month: search.month,
    view: search.view,
    commentTxn: search.commentTxn,
    commentId: search.commentId,
    source: search.source,
    focus: search.focus,
    drilldownKind: search.drilldownKind,
    categoryId: search.categoryId,
    subCategoryId: search.subCategoryId,
    categoryName: search.categoryName,
    subCategoryName: search.subCategoryName,
  } as const;
}

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  validateSearch: (search) => projectWorkspaceSearchSchema.parse(search),
  loaderDeps: ({ search }) => projectWorkspaceLoaderDeps(search),
  component: lazyRouteComponent(() => import('../pages/ProjectWorkspacePage')),
  ssr: true,
  loader: async ({ context, params, deps }) => {
    const companyId = asCompanyId(params.companyId);
    const projectId = asProjectId(params.projectId);
    const search = deps;
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
        context.queryClient.ensureQueryData(
          transactionCommentSummariesQueryOptions(session.userId, projectId)
        ),
      ]);
    }

    const companySummary =
      project?.projectType === 'programme'
        ? await context.queryClient.ensureQueryData(
            companySummaryQueryOptions(session.userId, companyId)
          )
        : null;

    if (project?.projectType !== 'programme') {
      if (search.tab === 'import') {
        await context.queryClient.ensureQueryData(
          importCandidatesQueryOptions(session.userId, projectId)
        );
      }
    }

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
