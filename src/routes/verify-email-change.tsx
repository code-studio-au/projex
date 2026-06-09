import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/verify-email-change')({
  validateSearch: z.object({
    token: z.string().trim().optional().catch(''),
  }),
  component: lazyRouteComponent(() => import('../pages/VerifyEmailChangePage')),
});
