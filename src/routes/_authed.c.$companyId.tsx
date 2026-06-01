import { Outlet, createFileRoute } from '@tanstack/react-router';
import { isServerAuthMode } from './-authMode';
import type { UserId } from '../types';
import { asCompanyId } from '../types';
import { allCompanyMembershipsQueryOptions, myProjectMembershipsQueryOptions } from '../queries/memberships';
import {
  companiesQueryOptions,
  companyQueryOptions,
  projectsQueryOptions,
  usersQueryOptions,
} from '../queries/reference';
import { companyDefaultsQueryOptions } from '../queries/taxonomy';
import { importRulesQueryOptions } from '../queries/importRules';
import { sessionQueryOptions } from '../queries/session';

export const Route = createFileRoute('/_authed/c/$companyId')({
  component: Outlet,
  ssr: isServerAuthMode,
  loader: async ({ context, params }) => {
    const companyId = asCompanyId(params.companyId);
    const session = (
      context.queryClient.getQueryData(sessionQueryOptions().queryKey) ??
      (await context.queryClient.ensureQueryData(sessionQueryOptions()))
    ) as { userId: UserId } | null;
    if (!session?.userId) return null;

    await Promise.all([
      context.queryClient.ensureQueryData(usersQueryOptions(session.userId)),
      context.queryClient.ensureQueryData(companiesQueryOptions(session.userId)),
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

    return null;
  },
});
