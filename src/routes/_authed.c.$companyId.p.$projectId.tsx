import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { isServerAuthMode } from './-authMode';
import type { TxnListPageInput } from '../api/contract';
import type { UserId } from '../types';
import { asCompanyId, asProjectId } from '../types';
import { budgetsQueryOptions } from '../queries/budgets';
import { importCandidatesQueryOptions } from '../queries/importCandidates';
import { myProjectMembershipsQueryOptions } from '../queries/memberships';
import {
  companyQueryOptions,
  companySummaryQueryOptions,
  projectQueryOptions,
  projectsQueryOptions,
} from '../queries/reference';
import { sessionQueryOptions } from '../queries/session';
import {
  categoriesQueryOptions,
  subCategoriesQueryOptions,
} from '../queries/taxonomy';
import { transactionCommentSummariesQueryOptions } from '../queries/transactionComments';
import { transactionsPageQueryOptions } from '../queries/transactions';

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
  })
  .catch({});

export const Route = createFileRoute('/_authed/c/$companyId/p/$projectId')({
  validateSearch: (search) => projectWorkspaceSearchSchema.parse(search),
  component: lazyRouteComponent(() => import('../pages/ProjectWorkspacePage')),
  ssr: isServerAuthMode,
  loader: async ({ context, params, location }) => {
    const companyId = asCompanyId(params.companyId);
    const projectId = asProjectId(params.projectId);
    const search = projectWorkspaceSearchSchema.parse(location.search);
    const session = (
      context.queryClient.getQueryData(sessionQueryOptions().queryKey) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))
    ) as { userId: UserId } | null;
    if (!session?.userId) return null;

    await Promise.all([
      context.queryClient.ensureQueryData(
        companyQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        projectsQueryOptions(session.userId, companyId)
      ),
      context.queryClient.ensureQueryData(
        myProjectMembershipsQueryOptions(session.userId, companyId)
      ),
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

    const project = await context.queryClient.ensureQueryData(
      projectQueryOptions(session.userId, projectId)
    );

    const transactionsPageInput: TxnListPageInput = {
      pageIndex: 0,
      pageSize: 25,
      sort: { field: 'date', direction: 'desc' },
      yearFilter: search.year ?? null,
      quarterFilter: search.quarter ?? null,
      monthFilterKey: search.month ?? null,
      transactionView: search.view ?? 'all',
    };

    await context.queryClient.ensureQueryData(
      transactionsPageQueryOptions(
        session.userId,
        projectId,
        transactionsPageInput
      )
    );

    if (search.tab === 'import') {
      await context.queryClient.ensureQueryData(
        importCandidatesQueryOptions(session.userId, projectId)
      );
    }

    if (project?.projectType === 'programme') {
      await context.queryClient.ensureQueryData(
        companySummaryQueryOptions(session.userId, companyId)
      );
    }

    return null;
  },
});
