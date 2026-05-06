import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { isServerAuthMode } from './-authMode';

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
});
