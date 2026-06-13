import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { isServerAuthMode } from './-authMode';

const companyDashboardSearchSchema = z
  .object({
    tab: z.enum(['summary', 'projects', 'settings']).optional(),
    exportJob: z.string().trim().min(1).optional(),
  })
  .catch({});

export const Route = createFileRoute('/_authed/c/$companyId/')({
  validateSearch: (search) => companyDashboardSearchSchema.parse(search),
  component: lazyRouteComponent(() => import('../pages/CompanyDashboardPage')),
  ssr: isServerAuthMode,
});
