import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';

const companyDashboardSearchSchema = z
  .object({
    tab: z.enum(['summary', 'projects', 'settings']).optional(),
    exportJob: z.string().trim().min(1).optional(),
    review: z.enum(['rule-suggestions']).optional(),
  })
  .catch({});

export const Route = createFileRoute('/_authed/c/$companyId/')({
  validateSearch: (search) => companyDashboardSearchSchema.parse(search),
  component: lazyRouteComponent(() => import('../pages/CompanyDashboardPage')),
  ssr: true,
});
